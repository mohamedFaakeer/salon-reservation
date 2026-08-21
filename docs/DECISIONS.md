# DECISIONS.md — Architecture & Product Decision Log

This document is the single source of truth for every architectural and product decision made for the Salon Reservation SaaS MVP. It also contains the **verified dependency compatibility ledger** (checked against the npm registry and official package metadata on 2026-08-08) that every future change must respect.

---

## 1. Product Decisions (Resolved with Product Owner)

| # | Decision area | Resolution |
|---|---|---|
| Q1 | Technology stack | NestJS 11 + TypeORM 1.x + PostgreSQL · Next.js 16 (customer + admin apps) · Tailwind CSS 4 · npm workspaces · self-hosted auth (argon2 + jose, httpOnly JWT) |
| Q2 | Customer account model | **Booking reference only.** Name + phone (+ optional email). No OTP, no password, no account. Customer manages appointments via phone + booking reference code. Data model keeps room to add OTP accounts later without schema changes. |
| Q3 | Online payments | **Record-only.** Advances are recorded manually by staff (cash / bank transfer / card captured via WhatsApp). Full `PaymentProvider` abstraction layer is built; **PayHere adapter stub** behind a feature flag. Demo runs on a simulated/manual provider. |
| Q4 | Notifications | **Log (console) + email only.** Full notification tracking/state machine/retry logic implemented. `SmsProvider` / `WhatsAppProvider` interfaces exist; real aggregator = one adapter class. Zero external cost in demo. |
| Q5 | Booking window | **30 days ahead** (salon-configurable). Same-day booking allowed with **2-hour lead time** (salon-configurable). No booking into the past. Holidays/closures excluded automatically. Server-side enforced. |
| Q6 | "Any Available Staff" | **Auto-assign earliest available qualified staff at booking.** Customer sees "10:00 — Kasun". Salon may reassign later via the availability engine (reassignment is concurrency-safe). |
| Q7 | Salon onboarding | **Super-admin provisioning + one-click demo seeding.** No public self-serve signup in MVP. Data model keeps room for self-serve later. |
| Q8 | Staff leave/availability management | **MANAGER / OWNER only.** STAFF role sees own schedule + appointments but cannot modify leave/schedules. Staff self-service request flow deferred; schema does not preclude it. |
| Q9 | Cancellation / reschedule defaults | Self-service cancel/reschedule cutoff **2h before start**. Refund policy: **100% refund ≥24h before start, 0% <24h, 0% no-show**. No-show grace **15 min** (auto-convert flag-driven). All salon-configurable per tenant. |
| Q10 | Demo deployment | **Deployed on free tier: Render (free web services) + Neon (Postgres free tier).** Docker Compose provided for local dev; codebase 100% deployable. |

---

## 2. Verified Dependency Ledger (2026-08-08)

Verified live from the npm registry (`npm view <pkg> version engines peerDependencies`).

| Package | Version | License | Node requirement | Compatibility status |
|---|---|---|---|---|
| `@nestjs/core` | 11.1.28 | MIT | `>= 20` | ✓ with Node 24.18.0 |
| `@nestjs/common` | 11.1.28 | MIT | — | ✓ |
| `@nestjs/platform-express` | 11.1.28 | MIT | — | ✓ |
| `@nestjs/typeorm` | 11.0.3 | MIT | — | ✓ official Nest 11 pairing |
| `@nestjs/config` | 4.0.4 | MIT | — | ✓ |
| `@nestjs/schematics` | 11.1.0 | MIT | — | ✓ |
| `@nestjs/cli` | 11.0.24 | MIT | — | ✓ |
| `@nestjs/testing` | 11.1.28 | MIT | — | ✓ |
| `@nestjs/swagger` | 11.4.6 | MIT | — | ✓ |
| `@nestjs/schedule` | 6.1.3 | MIT | — | ✓ |
| `@nestjs/jwt` | 11.0.2 | MIT | — | ✓ (for refresh tokens) |
| `typeorm` | 1.1.0 | MIT | `^20.19.0 \|\| ^22.13.0 \|\| >=24.11.0` | ✓ satisfies @nestjs/typeorm peer `^0.3.0 \|\| ^1.0.0-dev` |
| `pg` | 8.22.0 | MIT | — | ✓ satisfies TypeORM peer `^8.5.1` |
| `@types/pg` | 8.21.0 | MIT | — | ✓ |
| `next` | 16.3.0 | MIT | `>=20.9.0` | ✓ |
| `react` | 19.2.8 | MIT | — | ✓ satisfies Next 16 peer `^18.2.0 \|\| ^19.0.0` |
| `react-dom` | 19.2.8 | MIT | — | ✓ |
| `@types/react` | 19.2.18 | MIT | — | ✓ |
| `@types/react-dom` | 19.2.4 | MIT | — | ✓ |
| `tailwindcss` | 4.3.3 | MIT | — | ✓ |
| `@tailwindcss/postcss` | 4.3.3 | MIT | — | ✓ (official Next 16 PostCSS plugin) |
| `typescript` | **5.9.3** | Apache-2.0 | — | ⚠️ see note below |
| `rxjs` | 7.8.2 | Apache-2.0 | — | ✓ satisfies NestJS peer `^7.1.0` |
| `reflect-metadata` | ^0.2.x (pin latest 0.2) | Apache-2.0 | — | ✓ satisfies NestJS peer `^0.1.12 \|\| ^0.2.0` |
| `class-validator` | 0.15.1 | MIT | — | ✓ |
| `class-transformer` | 0.5.1 | MIT | — | ✓ |
| `argon2` | 0.45.1 | MIT | — | ✓ (native; prebuilt binaries) |
| `jose` | 6.2.8 | MIT | — | ✓ (JWT) |
| `vitest` | 4.1.10 | MIT | — | ✓ |
| `supertest` | 7.2.2 | MIT | — | ✓ |
| `eslint` | 10.8.1 | MIT | — | ✓ |
| `prettier` | 3.9.6 | MIT | — | ✓ |
| `nodemailer` | 9.0.5 | MIT-0 | `>=6.0.0` | ✓ (P15 — `EmailNotificationProvider`) |
| `@types/nodemailer` | 8.0.1 | MIT | — | ✓ |

### ⚠️ TypeScript version pin — CRITICAL

- npm `latest` for TypeScript is **7.0.2** (the new Go-native compiler rewrite, released to `latest` tag).
- NestJS 11, TypeORM 1.x, ts-node, ts-jest, and the Next.js toolchain are built for the **TypeScript 5.x line**. TS 7 compatibility is not yet guaranteed across this toolchain.
- **Decision: pin `typescript@5.9.3`** (latest stable 5.x) in all workspaces.
- Revisit only after NestJS / TypeORM / Next officially announce TS 7 support.

### Peer-dependency pairing summary

- `@nestjs/core@11` requires peers: `@nestjs/common@11`, `@nestjs/platform-express@11`, `@nestjs/websockets@11`, `@nestjs/microservices@11`, `reflect-metadata`, `rxjs@^7.1.0` → all satisfied.
- `@nestjs/typeorm@11` requires: `@nestjs/common@^10||^11`, `@nestjs/core@^10||^11`, `reflect-metadata`, `rxjs@^7.2.0`, `typeorm@^0.3.0 || ^1.0.0-dev` → all satisfied (typeorm 1.1.0 satisfies `>=1.0.0-dev <2.0.0`).
- `next@16` requires: `react@^18.2.0 || ^19.0.0`, `react-dom@^18.2.0 || ^19.0.0` → satisfied.

### Node runtime

- Local machine: **Node v24.18.0, npm 12.0.1** (pnpm is NOT installed — **npm workspaces** is the monorepo tool, no extra global installs).
- `engines` field in root `package.json` will declare `"node": ">=24.11.0"` (floor set by TypeORM 1.1.0) and `"packageManager": "npm@12.0.1"`.

---

## 3. Free-Tier Verification

| Resource | Free tier | Notes for demo |
|---|---|---|
| PostgreSQL (local dev) | Docker Compose `postgres:17-alpine` — free | `btree_gist` extension ships in contrib |
| Neon Postgres (deployed) | Free tier: 0.5 GB storage, autosuspend after inactivity | Add `EXTENDED_QUERY_TIMEOUT` if needed; cold-ish resume on first query |
| Render (deployed) | Free web services: 512 MB RAM, spins down after 15 min idle | Cold start ~30–60 s; warm before demo |
| npm packages | All MIT/Apache-2.0 | No paid subscriptions |
| SMTP (email) | Gmail/Outlook app password (free) or console/log provider (zero cost) | `ConsoleProvider` guaranteed offline demo |
| SMS/WhatsApp | Not used in MVP (interface only) | Real aggregators cost money — explicitly deferred |

---

## 4. Rules for Future Development

1. **One availability engine.** Every booking source calls the same NestJS `AvailabilityService`. Never fork booking logic per channel.
2. **Pricing, cancellation/refund, permissions, tenantId = server-side only.** Frontends display; they never decide.
3. **Historical records are immutable.** `AppointmentService` stores name/duration/price snapshots. Never reconstruct historical totals from current `Service` rows.
4. **Double-booking is prevented by the database** (GiST exclusion constraints), never by app logic alone.
5. **Payments are idempotent.** Every payment has a unique `idempotencyKey`. Duplicate callbacks are impossible by constraint.
6. **Tenant isolation is enforced at the data-access layer** (TenantGuard + TypeORM global scoping interceptor), never trusted from the client.
7. **TypeScript pinned to 5.9.x** until TS 7 support is official across the toolchain.
8. **npm workspaces**, not pnpm (not installed on the demo machine). No new globals without justification.
9. **No libraries added without justification** (spec §46). New deps require a note in this ledger.
10. **Definition of Done (spec §48)** gates every feature: logic, DB, validation, auth, tenant isolation, UI states, responsive, tests, typecheck, lint, build, docs.

---

## 5. Security Decisions — Token Sessions (2026-08-10)

**Motivation.** Self-hosted auth (Q1) needs refresh-token rotation + theft detection without bringing in a full identity provider.

1. **Raw refresh token is never stored.** `refresh_session.tokenHash` stores only the SHA-256 hex digest of the 32-random-byte (`base64url`) opaque token. A DB leak cannot be replayed as live sessions; hash lookups still indexable (unique index).
2. **Rotation on every refresh.** `POST /auth/refresh` verifies the presented token, then marks the old row `revokedAt = now()` + `replacedBySessionId = <new sid>` and issues a new refresh token + access token. The old token is single-use by construction.
3. **Reuse detection revokes the whole family.** Presenting an already-rotated/revoked token means it leaked — the service revokes every active session for that user (`UPDATE refresh_session SET revokedAt = now() WHERE userId = ? AND revokedAt IS NULL`) and returns `401 UNAUTHENTICATED`. This kills a stolen session chain the moment the attacker replays an old token.
4. **Expired sessions** are rejected with `401 TOKEN_EXPIRED` and cleaned up by a scheduled sweeper (`cleanupExpired`); revoked+expired rows are deleted in the same sweep.
5. **Cookie + body dual transport.** Refresh token is set as an HttpOnly cookie (`AUTH_COOKIE_NAME`, `sameSite=strict`, `secure` in production, 7-day maxAge) and may also be supplied in the request body — the body path covers Next.js SSR/proxy contexts where cookie forwarding is awkward. Access token is returned in the body (never in an HttpOnly cookie) so the Next.js admin app can attach `Authorization: Bearer` for SSR.

### Auth module structure

- `AuthController` (`POST /auth/login|refresh|logout`, all `@Public()`) — thin HTTP layer: reads cookie/body token, sets/clears the cookie.
- `AuthService` — orchestrates login (password verify → session create), refresh (session rotate → token issue), logout (session revoke).
- `PasswordService` — argon2id hash/verify (from Q1).
- `SessionService` — refresh-session lifecycle: `createSession`, `rotate`, `revoke`, `buildSessionUser`, `cleanupExpired`; owns the SHA-256 hashing and the reuse-detection family revoke.
- `TokenService` — issues/verifies the short-lived access JWT (`JWT_SECRET`, jose), cookie name from `AUTH_COOKIE_NAME`.
- `JwtAuthGuard` + `PublicDecorator` — route protection; `ApiExceptionFilter` normalizes `ApiError` into the §7 envelope of API.md.
- Vitest note: API specs use **pure globals** (`describe/it/expect/vi`) with `globals: true` in `vitest.config.mts` and `"types": ["vitest/globals"]` in `tsconfig.json`. Never mix an explicit `import { describe } from "vitest"` with config-injected globals in the same worker — it caused `Vitest failed to find the current suite` (`Cannot read properties of undefined (reading 'config')`) via dual vitest copies in the npm-workspaces hoist.

---

## 6. RBAC, Guard Order & Super-Admin Provisioning (2026-08-11)

**Motivation.** P4 (RBAC) was the next fixed-order phase (`DEVELOPMENT_PLAN.md`). While building it, two pre-existing gaps surfaced and were closed in the same pass rather than left as silent debt.

