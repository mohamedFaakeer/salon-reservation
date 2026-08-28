# CLAUDE.md — Working Agreement for This Repository

**Project:** Salon Reservation SaaS MVP (multi-tenant, unisex salons, Sri Lanka)
**Read first, then:** `docs/PRD.md` → `docs/ARCHITECTURE.md` → `docs/DATABASE.md` → `docs/API.md` → `docs/SECURITY.md` → `docs/UX.md` → `docs/DEVELOPMENT_PLAN.md` → `docs/DEPLOYMENT.md` → `docs/DECISIONS.md`

---

## 1. Non-Negotiable Product Rules

1. **ONE availability engine.** Every booking source (online, receptionist, walk-in, phone, WhatsApp) calls the same server-side engine and creates the same Appointment entity. Never build separate booking logic.
2. **Availability is never computed on the frontend.** All availability/pricing/refund logic lives server-side, in exactly one place each.
3. **Double-booking is prevented by the database** (PostgreSQL GiST exclusion constraints over staff + time ranges for active appointments and held slots), never by "check then insert" alone. See `docs/DATABASE.md` §3.
4. **Holds:** 10-minute temporary slot hold. Successful payment converts hold → confirmed appointment in the **same transaction**. Expired holds are released by a scheduled job.
5. **Historical records are immutable.** `AppointmentService` snapshots service name/price/duration at booking. Service price/duration changes never alter existing appointments. Never reconstruct history from current Service rows.
6. **Payments are idempotent.** Every payment has a unique `idempotencyKey`; duplicate callbacks/retries create no duplicates. Payment state machine: PENDING → SUCCESS | FAILED | REQUIRES_RECONCILIATION; refunds: REFUNDED | PARTIALLY_REFUNDED.
7. **Tenant isolation is enforced at the data layer, never trusted from the client.** `tenantId` is always derived from the authenticated session or the public salon slug.
8. **No hard deletes on business records.** Cancellations, no-shows, removed services, expired holds use statuses. Preserve appointment, payment, refund, and audit rows.
9. **Cancellation & refund policy is configurable per tenant, never hard-coded.**
10. **Notifications never cancel an appointment.** Delivery failures are recorded per channel and retryable.
11. **Out of MVP scope:** payroll, full accounting, inventory, purchases, advanced CRM, marketing automation, loyalty, memberships, gift cards, AI, complex analytics, multi-country tax, equipment scheduling, marketplace commissions, full POS/ERP, native mobile apps. Real payment gateway and real SMS/WhatsApp are stubbed only. Do not build them unless explicitly approved.

---

## 2. Architecture & Stack (Approved)

- **Monorepo:** npm workspaces — `apps/api`, `apps/web`, `apps/admin`, `packages/shared`.
- **API:** NestJS 11 + TypeORM 1.x + PostgreSQL 17. REST under `/api/v1`, OpenAPI via `@nestjs/swagger` at `/api/docs`.
- **Frontends:** Next.js 16 (App Router) + Tailwind CSS 4. `apps/web` = customer (mobile-first, no login — booking by phone + reference code). `apps/admin` = salon staff (desktop/tablet-first).
- **Shared:** `packages/shared` holds enums, DTOs (class-validator), types, constants.
- **Multi-tenancy:** shared schema with `tenantId` column; `TenantGuard` + TypeORM tenant-scoping interceptor (defense in depth).
- **Concurrency:** GiST exclusion constraints (appointments + slot_holds), optimistic locking (`version`), advisory locks for multi-row mutations. DB, not the app, is the final arbiter.
- **Payments:** `PaymentProvider` interface. `ManualProvider` is the MVP default (record cash/bank/card). `PayHereProvider` behind a flag, never default.
- **Deploy:** Render free (3 web services) + Neon free Postgres. See `docs/DEPLOYMENT.md`.
- **No client-side business logic.** Next.js apps are presentation; all critical values (price, availability, permissions, payment status) are server-derived.

Full detail: `docs/ARCHITECTURE.md`, `docs/DATABASE.md`.

---

## 3. Stack Versions (Verified, Free Tier)

| Tool | Version | Notes |
|---|---|---|
| Node | 24.18.0 | Required (ESM-first tooling) |
| npm | 12 | Bundled with Node 24.18 |
| NestJS | 11.x | Latest major, Node 22+ req — OK |
| TypeORM | 1.1.0 | 0.3.x→1.x upgrade notes apply; brand-new project, pinned 1.1.0 |
| Next.js | 16.x | Requires Node 20.9+ — OK on 24 |
| Tailwind | 4.x | Vite-style plugin with Next; no `tailwind.config.ts` needed |
| PostgreSQL | 17 | Neon free + Docker `postgres:17-alpine`; `btree_gist` contrib |
| Vitest | 4.x | Unit + e2e (spec-compliant) |
| ESLint | 10.x | Flat config (`eslint.config.mjs`) |
| Prettier | 3.x | |

Rules: lock exact versions in `package.json` + `package-lock.json`. Do not introduce new libraries without justification; record new dependencies in `docs/DECISIONS.md`. `npm audit` must stay free of high/critical.

---

## 4. Repository Workflow & Behavior Rules (spec §46–47)