1. **Permission-map location & guard order.** `Permission` enum + `ROLE_PERMISSIONS` map (API.md §5) live in `apps/api/src/common/authorization/` — API-only, **not** `packages/shared`. The capability map is enforcement logic, not identity data; CLAUDE.md forbids client-side business/authorization logic, and `apps/web` (public, no-login) has no business knowing the full admin permission matrix. The existing `roles: string[]` on the login response remains the frontends' hook for any future UI hinting. `RolesGuard` is a third global `APP_GUARD`, registered by a new `AuthorizationModule` imported in `app.module.ts` immediately after `TenantModule` — Nest resolves multiple `APP_GUARD` providers in module-import order, giving the chain `JwtAuthGuard → TenantGuard → RolesGuard`.
2. **`@Permissions(a, b, ...)` uses OR semantics** — the caller needs any one of the listed permissions. Every route in this pass only ever lists one; OR is the documented default for any future multi-permission route.
3. **`PATCH /tenant/:id/status`** stays exactly where it was (arbitrary `:id`, in `TenantController`) — decided **not** to relocate it under `/super-admin`. It is now gated `@Permissions(Permission.PLATFORM_ADMIN)`. Before this it had **zero** role guard: any authenticated tenant user (including STAFF) could suspend or activate any tenant by ID. One decorator closes the hole.
4. **SUPER_ADMIN role-detection gap (found while building this, not a new design choice).** `SessionService.buildSessionUser()` derived JWT `roles` only from `user_tenant_role` rows, but that table's `tenantId` column is `NOT NULL` — a tenant-less platform role can't live there, and the initial migration never inserted one for `super.admin@salon.local`. Result: that account has always logged in with `roles: []`, meaning no `SUPER_ADMIN`-gated route could ever have worked for it. Fixed with a new `User.isSuperAdmin` boolean column (backfilled for the seeded platform account), merged into the JWT roles array by `buildSessionUser`. Flagged as a latent P2/P3 gap, surfaced by P4.
5. **P3's missing SUPER_ADMIN provisioning endpoint is now built**, closing that phase's outstanding deliverable: `POST /super-admin/tenants` (provision tenant + default branch + OWNER user, one DB transaction so a taken owner email never leaves an orphan tenant behind) and `GET /super-admin/tenants` (paginated list), both `@Permissions(Permission.PLATFORM_ADMIN)`. `TenantService.createTenant` gained an optional `manager?: EntityManager` parameter so `SuperAdminService` can compose it inside that transaction — single source of truth for tenant creation preserved rather than duplicated.
6. **`POST /super-admin/tenants/:id/demo-seed` is explicitly out of scope**, deferred to P19 — `seed-demo.ts` remains a placeholder; no real seed data (services/staff/schedules) exists yet to seed with.
7. **S6 (STAFF mutates another staff's appointment → 403) is deferred to P10.** No Appointment resource exists yet; ownership checks can't be expressed by a role→permission map and must live in the service layer once Appointment exists. Documented in code at `apps/api/test/rbac.e2e-spec.ts` and in `role-permissions.ts`'s comment on `MANAGE_OWN_APPOINTMENT`.
8. **Audit-log gap, explicitly tracked, not silently dropped.** No `AuditLog` entity/table exists anywhere in the codebase yet. `SECURITY.md` §3 calls for super-admin operations to carry "an explicit audit event" — `SuperAdminService.provisionTenant` and the newly-guarded `setStatus` are **not** audited by this work. To be closed when the audit log is built (unscheduled phase; `DATABASE.md` §2 already documents the target `audit_log` schema).
9. **New dependency**: `class-transformer@^0.5.1` added to `packages/shared` (same pinned version already used by `apps/api`; already present in the workspace hoist via Nest's own dependency chain) — needed for `@Type(() => Number)` query-string coercion in the new `PaginationQueryDto`, the first shared pagination-query DTO, intended for reuse by every future list endpoint (services/staff/appointments/customers).
10. **Fixed a silently-dead test file, and two bugs it had been hiding.** `apps/api/test/auth.e2e` was missing the `.ts` extension, so `tsconfig.e2e.json`'s `include: ["test/**/*.ts"]` never picked it up — these auth e2e tests (P2's own stated exit criterion) had never actually run. Renamed to `auth.e2e-spec.ts`; added the previously-missing S10 (tampered JWT signature → 401) and S11 (expired access token → 401, refresh recovers) cases. Running it for the first time surfaced two further pre-existing gaps in every e2e spec's `before()` bootstrap (all three files, none of which had ever executed against these code paths before): (a) `app.useGlobalFilters(new ApiExceptionFilter())` was never called, so thrown `ApiError`s fell through to Nest's default `BaseExceptionFilter`, which happens to preserve the right HTTP status (via its `isHttpError` duck-typing on `.statusCode`/`.message`) but drops the `code` field entirely; (b) `app.use(cookieParser())` was never called, so `req.cookies` was always `undefined` and every refresh-token-via-cookie flow silently fell through to "Missing refresh token." Both now match `main.ts`'s real bootstrap in all three spec files (`app.e2e-spec.ts`, `auth.e2e-spec.ts`, `rbac.e2e-spec.ts`).

---

## 7. Salon Setup — Settings, Branch & Closures (2026-08-11)

**Motivation.** P5 (`DEVELOPMENT_PLAN.md`) is the next fixed-order phase: real settings defaults/validation, a manageable default branch, and the `Closure` entity.

1. **`cancellationPolicy` shape** — not specified anywhere in the docs (API.md §3 only names the parent `cancellationPolicy` key). Defined as `{ selfServiceCutoffHours, refundPercentBeforeCutoff, refundPercentAfterCutoff, noShowRefundPercent }` in `packages/shared/src/tenant-settings.ts`, encoding Q9's numbers exactly (2h / 100% / 0% / 0%). Refund percents are kept separate for before/after cutoff and no-show since they can legitimately diverge per tenant.
2. **`advanceRule` defaults to `NO_ADVANCE`** for every new tenant (user decision — DECISIONS.md had no prior default). Encoded in `DEFAULT_TENANT_SETTINGS`; applied both at `TenantService.createTenant` (so `SuperAdminService.provisionTenant` gets it for free) and backfilled onto pre-existing tenants by the `SalonSetup` migration.
3. **`Closure` is hard-deletable.** `DATABASE.md` §2.2 defines no soft-delete/status column for it, and CLAUDE.md's "no hard deletes" rule (§1.8) scopes to *business records* (appointments, payments, refunds, audit) — closure is tenant scheduling config, not history. `ClosureService.remove` does a real `DELETE`.
4. **Closures reuse `Permission.MANAGE_STAFF`** — no new Permission enum value. API.md §5 bundles "Staff CRUD + staff-service + schedules + leave **+ closures**" into one OWNER/MANAGER-only capability row; the P4-built permission map already covers it.
5. **Closure `PATCH` deliberately omitted from MVP.** Only `POST`/`GET`/`DELETE` exist — three simple fields, delete+recreate is one extra round trip, and it keeps `createdAt` semantics unambiguous. Trivial to add later without a migration change.
6. **Branch endpoints are singular**: `GET/PATCH /tenant/me/branch`, not a `/branches` collection. `DATABASE.md` states MVP is single-branch-per-tenant; a collection endpoint would misrepresent that and invite building list/create routes nobody needs yet. Implemented as a small `BranchModule` (service only, no controller — routes live on `TenantController` alongside `/tenant/me/settings`, which already established that pattern).
7. **`advanceValueCents` cross-field validation deferred.** No phase yet consumes it to price anything (that's P13, `PricingService`), so a rule like "required when `advanceRule` is `FIXED_AMOUNT`/`PERCENTAGE`" would test/enforce a constraint with no current caller. P5 only stores and returns the value; it's nullable so a tenant can explicitly clear it.
8. **`ApiExceptionFilter` `VALIDATION_ERROR` gap found and fixed.** `ValidationPipe` always throws `BadRequestException`, which previously fell through to the filter's generic `HttpException` branch and emitted `code: "HTTP_400"` instead of the `VALIDATION_ERROR` promised by API.md §7 and SECURITY.md S12. Invisible until now because no strictly-validated PATCH body existed before `TenantSettingsUpdateDto`. Fixed with a dedicated `BadRequestException` branch that surfaces class-validator's constraint messages under `details.errors`. Closes S12 for the first time.
9. **Local dev-DB pollution, not a code bug.** The demo `elegance` tenant's `settings` column had accumulated a stray `testFlag` key from earlier P4-session e2e runs (predating `TenantSettingsUpdateDto`'s validation), so it was no longer `'{}'` and the migration's conditional backfill (`WHERE settings = '{}'::jsonb`) correctly skipped it — by design, so a tenant that already wrote real settings is never clobbered. Repaired directly via a one-off script against the local dev DB (not a new migration — this was test-run pollution specific to a persistent local Postgres instance, not something a fresh deploy would ever hit).

---

## 8. Services & Audit Log (2026-08-11)

**Motivation.** P6 (`DEVELOPMENT_PLAN.md`) is the next fixed-order phase: Service CRUD with audit on price/duration changes. This is also the first phase to actually need `AuditLog` — it was documented back in P2's schema (`DATABASE.md` §2.6) but never built, and was explicitly flagged as a known, tracked gap in `SuperAdminService.provisionTenant`'s own code comment when it was written in P4. Building the infrastructure now closes that gap in the same pass.

1. **Explicit `AuditService.record(...)` calls, not a generic interceptor.** `SECURITY.md` §10 originally describes an "audit interceptor" on all `TenantScoped` writes. No such interceptor, `TenantScoped` decorator, or generic diffing mechanism exists anywhere in this codebase, and building one now would be speculative — only two real call sites exist this phase (`ServiceService.update`, `SuperAdminService.provisionTenant`). Matches the codebase's established explicit-over-magic style (`TenantGuard`/`RolesGuard` are both narrowly-scoped, hand-written guards, not generic ones). Revisit once several more real call sites exist.
2. **`branchId` excluded from `CreateServiceDto`/`UpdateServiceDto`.** The column stays in the `service` table per `DATABASE.md`, but MVP is single-branch-per-tenant — same precedent as P5's branch-endpoint decision. `ServiceService.create` always sets it to `null`.
3. **Audit action naming**: `SERVICE_PRICE_CHANGED` covers both price *and* duration changes (matches `SECURITY.md`'s exact listed action string — no separate `SERVICE_DURATION_CHANGED` invented); `TENANT_PROVISIONED` for the closed P4 gap. Both SCREAMING_SNAKE_CASE per `SECURITY.md` §10's example.
4. **Closing the P4-tracked "tenant provisioned" audit gap.** `SuperAdminController.provision` now takes `@Req()` to reach the SUPER_ADMIN's own user id (`req.user.sub`) as the audit actor; `SuperAdminService.provisionTenant` writes the `TENANT_PROVISIONED` entry using the same transaction `manager` as the rest of provisioning, so it commits atomically (see point 9).
5. **DB-level `CHECK` constraints on `service.durationMin`/`priceCents`** — first entity in this codebase to get them, as defense in depth alongside DTO validation (`durationMin > 0`, `priceCents >= 0`).
6. **`audit_log` FKs (`tenantId`, `actorUserId`) are `SET NULL`, never `CASCADE`.** An audit trail must outlive what it describes (CLAUDE.md: "preserve ... audit rows"). Neither tenants nor users are hard-deleted in this codebase today, so this is future-proofing.
7. **`(tenantId, createdAt)` composite index on `audit_log`** — the exact index `DATABASE.md` §4 calls out for audit queries.
8. **IP/user-agent captured on service updates** (`req.ip` / `req.get("user-agent")`) — free off the `@Req()` the controller already needs for `getTenantContext`; columns are nullable either way.
9. **`AuditService.record` accepts an optional `manager?: EntityManager`** (same pattern as `TenantService.createTenant`), so a caller inside a DB transaction can make the audit write atomic with the rest of it. Used by `provisionTenant` for exactly this reason — a crash between "transaction commits" and "audit insert lands" is closed, not just documented as a gap.
10. **No `DELETE /services` route** — matches the documented API.md contract; removal is `PATCH {active:false}`, same soft-delete-via-flag pattern as `branch.active`.
11. **`GET /audit` built now, not deferred**, even though P6's one-line summary doesn't explicitly mention a query endpoint — `API.md` §3 already documents `GET /audit?entityType&entityId&from&to` (OWNER/MANAGER only), and audit data nobody can query is not a complete feature. Reuses the existing `PaginationQueryDto` via `AuditQueryDto extends PaginationQueryDto`.

---

## 9. Staff & Qualifications (2026-08-11)

**Motivation.** P7 (`DEVELOPMENT_PLAN.md`) is the next fixed-order phase: Staff CRUD + staff-service assignment ("qualifications" — `PRD.md` §62/§75 uses this term interchangeably with the `StaffService` join, no separate qualification concept exists).

1. **Join entity named `StaffServiceAssignment`, not `StaffService`.** `DATABASE.md` §2.2 calls the join table `staff_service`, and the natural TypeORM class name would be `StaffService` — but this codebase's convention names the injectable business-logic class after its resource (`ServiceService`, `ClosureService`, `BranchService`), so the staff resource's own injectable is `StaffService`. Renamed the entity class to avoid the collision; `@Entity("staff_service")` still maps to the documented table name.
2. **`PUT /staff/:id/services { serviceIds: string[] }` replaces the full assignment set**, rather than individual add/remove endpoints. Matches `UX.md`'s "staff-service assignment checkboxes" — a checkbox form naturally submits its full current state, not incremental deltas. Empty array clears all assignments.
3. **`branchId` excluded from `CreateStaffDto`/`UpdateStaffDto`** — same MVP single-branch-per-tenant precedent as `service.branchId` (P6) and the branch-endpoint design (P5).
4. **Linking `userId` validates the user exists and enforces at most one staff row per user per tenant** (partial unique index `(tenantId, userId) WHERE userId IS NOT NULL`, pre-checked in the service layer with a 409 `STAFF_USER_ALREADY_LINKED` rather than parsing a driver-level unique-violation error — matches the existing pre-check pattern used by `TENANT_SLUG_TAKEN`/`OWNER_EMAIL_TAKEN`). Un-linking (`userId` → `null` via PATCH) is not supported — same "omit to leave unchanged, no explicit clear" scope decision as P5's `BranchUpdateDto`; trivial to add later if needed.
5. **No audit logging for staff CRUD or staff-service assignment.** Neither `SECURITY.md` §10's action list nor `DEVELOPMENT_PLAN.md`'s P7 row calls for it (only "staff schedule changed"/"staff leave created" are listed, both P8 concerns). Matches P6's own precedent of not auditing service creation.
6. **No `DELETE /staff` route** — matches the documented API.md contract; removal is `PATCH {active:false}`.
7. **`color` validated as a 6-digit hex code** (`#RRGGBB`) — no documented format, chosen as the simplest value a calendar UI (P16) can consume directly; nullable, no default assigned server-side.
8. **Setting staff-service assignments validates every `serviceId` belongs to the caller's tenant** (`services.find({where:{id: In(ids), tenantId}})`, count-compared against the requested set) before replacing anything — closes the same cross-tenant-injection class of hole as every other tenant-scoped write in this codebase.

---

## 10. Schedules & Leave (2026-08-11)

**Motivation.** P8 (`DEVELOPMENT_PLAN.md`) is the next fixed-order phase: `WorkingSchedule` (weekly hours + breaks) and `StaffLeave`, with the "N appointments affected" flow from `PRD.md` §3.9. `Closure` (also named in P8's row) needed no new work — its entity + full CRUD already shipped in P5.

1. **`affectedAppointments` is hardcoded to `0` for now, not computed.** `Appointment` doesn't exist until P10 — there is nothing to query. The response shape (`{ leave, affectedAppointments }`) matches the documented contract today so no route/DTO change is needed once P10 lands; only `StaffLeaveService.create`'s single hardcoded value needs to change to a real count query. Documented in the code itself (`CreateLeaveResult`'s doc comment) and here, same deferral pattern as S6 in the P4 entry — tracked, not silently stubbed.
2. **Initial oversight, caught and fixed in the same pass: schedule and leave changes are now audited.** `SECURITY.md` §10's action list explicitly names "staff schedule changed" and "staff leave created" — both were missed in the first implementation pass and added before verification completed. `ScheduleService` audits `STAFF_SCHEDULE_CHANGED` on create/update/**and** remove (unlike `service.priceCents`, a schedule mutation has no "irrelevant field" case — every create/update/delete is itself the meaningful action); `StaffLeaveService` audits `STAFF_LEAVE_CREATED` only on create, matching the doc's precise wording (no "leave removed" action is documented, so removal isn't audited — same precise-match discipline as P6 only auditing service *price* changes).
3. **`PUT`-style upsert rejected for `POST /schedules`.** A duplicate `(staffId, dayOfWeek)` is a `409 SCHEDULE_ALREADY_EXISTS`, not a silent update — matches this codebase's existing POST-creates/PATCH-modifies convention (`Closure`, `Service`, `Staff` all work this way; no resource in this codebase does upsert-on-POST).
4. **`DELETE /schedules/:id` added beyond the documented `GET/POST/PATCH`** — `DATABASE.md` §2.2 states "a row's absence = day off," so there must be a way to remove a row; same additive-CRUD-verb justification already used for `Closure` in P5. Hard delete — no soft-delete column exists for `working_schedule`, and a removed schedule row has no history-preservation requirement (unlike appointments).
5. **`staff_leave` has no `PATCH`/edit route** — only create/list/delete. Leave dates are a discrete fact ("staff member is out these days"); editing one is functionally "cancel and re-request," so delete + recreate covers it without adding edit-specific validation surface.
6. **Break-window validation is symmetric and strict**: `breakStartMin`/`breakEndMin` must both be present or both absent, the break must fall entirely within `[startMin, endMin]`, and `startMin < endMin` always holds — enforced in `ScheduleService`, re-validated against the *merged* window on every `PATCH` (not just the patched fields in isolation), so a partial update can never produce an internally-inconsistent schedule row.
7. **`createdBy` on `staff_leave` has no `ON DELETE` cascade/set-null action** (plain `NOT NULL` FK to `user`) — unlike `audit_log`'s actor FK, a leave record's creator is operationally meaningful (not just a forensic log), and users are never hard-deleted in this codebase, so the stricter default (`NO ACTION`) is safe and intentionally not loosened to `SET NULL`.

---

## 11. Availability Engine (2026-08-11)

**Motivation.** P9 (`DEVELOPMENT_PLAN.md`) is "THE ENGINE" — `findSlots`/`canBook`, the single source of truth every booking source will call (CLAUDE.md rule 1). Unusually for this project, it needed **no new migration**: everything it reads (`Staff`, `WorkingSchedule`, `StaffLeave`, `Closure`, `Service`, `StaffServiceAssignment`, `Tenant.settings`) already existed from P5–P8.

1. **P9 delivers only the pure engine; `Appointment`/`SlotHold` tables and the transactional `reserve`/`confirm` path are P10's job, not P9's.** `ARCHITECTURE.md` §4.1 explicitly separates pure slot computation (clock-injected, no I/O) from §4.2's transactional reserve; the phase table confirms the split (P9 = `findSlots`+`canBook`, P10 = "Appointment creation"). `findSlots`/`canBook` treat "busy intervals" as data the caller loads and passes in — for P9 that's always `[]` (`AvailabilityService.findSlots`, documented inline with a P10 TODO). Matrix items about appointment/hold overlap (§2.1 #5, #9, #14) are proven with **fabricated busy intervals fed directly into the pure functions** in `availability.engine.spec.ts` — genuine pure-function unit tests, no DB involved, and no logic to duplicate later since P10's `reserve` will call this same `canBook`.
2. **"Any Available Staff" returns the merged grid across all qualified staff, sorted earliest-first — not one slot per staff.** `API.md`'s "per-staff earliest slots" phrasing read ambiguously in isolation; `PRD.md`'s own "Any Available Staff" section and step 6 of the customer flow ("see only genuinely available time slots... earliest slot highlighted") settled it: the full aggregate grid is returned, and the frontend (P11) highlights `slots[0]`. Auto-assignment of that earliest staff member happens at booking time (P10), per Decision Q6.
3. **Hand-rolled fixed-offset Asia/Colombo time math (`+330` minutes, no DST), not a date library.** No dayjs/date-fns/luxon exists anywhere in this repo, and Sri Lanka's offset never changes (MVP is explicitly Sri-Lanka-only — multi-country is out of scope per CLAUDE.md §1.11). `apps/api/src/availability/time.util.ts` implements the four conversions the engine needs and is unit-tested directly (`time.util.spec.ts`). Revisit with a real IANA tz library only if multi-country ever enters scope.
4. **Slot generation steps through free windows at a fixed 15-minute granularity**, not `DATABASE.md` §5's disclaimed "fixed 30/60 grid." Free windows (working hours minus breaks minus busy intervals) are computed by interval subtraction first; within each, candidates are generated every 15 minutes, **plus** the exact `windowEnd − duration` candidate is always added so a slot ending precisely at a break/conflict boundary is never missed (matrix #8). The 15-minute constant is a simple, changeable default — not mandated by any doc.
5. **Same-day lead time and past-date rejection share one comparison, not two branches.** Every candidate's start must be `>= now + (isToday ? sameDayLeadMinutes : 0)`. For a past date this is always violated (nothing special-cased); for a future date it's always satisfied (the buffer is moot); only "today" is actually constrained by it. One rule, no date-branching logic to keep in sync.
6. **`findSlots`/`canBook` share their rule-checking logic, not two implementations of the same rules.** Both live in `availability.engine.ts` and use the same free-window/overlap primitives — `canBook` isn't a reimplementation for the single-slot case, it's the same rules applied to one candidate instead of enumerated across a day. This is what makes it safe for P10's `reserve` to call `canBook` unchanged as its "never trust the earlier fetch" re-validation step (`ARCHITECTURE.md` §4.2 step 1).
7. **`POST /salons/:slug/availability` is the first public (`@Public()`), unauthenticated endpoint in the API besides `/auth`.** Tenant is resolved via a new `TenantService.findActiveBySlug(slug)` (404 `SALON_NOT_FOUND` for unknown/suspended tenants — same non-leaking treatment `TenantGuard` already gives suspended tenants on the authenticated path), not from a JWT. No new `Permission` enum value was needed since public routes aren't RBAC-gated. `@HttpCode(200)` was required — NestJS defaults `@Post()` to `201 Created`, wrong for a search-style query endpoint.
8. **Relies on the existing global `RateLimitGuard` (P2) rather than new per-route throttling.** It's already applied via `app.useGlobalGuards` in `main.ts` and covers every route including this new public one — satisfies CLAUDE.md's "rate limiting where abuse possible (..., availability)" checklist item with zero new code, consistent with how every other route in this codebase relies on the same global guard.
9. **Error contract: 404s only for genuinely bad input (unknown slug/service/explicit staffId); every "no availability" business scenario returns `200 { slots: [] }`.** Day off, on leave, salon closed, before lead time, beyond booking window, and an explicit-but-unqualified staff id are not errors — matches `UX.md`'s "never present a fake full grid" principle (an honest empty grid is a normal search result, not a failure).
10. **`GET /salons/:slug` (public salon profile) was not built this phase.** It's P11's "Salon list/profile" deliverable and isn't required for the engine itself — only the availability query endpoint (`API.md`'s "the engine query") was in scope.

---

## 12. Appointments, Booking & Customers (P10) (2026-08-14)

**Motivation.** P10 (`DEVELOPMENT_PLAN.md`) is "Appointment creation — the heart of the product": the `Customer`, `SlotHold`, `Appointment`, and `AppointmentServiceLine` entities, the online reserve/confirm flow, the receptionist create flow, and the first real e2e coverage of the whole booking lifecycle.

1. **`SlotHoldStatus.CONFIRMED` renamed to `CONSUMED`.** The original name conflated the hold's own state with the appointment's state — a hold isn't "confirmed," it's *consumed* by the appointment that replaces it. `CONSUMED` is the accurate term for the terminal hold state and avoids confusion when reading `confirmHold`'s state machine.
2. **Reserve/confirm timing: a `SlotHold` is created at reserve time; the `Appointment` row exists only after payment confirm.** `POST /salons/:slug/bookings` inserts a 10-minute `HELD` hold (no appointment row); `POST /payments/:intentId/confirm` atomically creates the `Appointment` and flips the hold to `CONSUMED` in one transaction. This keeps the hold's exclusion constraint as the only thing blocking the slot during the payment window, and means an abandoned booking leaves zero appointment rows behind.
3. **`sessionKey` doubles as the booking-level idempotency key** (unique per `(tenantId, sessionKey)` partial index). A retried `POST /bookings` with the same `Idempotency-Key` header returns the existing hold instead of creating a duplicate — the API.md §1 idempotency contract enforced by the DB, not app logic.
4. **`bookingSnapshot` (jsonb) on `slot_hold` persists everything `confirmHold` needs** — customer id, service line snapshots, notes, and the pre-chosen booking reference — because `POST /payments/:intentId/confirm`'s body carries no service/customer info (API.md). The reference is chosen at reserve time so the code shown to the customer never silently changes at confirm time; the line snapshots guarantee the price can't drift between reserve and confirm.
5. **Double-booking is prevented by two GiST exclusion constraints, never app logic alone** (CLAUDE.md rule 4): `uq_slot_hold_no_overlap_held` blocks overlapping `HELD` holds per staff; `uq_appointment_no_overlap_active` blocks overlapping active-status appointments (`PENDING_PAYMENT`/`CONFIRMED`/`CHECKED_IN`/`IN_SERVICE`) per staff. Both violations surface as `409 SLOT_UNAVAILABLE` via `translateSlotUnavailable` (`23P01` → `ApiError`).
6. **The receptionist flow (`POST /appointments`) writes a marker `CONSUMED` slot_hold row** purely for `sessionKey`-based idempotent retries — this flow never needs a HELD waiting period, so the row is recorded already `CONSUMED`; the appointment table's own exclusion constraint is what actually guards the insert.
7. **Idempotency-key race fixed by the concurrency e2e suite.** Two concurrent requests with the same `Idempotency-Key` both pass the pre-check; the unique `(tenantId, sessionKey)` index lets exactly one insert win and the loser's transaction aborts. The loser must re-read the winner's hold **outside** the aborted transaction (after the winner commits) and return it — reading inside the transaction saw nothing and fell through to a raw 500. This is the idempotent-retry contract of API.md §1 enforced under real concurrency.
8. **Windows junction + class-transformer duplicate-instance bug diagnosed and fixed with `--preserve-symlinks`.** npm workspaces creates a junction for `@salon/shared` under `node_modules`; Node's default symlink resolution loaded the shared package twice (once via the junction, once via the real path), so `class-transformer`'s `instanceof` checks against DTO classes failed and `ValidationPipe` silently skipped validation. `NODE_OPTIONS=--preserve-symlinks` makes Node resolve through the junction to the single real instance. Applied to `dev`, `start`, and `test:e2e` scripts.
9. **e2e specs use unique phone numbers per run.** The local dev DB is persistent across e2e runs, so fixed phone numbers collide with customers created by earlier runs (`DUPLICATE_CUSTOMER`). `uniquePhone()` derives a per-run number from `Date.now()` + a counter — the same pattern the existing specs already used for tenant slugs/emails. This was enforced across **all** P10 specs during verification: `appointments.e2e-spec.ts` and `customers.e2e-spec.ts` originally used hardcoded phones (and `customers` a hardcoded email) and failed on the second run against the persistent DB — both now use `uniquePhone()` (and a per-run email), and `appointments`' `createSchedule` helper tolerates an already-existing schedule row for the demo-seeded staff member reused by the S6 test.
10. **`AvailabilityService.loadBusyIntervals` now reads real `Appointment` (active statuses) + `SlotHold` (HELD, unexpired) rows** — P9's "busy intervals are always `[]`" TODO is closed. A `SlotHold` past `expiresAt` is treated as not-busy for read-only display; `BookingService.reserve` additionally runs a lazy `UPDATE ... SET status='EXPIRED'` sweep before inserting so the DB exclusion constraint (which reads only `status`, not `expiresAt`) is accurate at write time too.
11. **`CustomerService.findOrCreateForBooking` deliberately differs from `create`.** The online flow silently matches by normalized phone (a returning customer typing their own number must never see an error); an email that collides with a different customer is dropped rather than surfacing a raw DB constraint error. The receptionist flow uses the strict `create` (409 `DUPLICATE_CUSTOMER` with the existing record — PRD's "no silent duplicates").
12. **`POST /appointments` requires a valid `Idempotency-Key` header** (same UUID validation as the online booking flow) — the receptionist flow is a state-changing POST and gets the same idempotency guarantee as the customer-facing one.

---

## 13. Customer Booking UX (P11 redo) (2026-08-15)

**Motivation.** A prior attempt at P11 (and P12) had been committed without going through this project's own verification gate — `apps/web`/`apps/admin` failed typecheck (~25 errors each: wrong hook exports, undefined `useEffect`/`useRef`, assignment to `const` bindings, calls to backend routes that don't exist), had zero tests, and no `DECISIONS.md` entries, directly violating CLAUDE.md §4.5 ("never claim completion if checks fail") and §4.6 ("phase order is fixed, don't advance until stable"). User decision: redo P11 properly, then P12 separately. This entry covers P11 only — apps/admin (P12) is untouched and remains separately broken, its own follow-up.

1. **Rewritten from scratch, not patched.** The broken hook (`useBooking.ts`) didn't even export what the pages imported (`useBooking` didn't exist, only `useInitialSalonLoad`), and three of its API calls targeted endpoints that don't exist server-side (`GET /salons`, `GET /salons/:slug`, `POST /bookings/:reference/cancel|reschedule`). Patching in place would have been more confusing than starting clean against the real, confirmed API surface.
2. **`GET /salons` and `GET /salons/:slug` built this phase** (`apps/api/src/salon/`) — not scope creep; P9's own `DECISIONS.md` §11 point 10 explicitly deferred them here ("It's P11's 'Salon list/profile' deliverable"). Both are public (`@Public()`), reuse `TenantService.findActiveBySlug`.
3. **Salon "hours" are derived, not stored.** No schema column for tenant-level operating hours exists — only per-staff `WorkingSchedule` and salon-wide `Closure`. `SalonService.deriveHours` computes, per weekday, the earliest `startMin`/latest `endMin` across all active staff who have a schedule row that day; a weekday with zero scheduled staff shows as closed. `advanceRuleLabel`/`cancellationPolicySummary` are small server-side formatters over `tenant.settings` — never computed client-side (CLAUDE.md "no client-side business logic").
4. **`POST /payments/:intentId/confirm`'s response was missing `staff` and `lines`** — a real bug caught by the Playwright suite, not by manual testing. `BookingService.createAppointmentAtomic` saves the `Appointment` via `.save()`, which doesn't populate relations; the frontend's success screen needs the staff's name and the booked services to render (UX.md). Fixed with a new `attachStaffAndLines` helper called from both `confirmHold` return paths (fresh confirm and the idempotent-retry/already-`CONSUMED` path), loading the `Staff` row and `AppointmentServiceLine` rows explicitly. `GET /bookings/:reference` already needed the same enrichment (added last phase); this fixes the second of the two response shapes that needed it.
5. **Cancel/reschedule are visibly disabled ("coming soon"), not omitted.** `POST /bookings/:reference/cancel|reschedule` don't exist yet — confirmed absent from the backend, and genuinely P14's job (`RefundCalculator`/policy engine). The manage-by-reference page (`/booking/[reference]`) shows the booking read-only with two disabled buttons rather than silently dropping the feature, so the gap is visible and tracked rather than hidden.
6. **No new UI/state-management dependency** (no shadcn/ui, React Query, axios) — confirmed nothing of the sort exists anywhere in this monorepo or is implied by any prior decision; the whole customer app is raw `fetch` + React state, matching the two-line `package.json` both frontend apps already had.
7. **Date picker disables using only public-profile data (closures + derived hours), capped at a static 30-day display window.** The tenant's actual `bookingWindowDays`/`sameDayLeadMinutes` aren't exposed on the public profile and don't need to be — the availability step's empty state ("No open slots on {date}...") is the real, server-authoritative fallback for any date that turns out to be unbookable, so the picker's disabling is a UX nicety, not a correctness requirement (never trust a client-side business rule).
8. **Staff picker doesn't pre-grey-out unqualified staff.** There's no "which staff can perform these services" endpoint separate from the availability engine itself; qualification is enforced when slots are fetched (an unqualified pick yields `{slots: []}`, shown via the same empty state). Listed as a known, minor UX simplification versus UX.md's "not qualified for selection" wording, not a functional gap.
9. **Payment step always shows the confirm step with the real `paymentIntent.amountCents`**, including the exact UX.md demo copy ("(demo) Payment will be recorded by the salon") — never a `NO_ADVANCE`-skips-payment shortcut, because the backend doesn't implement real advance-rule branching yet (`advanceRequiredCents` is hardcoded `0`, P13's job). The UI reflects what the API actually does today, not an aspirational shortcut.
10. **Hold countdown is client-side `setInterval` display only** — cosmetic; the server's `HOLD_EXPIRED` response on confirm is the actual authority, never trusted for a real decision client-side.
11. **Playwright added as this repo's first browser-automation e2e tool** (`@playwright/test`, `apps/web/playwright.config.ts`), user-directed — no prior frontend test tooling existed at all. Fixtures are created via Playwright's `request` context hitting the real API directly (same login/create-staff/create-service/create-schedule pattern already established in `apps/api/test/*.e2e-spec.ts`), then a real Chromium browser drives the actual UI. The "slot just taken" 409 path is proven by booking the exact slot via the API a moment before the UI's own reserve click — deterministic, rather than relying on a genuinely racy two-browser click (the DB-level exclusion-constraint guarantee under real concurrency is already proven in `apps/api`'s own `booking-concurrency.e2e-spec.ts`; this test proves the *frontend's* handling of the resulting error).
12. **The Playwright web server runs a production build (`next build && next start`), not `next dev`.** Dev-mode on-demand route compilation caused genuine navigation timeouts under the test run — a production build is also the more correct choice for e2e testing generally (compiled once, fast and deterministic thereafter), matching how `apps/api`'s own e2e suite runs against compiled `dist-e2e` output rather than live `ts-node`.
13. **Playwright's web server port (3001) deliberately matches `apps/web`'s own default dev port**, which is already present in `.env`'s `CORS_ORIGINS` allowlist — the browser's fetch to the API is a genuine cross-origin request (different port = different origin), and a mismatched port produced a real, silent-looking CORS failure (surfaced only as a generic "Could not load availability" message) before this was traced down.
14. **A pre-existing, unrelated `npm install` bug was hit and worked around, not fixed.** Installing the new Playwright dependency initially failed with a generic npm/arborist crash (`Cannot read properties of null (reading 'location')`) caused by `node_modules/.package-lock.json` having drifted out of sync with `package-lock.json` from earlier sessions' work. Resolved by running a plain `npm install` first to resync, then installing Playwright — no lockfile hand-editing.
15. **`npm audit` shows 2 pre-existing high-severity findings** (`js-yaml`, transitively via `@nestjs/swagger`) — unrelated to this phase's changes (no `@nestjs/swagger` version change made here) and left alone; fixing it requires a breaking `@nestjs/swagger` downgrade, a separate decision for the P18 security-review phase.

## 14. Receptionist Booking UX (P12 redo) (2026-08-15)

**Motivation.** Same situation as P11: a prior committed P12 attempt had no working auth at all (`login/page.tsx` was a static "coming in Phase 2" placeholder) and its three pages failed typecheck/build outright (a route with no default export, an undefined `prev`, a client hook called with no `"use client"`). Nothing under `apps/admin/src` beyond those 6 broken files existed. Redone from scratch against the real, already-tested API surface, following the same discipline as P11's redo.

1. **Zero new backend routes.** `GET /appointments?date=` (built in P10) already auto-scopes STAFF callers to their own staff row, so it serves both the receptionist's "today" list and a STAFF member's "my day" view with no extra parameters — building API.md's documented-but-unbuilt `/schedule/day`, `/schedule/me`, `/dashboard/today` routes would be separate read logic duplicating what this route already does correctly (CLAUDE.md rule 7). `POST /salons/:slug/availability` — the exact same public P9 route `apps/web` uses — is reused here too (via the admin's own tenant slug from `GET /tenant/me`), guaranteeing "one engine" (rule 1) by construction, not convention.
2. **P12/P16 boundary.** This phase delivers a *working* day view: real appointments, a real booking drawer, a real detail drawer with lifecycle actions (check-in → in-service → complete), proven end-to-end by Playwright. KPI stat cards (counts/revenue/outstanding), status-color calendar polish, and quick-action shortcuts are `DEVELOPMENT_PLAN.md`'s P16 row, not built here.
3. **Nav scope limited to Login + Today.** UX.md's full admin nav (Schedule/Appointments/Customers/Services/Staff/Settings/Payments/Notifications/Audit) describes the end-state product; building empty stub pages for items this phase doesn't own would be scope-padding. Every other nav item is a later phase's job.
4. **Session auth is a simplified, client-rendered SPA-style design, not SSR cookie-forwarding.** `AuthContext` holds `{accessToken, user}` in `sessionStorage`; the API client attaches `Authorization: Bearer`; a 401 redirects straight to `/login` — **no silent refresh-token exchange this phase**. The ~15-minute access-token TTL becomes the practical session length, acceptable for this phase's exit criterion (one complete receptionist flow); "long-lived session via refresh" is a deferred, documented polish item, not a hidden gap.
5. **Booking drawer's `source` select offers exactly `WALK_IN | PHONE | WHATSAPP`**, not UX.md's four-option prose ("RECEPTIONIST / WALK_IN / PHONE / WHATSAPP") — `CreateAppointmentDto.source` (P10) only validates the three; UX.md's "RECEPTIONIST" describes who operates the route, not a fourth enum value.
6. **`GET /appointments/:id` was missing `staff` and service line items — the same relation-loading bug class already found and fixed once in P11's `BookingService.confirmHold`.** `AppointmentService`'s private `findOwned` (shared by `findOne`, `checkIn`, `inService`, `complete`) only loaded `relations: { customer: true }`; `AppointmentDetailDrawer` (this phase's own component) reads `appointment.staff.name` and `appointment.lines.map(...)`, both `undefined` in the real response — crashing the page on click, caught by Playwright's `receptionist-flow.spec.ts`, not by manual testing. Fixed the same way as the P11 precedent: `findOwned` now also loads `staff: true`; a new `attachLines` helper queries `AppointmentServiceLine` rows separately and enriches `findOne`'s return value specifically (the lifecycle-action endpoints don't need it — the detail drawer always re-fetches via `GET /appointments/:id` after every action rather than trusting a mutation response).
7. **The Colombo-timezone UTC-date bug, found once, was checked for and fixed everywhere.** `new Date().toISOString().slice(0,10)` returns the **UTC** calendar date, not Colombo-local (`Asia/Colombo`, fixed UTC+5:30, no DST) — these diverge for ~5.5 hours of every day (UTC 18:30–23:59), exactly the window testing happened in. First caught in `apps/admin/e2e/fixtures.ts`'s `todayLocalDate` (a schedule built for "today" didn't match the date the frontend requested slots for). A grep for the same buggy pattern across both frontend app trees found four more instances: `apps/admin/src/lib/format.ts`, `apps/web/src/hooks/use-booking-wizard.ts`, `apps/web/src/components/date-picker.tsx`, and `apps/web/e2e/fixtures.ts` — all fixed with the same `Date.now() + 330*60_000` offset pattern already used by `apps/api/src/availability/time.util.ts`'s `colomboNow()`. The `apps/web`/P11 instances were bugs in already-committed code, only surfaced now because P12's Playwright run happened to execute during the divergence window; fixed in this commit rather than deferred, consistent with this project's "found a bug in the same pass, fix it in the same pass" practice.
8. **Deferred from the detail drawer, matching real backend gaps, not UI oversights:** reschedule/cancel (P14 — no policy engine yet), a record-payment panel (P13 — no `Payment` entity yet), a duration-trim/"shorten" action (P14-adjacent, needs a pricing recompute).
9. **`empty-state.tsx`/`loading-skeleton.tsx` duplicated from `apps/web`, not shared-package'd** — same reasoning as P11: too small (~15 lines each) to justify a new `packages/ui` workspace.
10. **Playwright mirrors `apps/web`'s P11 setup exactly** (production build web server on port 3002, matching `.env`'s `CORS_ORIGINS`; `request`-context fixtures against the real API). `receptionist-flow.spec.ts` proves the full walk-in flow end-to-end; `rbac-hiding.spec.ts` proves the frontend hides "New booking" for STAFF and shows it for RECEPTIONIST (server-side enforcement is independently proven in P10's own e2e suite — this test is specifically about the frontend's convenience-hiding, same framing as P11's slot-taken test).

## 15. Payments & Advances (P13) (2026-08-15)

**Motivation.** Nothing payment-related existed in the DB before this phase: `Appointment.advanceRequiredCents` was hardcoded `0` everywhere, `discountCents` hardcoded `0`, and no `Payment`/`PaymentAttempt`/`Refund` entity existed at all. Three prior phases explicitly flagged this as P13's job (P5's deferred `advanceValueCents` validation, P11's flat payment-step demo copy, P12's deferred record-payment panel). This phase builds the `Payment`/`PaymentAttempt`/`Refund` tables, a `PricingService` (single source of truth for totals/advance, per DATABASE.md §7), a `PaymentProvider` abstraction (`ManualProvider` default + a never-invoked `PayHereProvider` stub), real advance-rule evaluation wired into the online booking flow, a receptionist "record payment"/"refund" panel in the existing appointment detail drawer, and a `payments.e2e-spec.ts` suite covering the payment matrix (DEVELOPMENT_PLAN.md §2.3).

1. **`advanceRule = PERCENTAGE` gets its own field, `advancePercent` (0–100, whole percent) — resolved via AskUserQuestion, not silently decided.** The existing `advanceValueCents` field is named for currency and had no upper-bound validation; reusing it to also mean "a raw percent" (whether as 0–100 or 0–10000 basis points) would have made one field's unit depend on a different field's value. `advancePercent` stays `null` unless `advanceRule = PERCENTAGE`; `advanceValueCents` stays FIXED_AMOUNT-only. No migration needed — `tenant.settings` is a jsonb column.
2. **The computed advance is capped at the appointment's total — also resolved via AskUserQuestion.** `advanceRequiredCents = Math.min(computedFromRule, totalCents)`; a misconfigured advance rule (e.g. a Rs. 5,000 fixed advance on a Rs. 3,000 booking) never blocks a booking or produces a negative balance.
3. **`PaymentStatus` (in `packages/shared`) was corrected to match CLAUDE.md's non-negotiable state machine** (§1.6: "PENDING → SUCCESS | FAILED | REQUIRES_RECONCILIATION"): `SUCCEEDED` renamed to `SUCCESS`, `REQUIRES_RECONCILIATION` added. Confirmed via a full-repo grep that this enum (declared in an earlier phase as forward-looking scaffolding) was **never actually imported or used anywhere**, so the rename carried zero breaking-change risk.
4. **The payment matrix (P1–P10) is written for a real async gateway; this codebase's `ManualProvider` is synchronous and record-only.** A `Payment` row is only ever created inside the *same* Postgres transaction that creates the Appointment (in `BookingService.confirmHold`), so several matrix rows collapse or become structurally impossible rather than needing literal fault-injection: P1 (no orphan payment) is guaranteed by the shared transaction, not tested via chaos injection; P2 (delayed callback) and P8 (payment succeeds after slot expired) don't apply to a provider that never actually charges anything external; P3/P6 (browser closed / payment expires) map to the existing `SlotHold` expiry (no Payment row ever exists for an abandoned hold); P9/P10 (refund initiated/fails) are manual/record-only like payments themselves — a refund is created directly as `SUCCEEDED`, and "fails" only as a `400` validation error, not an async `FAILED` row. The full row-by-row mapping is in the phase's implementation plan; `payments.e2e-spec.ts`'s test names cite the matrix numbers they cover.
5. **`PayHereProvider` is a genuine stub, never invoked for a real request.** `PAYMENTS_PAYHERE_ENABLED` is never set anywhere in this codebase; every method throws `501 NOT_IMPLEMENTED` regardless of the flag (no real HMAC/webhook verification exists to gate). It exists to satisfy PRD §3.5's documented `PaymentProvider` abstraction shape, unit-tested in isolation only.
6. **Refunds in P13 are manual/record-only — the cancellation-policy-driven `RefundCalculator` (computing *how much* to refund on a cancellation) is P14's job**, per `DEVELOPMENT_PLAN.md`'s own phase boundary. `POST /payments/:id/refund` lets OWNER/MANAGER enter any amount up to what's refundable plus a reason; it does not consult a cancellation policy.
7. **A real correctness bug was found and fixed via the new e2e suite, not caught by unit tests alone.** `PaymentService.recordPayment` originally checked `amountCents > appointment.balanceCents` *before* checking for an idempotency-key replay. A legitimate retry of an already-fully-paid appointment (balance now `0`) hit the balance check first and was wrongly rejected as `PAYMENT_EXCEEDS_BALANCE` instead of returning the cached original payment. Fixed by moving the idempotency-key lookup to the very first step (mirroring the `SlotHold` pattern), with the reactive catch-on-unique-violation kept as defense-in-depth for a true concurrent race. Two unit tests now cover both paths (proactive replay vs. reactive race) plus the receptionist-payments e2e test that originally caught it.
8. **`Appointment.balanceCents` starts at `totalCents`, not `totalCents − advanceRequiredCents`, at creation.** `PricingService.computeTotals`'s own `balanceCents` (total minus advance) is a *display* figure — "what you'd still owe after paying the advance" — surfaced to the customer before any payment happens (`ReserveResponse.paymentIntent.balanceCents`). The `Appointment` row's real `balanceCents` column only decreases via an actual `PaymentService.recordPayment` call (e.g. the advance, recorded immediately after appointment creation, same transaction), preserving the invariant `totalCents = advancePaidCents + balanceCents` at every point after creation. Writing the display figure directly into the column would have double-counted the advance once its own payment-recording step also decremented it — caught during implementation, not by a test.
9. **`apps/web`'s payment step now skips entirely for `NO_ADVANCE` tenants** (`advanceRequiredCents === 0`), confirming automatically right after reserving — per UX.md's own spec ("if NO_ADVANCE: straight to Confirmation"), previously unbuildable because the backend always returned `0`. The demo tenant (`elegance`) defaults to `NO_ADVANCE`, so `booking-flow.spec.ts`'s happy-path e2e test was updated to reflect the skip (no more asserting a "Confirm & pay" heading it will never reach) rather than being left broken.
10. **A second, independent instance of the Colombo-timezone UTC-date bug was found and fixed** in `apps/web/e2e/booking-flow.spec.ts`'s "empty state" test, which computed a "far date" via a raw `new Date()` instead of the already-Colombo-fixed `inWindowDate()` helper (P12's `DECISIONS.md` §14 point 7 fixed five earlier instances of this exact pattern but didn't audit inline test logic outside `fixtures.ts` files). During the UTC 18:30–23:59 divergence window, the raw-`Date()` "far date" collided with the fixture's own Colombo-aware schedule date, making the "no open slots" empty state never appear. Fixed by reusing `inWindowDate(3)` from the same fixtures module instead of hand-rolling the date, removing the duplicate buggy logic entirely rather than just correcting its arithmetic.
11. **No new admin nav page, no dashboard stat cards.** UX.md's "Payments" nav item (recent payments list, outstanding-balance summary) and P16's "outstanding balance"/"expected revenue" dashboard cards are both later phases' jobs; this phase's UI surface is exactly the appointment detail drawer's new Payments panel (record payment, view payment history, issue refund) — matching P12's own "build exactly what this phase's deliverable list names" discipline.