1. **Inspect before coding.** Read `CLAUDE.md`, relevant `docs/*`, affected files, and existing architecture. Do not modify unrelated files or rewrite working code unnecessarily.
2. **Ambiguous business decisions → ask first.** Never silently pick a major business rule (advance rules, refunds, cancellation windows, status semantics).
3. **Per feature:** explain → identify affected files / DB / API / UI / security → implement → typecheck → lint → test → build → review regressions → summarize.
4. **A feature is NOT done** unless the full Definition of Done checklist in `docs/DEVELOPMENT_PLAN.md` §3 is satisfied: business logic, DB, validation, authorization, tenant isolation, UI (loading/empty/error states, responsive), tests, typecheck, lint, build, docs.
5. **Never claim completion if typecheck/lint/tests/build fail.**
6. **Phase order is fixed** (P1–P19 in `docs/DEVELOPMENT_PLAN.md`). Do not skip ahead to the next phase until the current one is stable.
7. **Do not reuse separate booking logic**; the availability engine is the single path (rule §1).
8. **Commit after every important update, and always at the end of a completed phase.** Verification (typecheck/lint/test/build) must be green before that commit. Use plain `git commit` (new commits, not amends) with a message describing what changed and why.before commit show where you are going to commit. get the approval from user and then commit
9. **Pushing new migrations is not the same as running them.** Before/when pushing any change that adds or edits a file under `apps/api/src/infrastructure/database/migrations/`, explicitly check whether production (Neon, via Render) is behind: compare the migration files in the push against what's actually been applied to prod. A migration sitting only in git is a live outage waiting to happen the moment the matching code deploys (a route/service that queries a table that doesn't exist yet in prod) — this already happened once (customer-auth signup, and separately a full notifications-engine migration set, both shipped to prod code without their migrations ever being run). Flag it to the user and get their go-ahead to run `npm run db:migrate:prod` (or walk them through doing it) as part of that same push — don't treat "pushed to main" as "done" when a migration is part of the change.

---

## 5. Code Standards

- **TypeScript strict everywhere. No `any` without justification** + a comment. Where a workaround needs `any`, isolate and document it.
- **Structure:** Controllers = thin HTTP layer; Services = business logic; Domains = pure functions; Repositories = data access.
- **Single source of truth:** `AvailabilityService`, `PricingService`, `RefundCalculator` each exist once. No duplicated logic inline.
- **DTOs in `packages/shared`** (class-validator), required on every body/query; global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
- **Money:** integer cents everywhere (`priceCents`, `totalCents`, …). LKR rounding rule per `docs/DATABASE.md` §5. No floats.
- **Time:** `timestamptz` in DB (UTC); app-layer timezone `Asia/Colombo` for slot generation; dates as `YYYY-MM-DD`.
- **Errors:** consistent envelope per `docs/API.md` §7 with actionable `code` + `message`. Never "Something went wrong."
- **Tests:** Vitest. Availability, concurrency, payment, lifecycle, and security matrices defined in `docs/DEVELOPMENT_PLAN.md` §2 — all required.
- **Formatting/lint:** shared Prettier + ESLint flat config; format before commit.

---

## 6. Security Checklist (Every Feature)

- [ ] Tenant scoping applied (guard + interceptor) — never client-provided `tenantId`
- [ ] Roles enforced server-side (not just hidden UI)
- [ ] Validation rejects unexpected fields / wrong enums / oversized strings
- [ ] Client values like price, availability, payment status never trusted
- [ ] Idempotency keys on booking/payment POSTs
- [ ] No secrets in client bundles or commits; all in env
- [ ] Rate limiting where abuse possible (auth, booking, payment, availability)
- [ ] Audit log entries for: appointment created/cancelled/rescheduled, payment recorded, refund initiated, service price changed, schedule/leave changed

Full threat model: `docs/SECURITY.md`.

---

## 7. Tests That Must Always Pass

- Availability matrix (§2.1): working hours, breaks, leave, closures, qualifications, multi-service duration, ANY-staff aggregation, boundary conditions.
- Concurrency (§2.2): two simultaneous bookings, receptionist+customer race, reschedule race, duplicate callbacks, idempotent retries.
- Payment edge cases (§2.3): success-before-create-failure, delayed callback, browser close (hold expiry), duplication, callback twice, slot expiry while processing, refund success/failure.
- Appointment lifecycle (§2.4): cancel, reschedule, no-show, late arrival, walk-in, receptionist booking, add/remove services.
- Security (§2.5 / SECURITY.md §11): cross-tenant read/write, forged tenantId/price/ownership, role abuse, tampered JWT, duplicate callbacks.

---

## 8. Definition of Done (MVP) — `docs/DEVELOPMENT_PLAN.md` §8

- [ ] P1–P19 completed in order
- [ ] All test matrices green
- [ ] Availability engine is the single path for every source
- [ ] No double-booking possible (exclusion constraints + tests)
- [ ] Payments idempotent; §15 edge cases tested
- [ ] Tenant isolation verified (S1–S3)
- [ ] Live demo on Render + Neon: customer books <60 s; receptionist manages day
- [ ] Docs current; pre-deployment security checklist (SECURITY.md §13) done

---

## 9. Fast Reference

| Need | Where |
|---|---|
| Product scope & rules | `docs/PRD.md` |
| Architecture & flows | `docs/ARCHITECTURE.md` |
| Data model & constraints | `docs/DATABASE.md` |
| REST contract & errors | `docs/API.md` |
| Security & threat model | `docs/SECURITY.md` |
| UX/UI spec | `docs/UX.md` |
| Build order & test matrix | `docs/DEVELOPMENT_PLAN.md` |
| Deploy (Render + Neon) | `docs/DEPLOYMENT.md` |
| Product decisions & rationale | `docs/DECISIONS.md` |
| Working agreement (this file) | `CLAUDE.md` |