## 16. Cancellation / Rescheduling (P14) (2026-08-15)

**Motivation.** P11 disabled the customer manage-booking page's cancel/reschedule buttons, P12 deferred the same pair from the admin detail drawer, and P13 built only manual/record-only refunds — all three explicitly citing "no `RefundCalculator`/policy engine yet, that's P14." This phase builds it: a `RefundCalculator`, staff- and self-service cancel, reschedule (new-appointment-row swap), no-show conversion, and the late-arrival banner's Reschedule/Cancel actions.

1. **`RefundCalculator`'s tiers needed no new decision — the shape and defaults already existed, untouched since P5.** `TenantSettings.cancellationPolicy` (`{selfServiceCutoffHours, refundPercentBeforeCutoff, refundPercentAfterCutoff, noShowRefundPercent}`, defaulting to `{2, 100, 0, 0}` per Decision Q9) had been sitting unused. PRD.md's prose elsewhere says "100% refund ≥24h before start, 0% <24h" — that figure is stale narrative inconsistent with the actual, already-tested, already-coded 2-hour-cutoff default; the code/Q9 shape is what this phase honors, the same "trust the tested implementation over stale prose" resolution already used for P12's `source` enum and P13's advance-rule work.
2. **Self-service eligibility and refund-rate calculation share one cutoff check, but self-service additionally has a hard gate.** Inside the cutoff window, staff can still cancel/reschedule (just at the after-cutoff refund rate); self-service (`POST /bookings/:reference/...`) is blocked outright with `409 APPOINTMENT_NOT_CANCELLABLE` ("call the salon"), per UX.md's explicit "self-service within 2h cutoff, otherwise 'Please call the salon'" copy.
3. **Reschedule creates a new `Appointment` row and marks the original `RESCHEDULED`** — PRD.md's own stated mechanic, and exactly what the `rescheduledFromId` self-FK (sitting unused since P10) exists for. It reuses `BookingService.createAppointmentAtomic` unchanged: marking the original `RESCHEDULED` inside the same transaction as the new insert removes it from the exclusion constraint's active-status `WHERE` clause immediately (uncommitted-but-visible within the transaction), so a slot that becomes unavailable mid-flight rolls the whole transaction back and leaves the original genuinely untouched (concurrency matrix §2.2.4) — a structural guarantee, not application-level compensation logic.
4. **Existing `Payment` rows move with the appointment on reschedule** (`payment.appointmentId` re-pointed; `advancePaidCents`/`balanceCents` copied from the old row to the new one) — reschedule never changes services or price, only time/staff, so the alternative (leaving payments attached to the now-superseded original) would make an already-paying customer appear to owe their advance again against the new appointment.
5. **A real availability bug was found and fixed while building reschedule, not by the plan.** The pre-check (`loadStaffContext`/`assertCanBook`) computes busy intervals from *currently active* appointments — which, at pre-check time, still includes the appointment being rescheduled itself (it isn't marked `RESCHEDULED` until inside the transaction that follows). Because the availability engine's slot step (15 min) can be shorter than a service's duration (e.g. 30 min), a reschedule target slot could sit fully inside the appointment's *own* current window and get rejected as a false self-conflict. Fixed by excluding the appointment's own `[startTime, endTime)` window (converted to Colombo-local minutes via the existing `colomboNow`) from the busy-interval list used for this one pre-check — scoped entirely inside `BookingService`, not a change to the shared `AvailabilityService` (CLAUDE.md's "one availability engine" — the shared engine's own logic and its use for fresh bookings is untouched; only this call site's input is filtered). Caught by the new e2e suite's reschedule test, not the unit tests (which mock `busyIntervals` as empty).
6. **No new advisory-lock infrastructure**, despite SECURITY.md naming "advisory lock" for the reschedule race — the exclusion constraint alone already provides the guarantee (same mechanism already proven for the identical booking race in `booking-concurrency.e2e-spec.ts`). No `pg_advisory_xact_lock` call exists anywhere in this codebase.
7. **Optimistic locking (`version`) was added for cancel/reschedule/no-show specifically**, via a manual `UPDATE ... WHERE id=$1 AND version=$2` (TypeORM `QueryBuilder.update()`, since `Appointment.version` is a plain column, not a `@VersionColumn`) — DATABASE.md §3.3 and SECURITY.md §7 both name this exact mechanism for "concurrent check-in/cancel." **Not** retrofitted onto the already-shipped `checkIn`/`inService`/`complete` (P10) — a separate cleanup this phase's own exit criterion doesn't require.
8. **"No-show converter ≤ grace" is a validation gate on the manual `POST /appointments/:id/no-show` action, not a new scheduled job.** `@nestjs/schedule` infrastructure doesn't exist anywhere in this codebase yet (the hold-expiry sweep is still inline-checked by deliberate prior-phase choice); requiring `now >= startTime + noShowGraceMinutes` before the action succeeds satisfies the literal deliverable without introducing new cron machinery.
9. **"Shorten" (trim duration + recompute price — one of UX.md's four late-arrival buttons) is explicitly not built.** P12's `DECISIONS.md` flagged it as "needs a pricing recompute" with no specified rule for *what* changes (drop a service line? pro-rate the price? by what formula?) — a genuinely separate, underspecified mini-feature. The late-arrival banner ships with Continue (dismiss)/Reschedule/Cancel — the three actions this phase's own routes support.
10. **`POST /appointments/:id/reassign` (API.md) is not built.** Its only documented consumer is the staff-leave "N appointments affected → reassign/reschedule/cancel" panel, which doesn't exist yet and isn't scheduled into any specific phase. Reassigning to a different staff member at the same time is already fully achievable via the reschedule route this phase builds (`{newStart: <unchanged>, newStaffId}`), so no capability gap exists — just an unbuilt, currently-uncalled convenience alias.
11. **e2e tests exercise the 0%-refund tier and the self-service-blocked case using a temporary, deliberately extreme `selfServiceCutoffHours` (2160, the API's own validated maximum) on a freshly provisioned tenant** rather than trying to book a genuinely near-future slot — `sameDayLeadMinutes` on the booking engine itself makes booking within the next couple of hours impossible through the real API, so a maxed-out cutoff is the only way to deterministically land "after cutoff" without fighting that same-day-lead-time guard.
12. **"No-show after the grace period has elapsed" is unit-tested only, not e2e-tested.** Constructing a genuinely *past* appointment through the real booking API isn't possible (the same lead-time/availability guards that block near-future bookings block past ones even harder); the logic itself (grace-gate + no-show refund tier) is covered by `BookingService`'s own unit tests using a directly-constructed past `startTime`, consistent with this project's established practice of accepting a unit-only proof when the real API structurally can't produce the scenario (mirrors P13's "payment succeeds after slot expired" translation).

## 17. Notifications (P15) (2026-08-15)

**Motivation.** Every trigger point this phase needs (booking confirm, receptionist booking, payment recording, cancel, reschedule, no-show, check-in/late-arrival) already existed and was already tested; nothing in this codebase had ever created a `Notification` row, resolved `TenantSettings.reminderOffsets` (sitting unused since P5), or imported `@nestjs/schedule` (in the dependency ledger since the start, never wired in). This phase builds the `Notification` entity, `Console`/`Email` providers (plus never-invoked `SMS`/`WhatsApp` stubs), a `NotificationService` that fires on every business action and retries failed deliveries on a fixed backoff, a cron scheduler, and a minimal admin Notifications page.

1. **`NotificationEvent` (in `packages/shared`) was realigned to `docs/DATABASE.md` §2.6's `notification.type` column exactly** — confirmed via grep to be **unused anywhere in the codebase**, the same zero-breaking-change situation as P13's `PaymentStatus` fix. Renamed from `BOOKING_CONFIRMED/PAYMENT_RECEIVED/BOOKING_CANCELLED/BOOKING_RESCHEDULED/BOOKING_REMINDER/PAYMENT_REMINDER` to `BOOKING_CONFIRMATION | PAYMENT_CONFIRMATION | REMINDER_24H | REMINDER_2H | CANCELLATION_CONFIRMATION | RESCHEDULE_CONFIRMATION | NO_SHOW | LATE_ARRIVAL`. `NotificationChannel`'s lowercase values were deliberately left as-is (a casing-only doc mismatch, not a wrong value — same treatment P13 gave `PaymentProviderName`).
2. **Notifications always fire *after* the triggering transaction commits, never inside it, and never on an idempotent replay.** PRD §3.10: "notification failure never cancels or alters an appointment." `BookingService.confirmHold`/`reserveAndConfirm` and `PaymentService.recordPaymentForAppointment` each return a `fresh`/`isNew` boolean out of their own `dataSource.transaction(...)` callback; the notification fire-call happens strictly after the transaction resolves and only when that flag is true. `cancelAppointment`/`rescheduleAppointment`/`markNoShow` don't need this treatment — they're guarded by optimistic locking, not an idempotency key, so every successful call is inherently a fresh event. A `fireBestEffort` try/catch wrapper ensures a delivery failure can never surface as an error to the caller.
3. **`nodemailer` is a new, justified dependency for a real `EmailNotificationProvider`** (verified: `9.0.5`, MIT-0, Node `>=6.0.0`). It attempts a real SMTP send only when `SMTP_HOST` is set; when unset (the guaranteed-offline demo default), it logs to console instead of throwing, so the demo is never broken by missing SMTP config — the same fallback shape `ConsoleNotificationProvider` uses unconditionally.
4. **A genuine naming collision was found and avoided before it became a bug**: `apps/api/src/schedule/schedule.module.ts` already exports a class named `ScheduleModule` — P8's staff working-hours feature, unrelated to `@nestjs/schedule`'s own `ScheduleModule`. The cron import is aliased (`import { ScheduleModule as CronScheduleModule } from "@nestjs/schedule"`) in `app.module.ts` to avoid the clash.
5. **Every event fires on both active channels (`CONSOLE` + `EMAIL`) as two separate `Notification` rows**, not tenant-configurable. The `EMAIL` row is skipped entirely — never created — when the customer has no email on file, rather than creating a row that would fail deterministically forever.
6. **`SMS`/`WhatsApp` stay interface-only stubs, never invoked** — the same precedent as P13's `PayHereProvider`: the channel enum values and provider interface exist (PRD §3.10: "interfaces defined for real adapters later"), but nothing in this codebase ever resolves to them.
7. **Retry backoff is a fixed schedule, `[1, 5, 15, 60]` minutes, capped at 5 total attempts** (initial + 4 retries) before a notification stays `FAILED` permanently absent a manual retry. Nothing in the docs specifies exact timings; this is a reasonable, standard operational default, not a business rule — documented rather than asked about, the same treatment P13 gave its FIFO refund-allocation detail.
8. **Message text (subject/body) is rebuilt from scratch on every delivery attempt**, including retries possibly hours later, via a fresh re-fetch of the `Appointment` keyed off `notification.appointmentId`/`notification.type` — deliberate, since the `notification` table schema (DATABASE.md §2.6) has no `subject`/`body` columns, so any text captured at fire-time would be stale by retry time.
9. **Reminder scanning only actions the two fixed offsets the schema actually supports (24h/2h).** `runReminderScan()` iterates active tenants and, for each of `24`/`2` present in `tenant.settings.reminderOffsets`, scans `CONFIRMED|CHECKED_IN` appointments whose `startTime` falls in a 20-minute window starting at `now + offset` (wider than the 15-minute cron tick, to guarantee no appointment is skipped between ticks; the resulting overlap is absorbed by a per-appointment, per-event-type dedup check against existing `Notification` rows). A tenant-configured offset other than 24 or 2 is silently unactionable — the schema only defines `REMINDER_24H`/`REMINDER_2H` event types, so there's nowhere to route a third offset.
10. **A minimal `apps/admin` Notifications nav page is built** — unlike P13/14's deliberate restraint (their actions slot into the existing appointment detail drawer), notifications have no natural home there, and API.md documents `GET /notifications`/`POST /notifications/:id/retry` as their own nav-level resource. A new `Permission.VIEW_NOTIFICATIONS` (OWNER/MANAGER/RECEPTIONIST, matching API.md's role row) gates it, rather than overloading the semantically-mismatched `VIEW_DASHBOARD`.
11. **The e2e suite (`notifications.e2e-spec.ts`) deliberately does not poison `SMTP_HOST` to force a real delivery failure.** The backoff/exhaustion state machine and the reminder dedup logic are already covered deterministically, without any network dependency, by `notification.service.spec.ts`'s mocked-provider unit tests; making the e2e suite depend on live DNS resolution to reach a real `FAILED` state would introduce exactly the kind of external-network flakiness the rest of this codebase avoids (`PayHereProvider` is never actually invoked in tests either). The e2e suite instead covers what's only reachable over real HTTP + the DB: that each business action fires the right event end-to-end, per-channel status is queryable, RBAC is enforced, and tenant isolation holds.

## 18. Dashboard / Calendar (P16) (2026-08-15)

**Motivation.** P12 shipped a deliberately minimal Today page — a staff-grouped list with plain grey status badges and no stats — and explicitly punted the rest to this phase (§14 pt.2, §15 pt.11: "KPI stat cards, status-color calendar polish, and quick-action shortcuts are P16's row"). This phase builds the real thing: a `GET /dashboard/today` stats endpoint, a time-axis day calendar with UX.md's status color legend, and the UX.md-specified responsive staff-list fallback — completing Milestone M4's full MVP operational loop before P17's test sweep.

1. **Only `GET /dashboard/today` is built — not `/schedule/day` or `/schedule/me`.** §14 pt.1 already established both are duplicative of `GET /appointments?date=`, which already staff-scopes a `STAFF` user to their own appointments via `AppointmentService.resolveStaffFilter`. The calendar's data source stays `GET /appointments?date=`; only the new aggregate stats endpoint was missing.
2. **Dashboard stat definitions weren't pinned down byte-for-byte anywhere, so they're recorded here.** All scoped to `tenantId + appointmentDate = today` (Colombo), using the existing `@Index(["tenantId", "appointmentDate", "status"])` on `Appointment`. `expectedRevenueCents`/`outstandingCents` sum `totalCents`/`balanceCents` over "active" statuses — `NOT IN (CANCELLED, NO_SHOW, RESCHEDULED, EXPIRED)` — a set deliberately different from `BookingService`'s own `TERMINAL_STATUSES`, which also excludes `COMPLETED`; a completed appointment still counts as earned revenue here. `waitingLate` reuses P14's exact "late" definition (`now > startTime` on a still-`CONFIRMED` row) rather than inventing a new one — the same concept already driving the appointment-detail LATE banner.
3. **The day calendar uses a fixed 08:00–20:00 time axis**, not one derived per-day from staff schedules — a reasonable MVP default (typical salon hours) avoiding an extra per-staff schedule fetch just to size the grid. Times outside the window are clamped into view rather than clipped off-screen.
4. **"Quick actions" ships as two top-level buttons (New booking, Walk-in), not four.** UX.md §4.2 lists "New booking, Walk-in, Check in, Record payment," but Check-in/Record-payment are already actions inside the existing `AppointmentDetailDrawer` (P10/P13) and only make sense once an appointment is selected — clicking a calendar card → drawer → action is exactly 2 clicks, already satisfying §4.3's "≤2 clicks from a calendar row." The "Walk-in" button isn't a copy of "New booking" (the drawer already defaulted its source picker to `WALK_IN`) — `BookingDrawer` gained an optional `defaultCheckInNow` prop, and Walk-in pre-checks "check in immediately" (a walk-in customer is already standing there), while New booking leaves it unchecked as before.
5. **Staff color**: `Staff.color` already existed end-to-end in the DB/DTO but the admin app's client-side `StaffMember` interface never typed it — a one-line addition (`color: string | null`) was enough to consume it on the calendar, no backend change needed.
6. **The calendar card shows the customer's name, not just the booking reference.** `AppointmentService.list`'s query already `leftJoinAndSelect`s the customer relation (for search), so the JSON response already carried it — the admin `AppointmentRecord` interface just never declared the field. Declaring it as optional (`customer?: {firstName, lastName}`) was enough; no new backend query or endpoint was needed to satisfy UX.md's "each appointment card shows customer" requirement.
7. **The existing staff-grouped list view (P12) is reused as-is for the narrow-viewport fallback**, not rebuilt — `DayCalendar` renders at `lg:` and above, the list renders below `lg:`, per UX.md §5 ("≥1024px = full calendar; <1024px = calendar switches to staff-filtered list") exactly.
8. **A real test-scoping bug was found while wiring up Playwright, not by the plan.** Playwright's default viewport (1280×720) sits at/above Tailwind's `lg` breakpoint, so the calendar — not the list — is what actually renders during e2e runs; `receptionist-flow.spec.ts` (P12) had to be updated from its old `staff-group-${id}` list-testid to the calendar's per-staff-column testid. A first attempt scoped only to `[data-testid^="calendar-card-"]` unscoped by staff, which intermittently grabbed a stale card left over from an earlier test run against the same persistent dev-DB "today" (bookings accumulate across every same-day test run). Fixed by adding a `calendar-staff-column-${staffId}` wrapper testid and scoping every card lookup to it — both `receptionist-flow.spec.ts` and the new `today-dashboard.spec.ts` now query within their own freshly-created staff member's column, which no other test run can ever have touched.

## 19. Testing — full sweep, gap closures, concurrency soak (P17) (2026-08-15)

**Motivation.** `docs/DEVELOPMENT_PLAN.md`'s P17 row: "Run all unit + e2e suites; fix gaps; concurrency soak," exit criterion "All green," measured against the full test matrix in §2 (Availability, Concurrency, Payment edge cases, Appointment lifecycle, Security S1–S12). A research audit compared every matrix line item against the actual test suite and this file's own deferral notes before any code was written — most items were already covered or already legitimately deferred with a citation; seven real gaps remained, recorded here along with what closed each one.

1. **Add/remove service line during an appointment was a genuinely unbuilt feature, not just an untested one** — `docs/API.md` (`POST /appointments/:id/services`, `DELETE /appointments/:id/services/:appointmentServiceId`) and the DB schema (`AppointmentServiceLine.status: ACTIVE|REMOVED`, `removedById/At/Reason`) had existed since P10, but no route or service method was ever built, and no earlier DECISIONS.md entry deferred it — it simply fell through the cracks of every phase's own scope list. Asked the user whether to build it now or formally cut it (mirroring P14's "Shorten" cut) — **decision: build it now.** `BookingService.addService`/`removeService` reuse `resolveServiceLines` (validation+snapshotting), `assertMutable`/`TERMINAL_STATUSES` (the same "can this appointment still be edited" guard cancel/reschedule use), and `applyOptimisticUpdate` (widened to also allow `subtotalCents/totalCents/balanceCents/advancePaidCents` in its patch, previously hardcoded to `status/cancellationReason/cancelledAt`). Totals recompute is new, small, standalone arithmetic — not a `PricingService.computeTotals` call — because that method also recomputes `advanceRequiredCents`, a point-in-time value locked in at booking that a later service-line edit must never retroactively change. The remove-service refund (when the new total drops below what's already been paid) is a plain overpayment calculation (`max(0, advancePaidCents − newTotalCents)`), reusing the same FIFO `applyRefund` helper cancel/no-show use — `RefundCalculator` (cutoff/no-show-percentage-driven) doesn't apply here, since there's no cancellation-policy concept for "a service was dropped mid-appointment." `applyRefund` gained a `reason` parameter (previously hardcoded `"Cancellation refund"`) so the three call sites can each pass their own. Added services don't extend `startTime`/`endTime` — the documented contract only mentions "recomputes totals" — keeping the appointment's slot fixed avoids re-touching the availability engine for what's scoped as a pricing-only operation. Removing the last `ACTIVE` line is rejected (400), mirroring `CreateAppointmentDto`'s `ArrayNotEmpty()` at booking time. A minimal admin UI panel was added to `AppointmentDetailDrawer` (list + inline Remove per active line, an Add-service picker), mirroring the Payments panel's own P13 precedent.
2. **No concurrency soak test existed anywhere** — every prior concurrency test raced exactly 2 requests. New: 15 simultaneous receptionist bookings for the same slot in `booking-concurrency.e2e-spec.ts`, asserting exactly one 201 and fourteen 409 `SLOT_UNAVAILABLE`, then confirming exactly one row exists via `GET /appointments`. This directly satisfies P17's own namesake deliverable against the real mechanism (CLAUDE.md non-negotiable #3, the GiST exclusion constraint), not a mock.
3. **§2.2 item 2 (receptionist+customer race) was only proven sequentially, not simultaneously.** Rewritten as a genuine `Promise.all` pair. This surfaced a real architectural nuance worth recording: `reserve` only inserts into `SlotHold`, a separate table from `Appointment` with its own independent exclusion constraint — so under true simultaneity, a receptionist's appointment-create and a customer's reserve **can both succeed** at their own step; a hold coexisting briefly with a just-confirmed appointment is not itself a double-booking. The real, DB-enforced invariant is that only one row can ever exist in `Appointment` for a given slot, which is what the rewritten test proves — by following through to the online side's `confirm` step (where the hold→appointment insert is protected by the real exclusion constraint) and asserting the *final* state, not by asserting exactly one of the two *first* calls succeeds.
4. **S3/S4 (forged `tenantId`/price) and S12 (extra field / over-length string) were never adversarially exercised.** Booking DTOs simply have no `tenantId`/price field to begin with, so `forbidNonWhitelisted` was trusted but never actually proven against an attacker-supplied one. Four new tests in `rbac.e2e-spec.ts` close this: a forged `tenantId` and a forged `totalCents` on a public booking body each 400 `VALIDATION_ERROR`; an arbitrary unwhitelisted extra field 400s the same way; a string exceeding `CancelAppointmentDto.reason`'s `@MaxLength(500)` 400s too.
5. **§2.2 item 5 / S9 (duplicate payment callback/webhook) — doc-only closure, not a code gap.** No webhook endpoint exists anywhere in this codebase, and none is planned: `ManualProvider` is synchronous and record-only, and `PaymentAttempt`/`providerEventId` (schema-ready since P13) is never written by any service. §15 pt.4 already gives this exact rationale for the §2.3 payment-matrix rows ("doesn't apply to a provider that never actually charges anything external") — this entry explicitly extends that same rationale to this concurrency-matrix line and to S9, so it's no longer an undocumented gap, just correctly cross-referenced.
6. **§2.3 P7 (slot expires while processing) — doc-only closure.** Unit-tested only (`booking.service.spec.ts`'s `HOLD_EXPIRED` tests), not e2e — a real e2e proof would need a genuine 10-minute hold-TTL wait, the same "timing-dependent, unit-proven, e2e-impractical" treatment already given to P14's no-show-after-grace-elapsed case.
7. **Late-arrival banner — investigated, found structurally untestable via real Playwright, same as P14's no-show case.** The banner's trigger (`isLate = checkedInAt set AND lateMinutes > graceMinutes`) needs a checked-in appointment whose `startTime` is genuinely in the past relative to `now`; the same `sameDayLeadMinutes`/booking-window guards that make a genuinely past no-show unconstructable via the real booking API (§16 pt.12) make this unconstructable too — there is no fast, non-mocked way to get `lateMinutes` positive through the live app. Left as a documented limitation rather than forcing a flaky or artificial test.
8. **Two real, pre-existing bugs were found and fixed incidentally while chasing an unrelated Playwright failure, not by the plan.** `today-dashboard.spec.ts` (P16) started timing out; investigation found the shared "elegance" demo tenant's `GET /staff` had accumulated 1,398 rows from every e2e run across the whole session (P10–P17), and `DayCalendar` (P16) rendered one column per staff row with no filtering — the Today page was trying to render ~1,400 calendar columns. Fixed by filtering `DayCalendar` to only the staff who actually have an appointment on the board that day (`staff.filter(s => byStaff.has(s.id))`), a real UX/scalability fix independent of the data-volume trigger — a real salon's Today page shouldn't show a column for staff not working that day either. Separately, `BookingDrawer`'s availability-fetch `useEffect` had a stale-response race: selecting a service and then a staff member in quick succession fires the effect twice, and without a staleness guard a slower first response arriving after a faster second one could silently clobber the correct result. Fixed with the standard React "ignore stale effect results" idiom (a `stale` flag set in the cleanup function). Both fixes are independent of the P17 feature work; the dev database (a local, disposable Postgres instance — confirmed no Docker involved, a native `postgres.exe` process, `psql`-inspectable) was also reset (`DROP SCHEMA public CASCADE` + re-migrate + re-seed) to clear the accumulated test noise, with the user's explicit approval before running anything destructive.

## 20. Security review — hardening, OWASP/pre-demo checklist sign-off (P18) (2026-08-16)

**Motivation.** `docs/DEVELOPMENT_PLAN.md`'s P18 row: "Security e2e matrix §2.4, OWASP checklist (SECURITY.md §12–13), `npm audit` clean of high/critical," exit criterion "Pre-demo checklist complete." A line-by-line pass against `SECURITY.md` §1–13 found most controls already in place from earlier phases (tenant scoping, RBAC, argon2id, JWT, `CsrfOriginGuard`, `RateLimitGuard`, CORS allow-list); three genuine gaps and one stale doc comment were found and closed.

1. **S1–S12 re-audited against the actual e2e suites, not just P17's summary.** Every scenario has real, labeled coverage: S1/S2 (cross-tenant read/write) across nearly every `*.e2e-spec.ts` file's own "cross-tenant isolation" block; S3/S4/S5/S12 in `rbac.e2e-spec.ts`; S6 in `appointments.e2e-spec.ts`; S7 (wrong phone never reveals a booking) in `booking.e2e-spec.ts`; S8 (idempotency) throughout `booking.e2e-spec.ts`/`payments.e2e-spec.ts`/`booking-concurrency.e2e-spec.ts`; S9 doc-only closed in §19 pt.5; S10/S11 in `auth.e2e-spec.ts`. One stale comment was found and fixed: `rbac.e2e-spec.ts` still claimed S6 was "deferred — no Appointment resource exists until P10," a leftover from before P10 shipped; S6 has in fact been tested in `appointments.e2e-spec.ts` since P17. Updated the comment to point there instead of misrepresenting a closed matrix item as open.
2. **Helmet was never wired in — a real gap against SECURITY.md §9.** Added `app.use(helmet())` in `apps/api/src/main.ts`. Verified manually against a live dev server: default CSP (`script-src 'self'`, `style-src 'self' https: 'unsafe-inline'`) does not break `/api/docs` — Swagger UI's bundle/init/preset scripts are all same-origin `<script src>` tags (no inline scripts), and its one inline `<style>` block is covered by the default `'unsafe-inline'` on `style-src`. All four static assets and a live API route returned 200 with headers unchanged otherwise. No CSP relaxation needed.
3. **No request id or structured request logging existed — a gap against SECURITY.md §9's "request logging with requestId; no PII in logs."** Added `RequestLoggingMiddleware` (`apps/api/src/common/middleware/request-logging.middleware.ts`), wired via `AppModule.configure()` so it applies identically in `main.ts` and in every e2e test's `Test.createTestingModule` bootstrap (same `AppModule`). It assigns/reuses `X-Request-Id`, echoes it as a response header, and logs only `method path status durationMs [requestId]` — deliberately never the body or query string, since booking/customer/auth routes carry phones, emails, and passwords. `ApiExceptionFilter` now populates the already-documented-but-previously-unset `requestId` field in the API.md §7 error envelope from the same value, and logs `method path status code [requestId]` (full stack trace only for 5xx) — again body-free. Verified manually: a login attempt with `pii-check@example.com` in the body produced a log line with no trace of the email or password, and every response (success and error) carried a matching `X-Request-Id`.
4. **`npm audit` had 2 high-severity findings — `js-yaml` 5.0.0–5.2.1 (GHSA-pm4m-ph32-ghv5, exponential-time parsing DoS), pulled in transitively and pinned exactly at `5.2.1` by `@nestjs/swagger@11.4.6`.** `npm audit fix --force` wanted to *downgrade* `@nestjs/swagger` to `11.4.5`, which was backwards and unnecessary — the vulnerable package is js-yaml, not swagger, and a patched `5.2.x` release (`5.2.2`+) exists. Added a root `package.json` `overrides.js-yaml: "5.2.3"` instead, forcing the patched version across the tree without touching swagger's version at all. `npm audit` is now clean (`found 0 vulnerabilities`), confirmed stable across a follow-up plain `npm install`.
5. **`JWT_SECRET` was checked for presence but never for the length SECURITY.md §13 actually requires (≥ 32 bytes).** `TokenService`'s constructor (`apps/api/src/auth/services/token.service.ts`) now throws if the secret is under 32 characters, not just if it's missing. This exposed two pre-existing dev/test secrets that were themselves too short and would have failed under the new check: the local `.env`'s `JWT_SECRET` (25 chars) and `.env.example`'s (25 chars) were both lengthened to `dev-only-secret-change-me-min-32-bytes` (38 chars, still an obviously-fake dev value); all 16 e2e spec files' shared `"e2e-test-secret"` fallback (15 chars) was lengthened to `"e2e-test-secret-min-32-characters-long"` (38 chars). None of these are real secrets — `.env` is gitignored and the e2e value is a hardcoded test fixture — so lengthening them has no security implication, it just makes the fixtures satisfy the same rule the checklist asks production to satisfy.
6. **OWASP A01–A10 (§12), walked against real evidence, not re-asserted from the doc:**
   - A01 Broken Access Control — `apps/api/src/tenant/tenant.guard.ts` + `apps/api/src/common/authorization/roles.guard.ts` + the tenant-scoping interceptor, proven by S1/S2/S5/S6 e2e tests.
   - A02 Cryptographic Failures — argon2id password hashing; JWT HS256 via `jose` in `token.service.ts`, now enforcing a ≥32-byte secret (this phase's fix, above).
   - A03 Injection — TypeORM parameterized queries only, no raw/dynamic SQL anywhere in the codebase; React (both `apps/web` and `apps/admin`) escapes by default with no `dangerouslySetInnerHTML` usage.
   - A04 Insecure Design — the threat model in SECURITY.md §1 plus the full S1–S12 e2e matrix (pt.1 above) exercising it.
   - A05 Security Misconfiguration — Helmet (this phase, pt.2), CORS allow-list (`CORS_ORIGINS` in `main.ts`), no hardcoded debug flags, all config env-driven via `ConfigModule`.
   - A06 Vulnerable Components — `npm audit` clean (this phase, pt.4); versions pinned per `CLAUDE.md` §3.
   - A07 Identification/Auth Failures — argon2id, JWT rotation via `RefreshSession`, `RateLimitGuard` (`apps/api/src/common/guards/rate-limit.guard.ts`) globally applied.
   - A08 Software/Data Integrity — `Idempotency-Key` enforced on booking/payment/appointment-create POSTs (S8, tested throughout); `AppointmentServiceLine`/`Payment`/`Refund` snapshots are immutable after creation (CLAUDE.md #5/#6); the PayHere webhook path doesn't exist yet so there's nothing to sign/replay-protect (§19 pt.5).
   - A09 Logging/Monitoring — `RequestLoggingMiddleware` + `ApiExceptionFilter`'s requestId-tagged logs (this phase, pt.3); `AuditService`/`audit-log.entity.ts` records appointment/payment/refund/service-price/schedule/tenant-provisioned/demo-seeded actions per SECURITY.md §10.
   - A10 SSRF — no outbound fetch driven by user input anywhere; `ManualProvider`/`PayHereProvider` (stub) both use fixed, non-user-controlled endpoints.
7. **A genuine, pre-existing concurrency bug was found and fixed while running the full e2e sweep, not by the plan.** `booking-concurrency.e2e-spec.ts`'s "retrying the same Idempotency-Key under a race" test (present since P10, untouched since) failed deterministically: one of two simultaneous same-key retries got `409 SLOT_UNAVAILABLE` instead of the expected idempotent `201`. Root cause, confirmed by direct reproduction: `BookingService.reserve` only checked for an existing same-`sessionKey` hold *once*, at the very start of the transaction (before `assertCanBook`'s in-app availability check). Under true simultaneity, the racing twin can commit its own hold in the gap between that early check and the later `assertCanBook` call — so the second request's `assertCanBook` correctly sees a real conflict in `staffContext` and throws `SLOT_UNAVAILABLE` directly (an in-app throw, not a DB constraint violation), a path the existing DB-constraint-violation recovery logic (the `catch` around the `SlotHold` insert) never touches. A second, narrower gap existed even at the DB-constraint layer: when the loser's insert violates both the `(tenantId, sessionKey)` unique index and the staff+time exclusion constraint simultaneously (which it always does in the identical-slot retry case), Postgres reports whichever one it evaluates first — and the code only recovered gracefully from the unique-constraint case, immediately translating an exclusion-constraint hit into a hard conflict instead. Fixed both gaps in `apps/api/src/booking/booking.service.ts`: (a) `assertCanBook`'s `SLOT_UNAVAILABLE` throw is now caught and re-checked against a same-`sessionKey` hold before being treated as genuine; (b) the insert's `catch` no longer translates immediately — it re-throws so the outer `catch` can check for a same-`sessionKey` winner under *either* constraint violation, only falling through to a real `409` when no such winner exists. The three near-identical "build the idempotent response" object literals were consolidated into one `holdResult()` closure. Verified with 5 consecutive full runs of the concurrency spec (previously failing on the first assertion every time) — all green.
8. **`dashboard.e2e-spec.ts`'s two same-day-fixture tests, and three `apps/admin` Playwright specs that book a walk-in "today" through the real drawer (`appointment-services.spec.ts`, `receptionist-flow.spec.ts`, `today-dashboard.spec.ts`), are a time-of-day artifact, not a regression.** All book against `inWindowDate(0)`/"today" (the dashboard and its Today-page walk-in flow are inherently same-day). Late in the evening Colombo time (confirmed directly against the live availability endpoint at ~22:30–23:02 local: `slots: []`), there is no bookable same-day slot left for a 30-minute service, so the API genuinely returns zero slots and the drawer genuinely has nothing to select — not a bug in either. Specifically ruled out a Helmet-caused regression as the explanation: added `Cross-Origin-Resource-Policy`/`Cross-Origin-Opener-Policy: same-origin` headers (pt.2, above) could in principle block a cross-origin `fetch()` from `apps/admin`'s different port reading the API's response; verified directly with a `curl` request carrying `Origin: http://localhost:3002` that the API still returns `Access-Control-Allow-Origin` correctly and the same genuinely-empty `{"slots":[]}` body a real browser would receive — so this is purely "there's no more bookable day left," the same class of environmental, time-dependent limitation already documented for the late-arrival banner (pt.7 of §19) and the no-show case (§16 pt.12). Re-running earlier in the day makes all five tests pass; no code change is warranted.
9. **Pre-demo checklist (§13) walked item by item:**
   - JWT secret ≥ 32 bytes from env — now enforced at startup (pt.5, above), not just documented.
   - PG connection SSL required in prod — `data-source.ts`/`app.module.ts` both set `ssl: isProduction ? { rejectUnauthorized: false } : false`. ✓ (code-level; verified against a live Neon connection at P19 deploy time.)
   - CORS allow-list set to actual frontend origins — mechanism is in place (`CORS_ORIGINS` env var, `main.ts`); the actual production origin values are a P19 deployment-configuration step, not a P18 code change.
   - HTTPS on all Render services — a P19 deployment property (Render terminates TLS by default); nothing to verify until that phase's live deploy.
   - `.env` absent from git; `.env.example` documents shape only — confirmed via `.gitignore` (`.env`, `.env.*`) and `git status`; `.env.example` contains only placeholder/dev values.
   - Demo seeding script idempotent — `apps/api/src/infrastructure/database/seed-demo.ts` is designed to be safe to re-run (pre-existing from earlier phases, unchanged this phase).
   - Rate limits on auth/booking/payment configured — `RateLimitGuard` applied globally via `useGlobalGuards` in `main.ts` (a single flat per-IP limiter, not SECURITY.md §2's fully-elaborated per-route/per-account scheme — **accepted as MVP scope**, not rebuilt this phase, since it already stops the abuse patterns the checklist cares about for a demo-scale deployment).
   - S1–S12 all green — confirmed this phase (pt.1).
   - `npm audit` clean of high/critical — confirmed this phase (pt.4).
   - The two checklist items tied to the live Render/Neon deployment itself (HTTPS, actual CORS origin values) are correctly P19's responsibility, not re-scoped into P18 — P18 closes everything that's a code-level or local-environment concern.

---

## 21. UI quality & accessibility pass (P18.5) (2026-08-17)

Inserted between P18 and P19 at the user's direction, after an Impeccable audit
of `apps/admin` and `apps/web` scored the frontends **12/20 (Acceptable)**. The
audit is what justified the phase: the failures were concentrated and cheap to
fix, and fixing them before the P19 deploy is cheaper than after.

1. **Status colours were failing in two opposite directions, and are now one
   accessible system.** `UX.md §1`'s semantic status hexes are accent-weight
   colours, but were used as badge fills under white text (8 of 9 fell below
   WCAG AA 4.5:1 — `PENDING_PAYMENT` measured **2.15:1**) and simultaneously as
   10%-alpha calendar tints (all 9 composited to **1.08–1.14:1** against the
   white card, making every status on the day board look identical). Each
   status now carries a `{fill, fg, accent, label}` triple in
   `apps/admin/src/lib/format.ts`. Hues are unchanged — amber still means
   "waiting on money" — only the weights are chosen per role. Verified by
   script: all 9 fg-on-fill pairs ≥ 5.40:1, all 9 accents ≥ 3.19:1 on white,
   and every pairwise fill/accent distance ≥ dE 11.9 so no two statuses read
   alike. A first iteration was rejected for reintroducing the same defect
   class (`COMPLETED` vs `NO_SHOW` differed by 3/255).
   `NO_SHOW` is deliberately the single dark badge: it is the only status
   meaning "revenue lost, nobody came", and the extra weight makes it scannable.
2. **Colour is never the only channel.** Every status now ships with a written
   label alongside fill and accent dot (WCAG 1.4.1), so the day board survives
   colour-blindness and low-contrast displays.
3. **The two admin drawers are real dialogs.** `BookingDrawer` and
   `AppointmentDetailDrawer` — where every booking, cancellation, refund and
   reschedule happens — were bare `fixed inset-0` overlays with no dialog role,
   no accessible name, no Escape, no focus containment, and an unlabelled `✕`
   at 2.56:1. Extracted `DrawerShell` now supplies `role="dialog"`,
   `aria-modal`, `aria-labelledby`, Escape-to-close, backdrop-click-to-close, a
   Tab focus trap, focus restore to the invoking element, and a named 44px
   close button. Extracted rather than duplicated so the two cannot drift apart.
4. **Errors and status changes are announced.** `aria-live`, `role="alert"`,
   `aria-invalid` and `aria-describedby` appeared **zero times** across both
   apps against 28 inputs. All 16 error surfaces now carry `role="alert"`; the
   phone field links its message via `aria-invalid`/`aria-describedby`; and the
   slot-taken race notice (both apps) sits in a polite live region. Closes WCAG
   3.3.1 and 4.1.3.
5. **Raw enums no longer reach users.** `PENDING_PAYMENT` was rendered verbatim
   in 5 places including the **customer-facing** booking lookup. Admin and web
   each expose a `statusLabel` with identical wording, so staff and customer say
   the same words on the phone. Deliberately duplicated per app rather than
   promoted to `packages/shared`: it is presentation, `packages/shared` is
   imported by the API, and both `format.ts` files already duplicate four
   sibling helpers — the duplication follows the established local pattern.
6. **Admin caught up to patterns `apps/web` already used.** `next/link` instead
   of `<a href>` (every Today↔Notifications hop was a full document reload that
   re-ran the auth bootstrap), a `<main>` landmark and `<nav>` around the nav
   links, and 44px touch targets — admin had **zero** despite being scoped
   desktop/**tablet**-first, where web already had 24.
7. **`prefers-reduced-motion` honoured** in both apps; the pulsing skeletons
   still communicate "loading" via shape and their existing `role="status"`.
8. **Dead token layer removed.** All four `:root` custom properties were
   unreferenced by any component. Replaced with the single `--color-app-bg`
   actually consumed by `body`, rather than left to read as a theming system
   that does not exist. **Deferred:** promoting the ~400 hard-coded Tailwind
   colour utilities into semantic tokens, and dark mode — neither is in the MVP
   spec, and the refactor carries real regression risk for zero visual change.
9. **Detector finding verified, not blindly obeyed.** Impeccable flagged
   `border-l-4` on calendar cards as a "side-tab" AI tell. That is a legitimate
   calendar convention (Google Calendar, Outlook), so it was scored a partial
   false positive — but the surrounding analysis showed the staff colour it
   carried was redundant (the column header already names the staff member).
   The card now encodes status instead, which both resolves the finding and
   improves the information design. Both apps scan clean.

Verification: typecheck, lint and build green across all workspaces; detector
clean on both apps; e2e status assertions updated for the humanised labels.

---

## 22. Motion & loading system (P18.5, second pass) (2026-08-17)

A focused Impeccable `animate` pass over both frontends. Prior state: the
entire codebase contained two `animate-pulse` calls and nothing else — no
spinners, no route-level loading UI, no transitions. Operate-mode rules apply
(motion serves feedback, state and continuity; staff never wait on
choreography), so nothing below is decorative.

1. **Shape-matched skeletons replace the one-size bar stack.** A single
   `LoadingSkeleton` of identical `h-12` bars previously stood in for six
   different layouts, so every load ended in a visible jump as real content
   pushed the page around. Admin now has `StatsSkeleton`, `CalendarSkeleton`,
   `TableSkeleton`, `ListSkeleton` and `SlotsSkeleton`; web has
   `SlotsSkeleton`, `ServiceListSkeleton` and `BookingDetailSkeleton`. Each
   mirrors its target's real structure — the calendar placeholder reproduces
   the time axis, staff columns, header dots and varied card heights — so the
   layout holds still. The Today page renders the *same* responsive split as
   the loaded view (calendar at `lg`, list below), which is the specific reason
   the jump disappears rather than merely shrinking.
2. **Sweep instead of flat pulse.** A gradient sweep reads as "working"; a
   whole-block opacity pulse reads as "stuck".
3. **Busy spinners on all 13 submit paths** via a `BusyLabel` wrapper, so the
   spinner's alignment and spacing are defined once rather than per button.
   Labels still change to a present participle — motion says *something is
   happening*, the word says *what*. The arc is authored SVG, not a bordered
   div, so its stroke weight matches the icon set at any size.
4. **Route-level `loading.tsx`** for `/today`, `/notifications`,
   `/salon/[slug]` and `/booking/[reference]`. This became necessary *because*
   of P18.5: converting admin nav to `next/link` made navigation a real
   client-side transition, which had nothing to show while route data resolved.
5. **The drawer entrance is the one authored moment.** 340 ms slide from the
   docked edge with the scrim fading in, exiting faster at 220 ms.
   `DrawerShell` holds the panel mounted for the exit duration and only then
   reports the close, guarded so `onClose` fires exactly once even if Escape
   and a backdrop click race. Everything else in the app stays quiet.
6. **Capped stagger.** List and table rows arrive 45 ms apart, capped at 4
   steps — a stagger should read as one arrival, and a fully-booked day must
   not become a slow cascade.
7. **Reduced motion removes travel, not meaning — and this fixed a real bug
   shipped in §21.** That pass added a blanket `prefers-reduced-motion` block
   setting `animation-iteration-count: 1`, which would have frozen a spinner
   after a single rotation, turning live feedback into what looks like a hung
   button. Spatial motion (slide, rise, sweep) is now suppressed and replaced
   with a plain fade, while the spinner is explicitly exempted and keeps
   turning. This is exactly the "global kill that destroys useful feedback"
   the audit rubric warns about, caught only because the playbook was re-read
   before implementing rather than after.
8. **Craft-floor items picked up in passing.** The drawer's `✕` was a Unicode
   glyph standing in for an icon — now an authored SVG matching the spinner's
   stroke. Browser-owned surfaces are themed rather than left at defaults:
   `::selection`, a brand-coloured `:focus-visible` ring (which also
   strengthens the keyboard affordance from §21), and a `.tabular` class for
   the numerals in time and money columns.

Verification: typecheck, lint and build green across all workspaces; detector
clean on both apps; drawer entrance, skeleton and Escape-to-close confirmed
against the running app under a throttled API.

---

## 23. Demo seed & smoke script (P19) (2026-08-17)

1. **The demo seed was never built.** `seed-demo.ts` shipped as an `export {}`
   placeholder whose comment said "implemented in P19", and DEPLOYMENT.md §7
   documented a `POST /super-admin/tenants/:id/demo-seed` route that did not
   exist on the controller. Both are now real, backed by a single
   `DemoSeedService` so the local script and the HTTP route cannot drift.

2. **Sample appointments go through the booking engine, not direct inserts.**
   CLAUDE.md rule §1 requires every booking source to use the same engine.
   `DemoSeedService` asks `AvailabilityService.findSlots` for genuinely open
   slots and books them via `BookingService.reserveAndConfirm`. Two benefits
   beyond rule compliance: invented timestamps would fight the GiST exclusion
   constraints, and seeding now doubles as a live proof that the availability
   engine works on a freshly migrated database.

3. **Idempotency is a coarse guard, deliberately.** The check is "does this
   tenant have any service row?", not per-entity upserts. DEPLOYMENT.md §7
   promises re-running is safe, and a demo is re-seeded far more often than it
   is provisioned. A half-seeded tenant is a much worse failure mode than a
   refused second run, so reference data is written in a single transaction and
   the guard refuses wholesale rather than attempting partial repair.

4. **Appointment seeding never fails the request.** Per-appointment booking
   failures are logged and skipped rather than aborting. A demo salon whose
   calendar happens to be full, or which is seeded late on a Saturday, should
   still get its catalogue, staff and customers — the sample bookings are the
   least important part of the payload. The e2e test therefore asserts
   `appointments > 0` rather than an exact count.

5. **Staff qualifications are derived from service category, not a name list.**
   Adding a service to the catalogue automatically stays consistent with who
   can perform it, instead of silently producing a service no staff member is
   qualified for (which would render it unbookable and look like an engine bug
   during a demo).

6. **Migrations already own identity; the seed owns business data.** The
   `1740000000000-InitialIdentity` migration creates the super-admin, the
   `elegance` tenant and its owner. The seed script finds those rather than
   recreating them, so credentials live in exactly one place. An earlier draft
   of the script duplicated them and was rewritten.

7. **The smoke script tests the path, not just liveness.** `scripts/smoke-demo.sh`
   wakes all three Render services and then runs a real availability query
   against the demo slug, scanning forward up to 7 days because an empty day is
   legitimate (Sunday, or fully booked). Checking only that processes respond
   would pass while the database was empty or the engine broken — which is
   exactly the state a pre-demo check exists to catch.

## 24. Customer history — an empty record must say so (2026-08-21)

Reported from the live site as "I cannot see any customer history." The
feature was deployed and working; the screen was the problem.

1. **Zeros are not an empty state.** Every figure in "History at this salon" is
   earned at the *end* of an appointment — a visit is a completed one, spend is
   money actually received, a rating is left afterwards. A salon whose bookings
   are all still ahead therefore rendered `Visits 0`, `LKR 0.00`, `Not rated`,
   `Cancelled 0`, `No-shows 0`. That is indistinguishable from a broken screen,
   and it reads as a verdict on a customer whose first appointment simply has
   not happened yet. The figures are now shown only once something has
   concluded (`visits + cancellations + noShows > 0`); otherwise the panel says
   what is actually true.

2. **"Never been in" and "coming in on Thursday" are different customers.**
   Both have zero visits, so the old `totalBookings === 0` check could not tell
   them apart. `CustomerStats` gained an `upcoming` count and the panel now
   distinguishes a blank record from a normal customer whose history starts
   later this week.

3. **`upcoming` excludes PENDING_PAYMENT, EXPIRED and RESCHEDULED.** It counts
   `CONFIRMED`, `CHECKED_IN` and `IN_SERVICE` only. PENDING_PAYMENT is an
   unpaid attempt that expires by itself and nobody at the salon is expecting
   that person to walk in; counting it would promise a visit that was never
   booked. EXPIRED and RESCHEDULED are bookkeeping rows — neither upcoming nor
   concluded. They remain inside `totalBookings`, which stays the raw count.

4. **A deposit is reported before the visit.** `totalSpentCents` is the one
   figure that can legitimately be non-zero before anyone walks in, because an
   advance is money the salon already holds. It is called out in the
   nothing-concluded state rather than suppressed with the rest.

## 25. Inquiries — a question is not a booking (2026-08-21)

Receptionists need to record "what would a bridal package cost?" without
inventing a stylist and a time to hang it on.

1. **An inquiry is its own entity, not an appointment status.** `appointment`
   requires `staffId`, `appointmentDate`, `startTime` and `endTime` NOT NULL,
   and carries the GiST exclusion constraint that CLAUDE.md rule §3 makes the
   final arbiter against double-booking. An inquiry has none of those four.
   Storing it there would mean making the constraint's own columns nullable for
   rows that never occupy a slot, and would push timeless rows into the day
   board, the availability queries, the dashboard counts, customer stats and
   the payment ledger. Two new tables — `inquiry` and `inquiry_service` — cost
   more code and cost the booking guarantees nothing.

2. **Rule §1 is not weakened, because an inquiry never books.** Converting
   opens the ordinary booking drawer, which calls the same availability engine
   as every other source; only afterwards is the resulting appointment id
   recorded against the inquiry. Conversion is therefore two requests, not one
   transaction. That is deliberate: if the second request fails, a real booking
   exists against a still-open inquiry — visible and fixable by hand. The
   alternative ordering fails the other way, leaving an inquiry claiming a
   booking that was never created.

3. **The link is verified, never trusted.** `appointmentId` arrives from the
   client, so `update()` re-reads the appointment and rejects it unless it
   belongs to the caller's tenant *and* to the same customer as the inquiry.
   `CHK_inquiry_converted_has_appointment` enforces the same pairing in the
   database: CONVERTED must carry an appointment, anything else must not.

4. **Services are optional on an inquiry.** "Do you do balayage?" is a real
   question about a service the salon may not even offer. Requiring a service
   id would lose exactly the inquiries worth capturing. Names are snapshotted
   as elsewhere, so a later rename does not rewrite what was asked.

5. **The form hides fields rather than disabling them.** Choosing Inquiry
   removes staff, date, the slot picker and check-in from the drawer entirely,
   and suppresses the availability request. A field you are not allowed to fill
   in is noise, and a disabled slot grid invites the operator to wonder what is
   broken. The price line also changes wording — "roughly … at today's prices"
   rather than "Total", because nothing is owed and prices can move.

6. **They live as a tab on Appointments, not a twelfth nav item.** Bookings and
   inquiries stay separate lists: an inquiry has no time, so sorting it into the
   booking table would need a column it can never fill. The list defaults to
   Open, because an inquiry is something you still owe somebody an answer to.

7. **`MANAGE_APPOINTMENTS` is reused rather than adding a permission.** Anyone
   who may take a booking may take the question preceding it; a new capability
   would have had exactly the same holders.

## 26. Appointment search and the booking reference (RP1) (2026-08-21)

1. **Phone search reduces both sides to a common form.** `normalizePhone`
   keeps digits and an optional leading `+`, so one person is stored as
   `0771234567` when the receptionist typed it and `+94771234567` when the
   website sent it. A literal `ILIKE` on either misses the other — precisely
   the case a search box exists for. Both the search term and the stored column
   now drop non-digits and a leading `0` or country code `94`, so both converge
   on `771234567`. The column-side reduction is a SQL expression and therefore
   not indexable; that is accepted deliberately, because the query is already
   scoped to one tenant and usually one day, and an expression index for a
   search box nobody has complained about would be optimising ahead of evidence.

2. **A phone clause needs at least three digits.** Otherwise searching a
   booking reference like `A2` would turn into a phone substring search
   matching most of the salon's customers.

3. **Full names get their own clause.** Neither `firstName` nor `lastName`
   contains a space, so `"Nimali Perera"` matched nothing before. The columns
   are concatenated for that comparison rather than asking the operator to
   search half a name.

4. **The empty state names the search.** A zero-result search previously read
   "No appointments match those filters", which is indistinguishable from an
   empty salon. It now quotes the term back.

5. **The booking reference gets a copy button, not just larger type.** It is
   the number a receptionist reads down the phone or texts to a customer, and
   the one a customer quotes back. Transcribing a code by eye is how the wrong
   booking gets cancelled. The confirmation replaces the button label in place
   and is announced politely — a toast for "copied" is louder than the action
   deserves. A blocked clipboard fails silently on purpose: the code is on
   screen and selectable, so there is nothing to report.

## 27. Reports backend (RP2) (2026-08-21)

1. **One endpoint, one range, one round trip.** `GET /reports?from=&to=`
   returns every panel. Twelve endpoints would mean twelve spinners and —
   worse — twelve chances for the panels to describe different periods, which
   is how a report quietly lies.

2. **`VIEW_REPORTS` is a new permission, OWNER and MANAGER only.** Reusing
   `VIEW_DASHBOARD` was rejected because receptionists hold it, and these
   figures include salon revenue, a per-stylist league table and named
   customer spend. Who sees that is the owner's decision, not a side effect of
   working the desk.

3. **The date-range contract was extracted, not duplicated.** `resolveDateRange`
   moved out of `DashboardService` into `common/date-range.ts` and both modules
   now share it. A dashboard and a report covering different days is a bug
   nobody reports, because both screens look plausible.

4. **Timestamps get a real UTC window.** Appointments filter on
   `appointmentDate`, already a local calendar date, but payments and refunds
   carry `timestamptz`. Comparing those to a bare date silently uses UTC
   midnight, which is 05:30 in Colombo — a payment taken at 4am would land in
   the previous day's takings. `utcWindowFor` converts the local range to a
   half-open UTC window instead.

5. **Busy hours are shifted into Colombo before the hour is taken.** Otherwise
   every appointment reports five and a half hours early and the heatmap is
   wrong in a way that still looks plausible. `ISODOW` is shifted from Mon=1
   to Mon=0 to match the rota's existing numbering rather than introducing a
   second convention.

6. **Utilisation sits beside the completed count, not instead of it.** A raw
   job count punishes whoever takes the long work — one colour treatment is
   three haircuts — and a league table that does that is worse than none.
   Utilisation is null, never 0%, when nobody was rostered: 0% blames someone
   for a week they were never scheduled to work.

7. **Ratings are scoped to work done in the range, not ratings submitted in
   it.** "How was the work you did that week received" is the useful question,
   and a rating left late still describes the visit it was about.

8. **Refunds are scoped through their payment.** `refund` is the one table here
   with no `tenantId` of its own. Filtering it directly is not merely wrong, it
   is a cross-tenant read — the join is what enforces rule §7 for that query.
   This was caught by executing the SQL, not by reading it.

9. **Two panels deliberately break the range convention, and say so.** The
   funnel counts what *arrived* in the period, because an appointment booked in
   March for June is March's win. Lapsed customers are measured as of the
   range's end, so a historical range answers "who had gone quiet by then"
   rather than silently reporting today's answer under a date the user chose.

10. **The arithmetic lives in `reports.math.ts` as pure functions.** The rota
    maths, the loss tally and the deposit comparison are where a mistake is
    silent, so they are testable without eleven mocked repositories — matching
    CLAUDE.md §5's "Domains = pure functions".

11. **Every empty-denominator rate is null, never 0.** Zero is a claim: "0%
    no-shows" reads as a perfect record when it should read "nothing has
    concluded yet". Same rule the customer no-show rate already follows.

## 28. Reports screen (RP3) (2026-08-21)

Designed with the impeccable skill as **refinement inside the admin's
committed world**, not a new one. `apps/admin` already has a settled visual
language — teal-600 brand, slate neutrals, system-ui, themed `::selection` and
focus rings, a named motion vocabulary with reduced-motion handling — and
inventing a look for one screen would have made it read as a different product.

1. **The panels are ordered as the questions get asked**, not by importance
   ranking: how did we do, who did it, what sold, when are we busy, who should
   we call, what is leaking. That order is the page's structure. Twelve
   equally-weighted cards would have been the lazy alternative and would have
   said nothing about which panel to read first.

2. **The range bar is sticky.** The screen is a dozen panels tall, and being
   unsure which period you are reading is the single thing that makes a report
   worthless.

3. **Changing the range dims rather than blanks.** The previous response is
   held while the next loads, because this is a surface people compare periods
   on and replacing everything with skeletons loses their place. The dim, plus
   a small spinner in the range bar, is the only motion on the screen —
   Operate mode users are in flow and do not want choreography.

4. **Takings is a figures strip, not four cards.** The four numbers are read
   as one sentence about the period; four containers would imply four
   questions. The method split is one proportional bar rather than four more
   numbers, because "how much of it was cash" is a proportion.

5. **Utilisation is drawn as a bar and null is spelled out.** "Not rostered"
   and "rostered but idle" look identical as an empty bar, and only one of
   them is anybody's fault.

6. **The two service lists sit side by side.** Their disagreeing is the
   finding — a cheap fringe trim can top the popularity list while earning
   almost nothing. Stacked or tabbed, that comparison never gets made.

7. **Insights are conditional, not decorative.** The stylist callout is
   written only when the diary genuinely contradicts the job count, and the
   service callout only when the two lists disagree by a wide enough margin. A
   takeaway that appears every time is wallpaper.

8. **The deposit panel refuses to conclude on thin evidence.** It requires
   both sides to have concluded at least five bookings before it recommends
   anything. Two no-shows out of three is not evidence, and a report that
   changes policy on three bookings deserves to be ignored.

9. **"Worth a call" is a task, not a fact.** It leads the customer section,
   carries phone numbers and what each person used to book, and links to their
   record. Every other panel tells the owner how the salon did; this one tells
   them who to ring.

10. **The heatmap spans only the hours that saw work.** A fixed 00–23 grid
    would be three-quarters empty and squeeze the busy block into an
    unreadable strip.

11. **Audit moved from System to a new Insight group** beside Reports. It
    answers "what happened" at a different resolution to the same question,
    and was only ever under System by default.

## 29. Service offers, on both sides of the glass (D2) (2026-08-21)

1. **The customer-side offer badge takes no new colour.** Wax-Resist's legend
   gives every colour exactly one job — `--dye` is *bookable*, `--indigo` is
   *selected*, `--alarm` is *the hold is expiring*. A discount badge in a
   fourth hue would break the system outright. So the offer speaks in the
   resist language: undyed cloth, ink type, carrying the crackle. The mapping
   is the world's own — the crackle is where the wax broke, and here it is
   where the full price did not land.

2. **The salon page states the condition, not just a lower price.** No time is
   chosen there, so an offer is conditional. The badge names its hours
   ("Mon, Tue 5-8pm") or, for an all-day offer, its end date. A page showing
   only a lower figure that becomes the full price at checkout would read as a
   bait, and would deserve to.

3. **The running total is the list price, deliberately.** It is the honest
   ceiling: the server prices the offer once a slot is chosen, so this figure
   can only ever move in the customer's favour. A total that rose at checkout
   is the failure mode worth preventing. When any selected service carries an
   offer the bar says "offers apply at some times" rather than implying the
   total is final.

4. **Hours default to "All day".** The offer most salons run is "20% off this
   September", so the case needing no configuration should not have to be
   configured. "Chosen hours" reveals weekday chips and per-day windows.

5. **The editor's live preview is the real validation.** An offer is five
   inputs that only mean something together, so the preview says the whole
   thing back in one sentence - money, name, hours, end date. That is what
   catches a 20% typed where LKR 20 was meant, which no single field can.

6. **Switching between percentage and fixed clears the number.** 20 means two
   very different things either side of that toggle, and carrying it across is
   how a 20% discount becomes twenty rupees off.

7. **The discount is named everywhere it appears** - on the customer's booking
   record, in the admin's appointment drawer, in the services table. A
   receptionist asked "why is this cheaper?" can answer without opening
   Services, and it is the same wording the invoice will carry, so the
   confirmation and the receipt cannot disagree.

8. **The services table shows the struck price and the offer's name.** An
   owner scanning the list needs to see what is running, not merely that
   something is.

## 30. The desk discount and its cap (D3) (2026-08-21)

1. **Discounts stack sequentially, not additively.** A service already
   discounted 20% to LKR 4,000 and then given 10% at the desk lands at
   LKR 3,600 - 28% off the list price. Additive would take both off the
   original, which lets two ordinary-looking numbers drive a bill to nothing.

2. **The cap is a percentage of the bill, whatever the discount was typed as.**
   This is the load-bearing decision. A receptionist waving LKR 500 off an
   LKR 800 bill is giving away 63%, and a cap that only understood percentages
   would wave that through. The share rounds up, so 10.1% does not sneak past
   a 10% cap.

3. **The cap is measured after the salon's own offers.** A customer arriving
   into a 20% promotion has not spent the receptionist's discretion; the base
   is what was still owed.

4. **Whether the caller may exceed the cap is decided server-side from their
   roles**, never sent by the client. The whole point of a cap is that the
   person it constrains cannot lift it. `OVERRIDE_DISCOUNT_CAP` is held by
   OWNER and MANAGER; the route itself is guarded by RECORD_PAYMENT, because
   discounting is part of settling a bill rather than managing a booking.

5. **Discounting below what has already been paid is refused**, naming the
   amount and pointing at the refund flow. Silently turning a discount into a
   refund would invent money movement that flow exists to record properly.

6. **The cap refusal is not presented as an error.** It stays inline in amber
   and names who to ask, rather than firing a red toast. The system is telling
   the operator something useful, not reporting a fault.

7. **Three database constraints, because the arithmetic is where money is
   lost.** A bill discount cannot exceed the subtotal; a recorded discount
   type must come with the amount it produced and vice versa, since half a
   discount is not a state anything can render; and `totalCents` can never be
   negative, whatever combination of a service offer and a desk discount lands
   on one bill. All three were executed against a real database and confirmed
   to refuse the bad row.

8. **A percentage re-applies when the bill changes.** Adding or removing a
   service recomputes the desk discount from its stored type and value rather
   than carrying the cents forward, which would quietly change what was agreed.

9. **The discount control sits above the payment form**, because that is the
   real order: agree the price, then take the money. Inside the payment form
   it would suggest a discount belongs to one tender rather than to the bill.

10. **The summary names the two halves separately** - "Offers" and "Discount".
    An owner reading a short bill needs to know whether the salon published
    that price or somebody at the desk decided it.

11. **The default cap is 10%.** Enough for the everyday goodwill gesture, not
    enough to waive a bill. Zero is available and means only an owner or
    manager may discount.

## 31. Invoices as documents, not views (D4) (2026-08-21)

1. **An invoice is frozen at issue.** Once it has been emailed it exists in
   somebody's inbox, and a record that quietly disagrees with that copy is
   worse than no record. Nothing is ever edited: a correction issues a new
   version pointing back at the old one, and both are kept. That is rule 5
   applied to a document rather than a row.

2. **The document lives in a `snapshot` jsonb column**, against this schema's
   usual relational habit, and for the reason the feature exists: nothing may
   drift. Nothing queries an individual invoice line, and a relational copy
   would invite exactly the later edit this document must not permit.
   `tenant.settings` sets the precedent. The money figures are duplicated into
   real columns because those are what a report filters on, and reaching into
   jsonb for "unpaid invoices this month" is the wrong shape of query.

3. **Numbering is `EAGL-2026-0001`** - salon, year, then a counter that
   restarts each January. Readable aloud over a phone, sortable as text, and it
   says which salon and which year without anybody looking it up. The prefix is
   padded to four characters so two short slugs cannot produce the same series.

4. **Numbers are serialised by locking the tenant row**, so two receptionists
   completing appointments in the same second queue rather than race. The
   unique index on (tenantId, number) is the backstop that makes the lock's
   guarantee real rather than assumed - the database is the arbiter, per rule 3.

5. **One live invoice per appointment, by partial unique index** on
   status = 'ISSUED'. Corrections supersede rather than accumulate, and "which
   of these three is current?" is not a question anybody should answer by
   reading timestamps. The old invoice is marked superseded *before* the new
   one is inserted, which is what makes that index a guarantee rather than an
   obstacle.

6. **Issuing is idempotent on the figures.** Completion can be tapped twice,
   and two invoice numbers for one visit is a mess somebody has to explain to a
   customer. If the live invoice still matches the bill it is returned
   unchanged. Only the money is compared - re-cutting because a stylist was
   renamed would burn a number for no change to what is owed.

7. **A failed invoice never undoes a completed service.** Issuing on
   completion is fire-and-forget and logs on failure, the same rule
   notifications already follow (PRD 3.10). The drawer can reissue.

8. **Invoices get their own mailer rather than going through
   NotificationService.** That pipeline records per-channel delivery attempts
   against an *appointment* and retries them, and its rows carry no subject or
   body. An invoice is a document with an HTML part and its own audit trail;
   forcing it through a schema built for "reminder sent / failed" would have
   meant bending both. Same SMTP config and the same honest fallback: with
   `SMTP_HOST` unset the message is logged rather than dropped.

9. **The email carries both a text and an HTML part**, and the HTML is
   table-based with inline styles. Not a stylistic choice: mail clients strip
   `<style>` blocks and have no meaningful flexbox, so anything modern arrives
   as an unstyled column. Every interpolated value is escaped, because customer
   and salon names arrive from a public booking form and are never markup.

10. **The send address is a required parameter, not a default.** The commonest
    reason to resend is that the first address was wrong, so making the
    operator type it means they have to look at it.

11. **`businessRegNo` is optional and omitted entirely when unset.** Sri Lankan
    invoices usually carry one, but nothing in the product needs it, and an
    empty label is worse than no label.

12. **Still no tax line.** No tax field exists in the schema and multi-country
    tax is explicitly out of MVP scope (CLAUDE.md 1.11). An invoice here is a
    receipt for one appointment, not accounting.

## 32. The invoice document and its panel (D5) (2026-08-21)

1. **The invoice deliberately does not look like the admin.** Every other
   screen is a tool the operator works inside; an invoice is a thing that gets
   printed, filed and argued over, so it looks like one - white paper,
   generous margins, the salon's name at the top and the number where an eye
   goes looking for it. This is the one surface in the app that is a document
   rather than an interface.

2. **PDF is the browser's job.** `print:` utilities strip the chrome so Ctrl-P
   produces a clean page. Adding a headless renderer to generate the same
   document server-side would be a heavyweight dependency earning nothing that
   the browser's own PDF engine does not already do well.

3. **Rendered entirely from the frozen snapshot.** A year-old invoice opened
   today shows the salon as it was, not as it is. That is the whole reason the
   snapshot exists, and reading a single live row here would quietly undo D4.

4. **"Not sent - no email on file for this customer"** is stated outright.
   The alternative is an invoice that exists, was never emailed, and says
   nothing about why - which is a silent failure wearing a success's clothes.

5. **Offers and the desk discount stay named separately on the document.** One
   is a price the salon published, the other a decision somebody made. A single
   merged figure would hide which, and the invoice is exactly where a customer
   might ask.

6. **Older versions are listed but folded away.** They matter when somebody
   asks "what did you actually send me in September?", and clutter every other
   day. A superseded invoice opens with a plain note saying it has been
   replaced and is kept as a record of what was sent.

7. **The reissue button reports what actually happened.** Issuing is idempotent
   server-side, so clicking it on an unchanged bill says "Invoice is already up
   to date" rather than claiming to have issued something. The message is
   chosen from the response, not from the click.

8. **The panel sits outside the Payments card, not inside it.** An invoice is
   its own record rather than a detail of the payment block, and a card nested
   in a card is a structure nobody chose.

## 33. Attendance & incentives (A1-A7) (2026-08-22)

1. **One check-in engine, two audiences.** A stylist punches themselves; the
   front desk punches whoever has no login of their own. Both paths call the
   same `AttendanceService.checkIn`/`checkOut`, and the caller's role only
   decides *whose* attendance they may name (`resolveTarget`) — never a second
   way of recording the fact, the same reasoning CLAUDE.md rule 1 already
   states for bookings.

2. **Absence is derived, never stored.** A row exists only once somebody has
   punched; a day with no row is worked out at read time against the rota,
   leave and closures. The alternative — a nightly job writing `ABSENT` rows
   for everyone who did not turn up — is a cron that can silently stop running
   and leave a month looking perfect. Nothing here depends on a job staying
   alive.

3. **The rostered shift is snapshotted onto the row, not looked up live.**
   `expectedStartMin`/`expectedEndMin` and the tenant's grace minutes are
   copied onto `AttendanceDay` at check-in. Lateness is a comparison against a
   rostered start, so computing it live would mean that editing somebody's
   rota next March silently rewrites whether they were late last August — the
   same immutable-history rule (CLAUDE.md rule 5) applied to a punch instead of
   a booking.

4. **A missed or wrong punch is corrected by request, never by editing the
   row directly.** `AttendanceEditRequest` carries the reason, the previous
   value (frozen when filed, not inferred later from whatever the row says by
   then), and a manager's decision. Approving a request for a day with no row
   creates one; approving a request against an existing row updates it — either
   way, the request is the record of *why*, which is the entire reason the
   flow exists rather than a bare PATCH.

5. **Attendance and incentives are two systems, not one**, decided with the
   product owner up front. A stylist can be tracked for punctuality without
   ever earning commission, and a plan can pay someone whose hours are never
   punched (e.g. a chair-rental arrangement). Coupling them would have forced
   every incentive payout to first justify itself against a time clock it has
   no actual dependency on.

6. **One incentive plan, three composable components**, also decided with the
   product owner rather than picked unilaterally: a base commission (with
   optional per-service overrides), a flat amount per completed job, and a
   monthly-target tier bonus. They are independent toggles that can combine on
   one plan — `CHK_incentive_plan_has_component` refuses a plan with none of
   them set, and `CHK_incentive_plan_tier_paired` refuses a target with no
   bonus rate or the reverse. A configuration mistake is caught in the
   database, not discovered in a payout nobody double-checked.

7. **Commission is computed on money actually received, not money billed.**
   `AppointmentServiceLine` is scored only from `SUCCESS` payments, and a
   partial payment is split across an appointment's service lines in
   proportion to each line's charged amount (`allocateReceivedByLine`). A
   completed appointment with an unpaid balance pays no commission on the
   unpaid part — commission tracks the till, the same principle §Collection
   report already applies to revenue.

8. **A payout is a frozen document, the same shape as an invoice (§31).**
   `IncentivePayout.snapshot` holds the plan's components *as applied* and
   every contributing line, so a payout opened next year still explains itself
   even if the plan has since changed. Running it twice with nothing changed
   returns the existing payout unchanged (idempotent on the money, §31.6); a
   changed figure voids the old row and inserts a new one pointing back at it
   — corrections supersede, never edit in place, enforced by
   `UQ_incentive_payout_live_period`'s partial index on non-`VOID` rows.

9. **A stylist reading their own figures is not payroll access.** The
   plan/payout routes are OWNER/MANAGER-only (`MANAGE_INCENTIVES`) because
   running and voiding payouts is payroll; but a stylist checking "what have I
   earned this month" is a different, much narrower thing. `VIEW_OWN_INCENTIVE_
   EARNINGS` plus `GET /incentive-plans/me/preview` and `GET
   /incentive-payouts/me` resolve the caller's own `staff` row server-side —
   any `staffId` the client sends is ignored — mirroring how attendance's own
   `GET /attendance/me` already works. No client-supplied id is ever trusted
   for "whose record is this" (CLAUDE.md rule 7).

10. **The staff report gets one honest column, not a second attendance
    screen.** Reports already answers "how full was the diary, how was the
    work rated" per stylist; late-arrival days sits beside those as the same
    kind of fact, sourced from `AttendanceDay.lateMinutes > 0` in the chosen
    range. A full punctuality breakdown already exists on the dedicated
    Attendance screen — duplicating it here would be two places that could
    quietly disagree about the same number.
