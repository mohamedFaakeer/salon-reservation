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

## 34. Tenant entitlements — Lite/Pro plan gating (2026-08-22)

1. **A tier plus overrides, not a fixed two-plan system.** `Tenant.tier`
   (`LITE`/`PRO`) sets a default bundle for every module, report panel and
   numeric limit; a super-admin can still flip an individual one for a
   specific salon without inventing a third plan. `resolveModules` /
   `resolveReportPanels` / `resolveLimits` (`@salon/shared`) are the one place
   tier-default-unless-overridden is decided — every enforcement point and
   every screen goes through them rather than re-deriving the rule.

2. **A sibling jsonb column, not a merge into `settings`.** `Tenant.settings`
   is already the established "flexible per-tenant config" shape, but it is
   OWNER/MANAGER-writable (`PATCH /tenant/me/settings`). Entitlements must
   only ever be SUPER_ADMIN-writable, so they get their own column
   (`entitlements`) with the same defensive-transformer precedent
   (`withEntitlementsDefaults`, mirroring `withDefaults`) rather than one
   config blob two different authorities can write to.

3. **Every existing tenant is `PRO` the moment this ships.** The column
   defaults to `'{}'`, and the transformer fills in `{tier: "PRO", ...}` for
   any row missing the key entirely — the same "absent, not null" situation
   `withDefaults` was already built to handle. Nothing anyone was already
   using disappears on deploy; only tenants a super-admin deliberately moves
   to `LITE` (or overrides) are ever restricted.

4. **A fourth global guard, not a check bolted onto `RolesGuard`.**
   `ModuleGuard`/`@RequiresModule` is registered as a second `APP_GUARD` in
   `AuthorizationModule`, after `RolesGuard` — a permission failure ("you
   can't do this") is always resolved before an entitlements failure ("your
   salon doesn't have this"), and the two concerns stay independently
   testable. Attendance, Incentives, Reports, the audit log and Invoices are
   each gated at controller-class level, the same place `@Permissions`
   already sits on `InvoiceController`.

5. **Reports panels are gated for real, not just hidden in the UI.** Each of
   the seven panels (`ReportPanelKey`) is computed independently in
   `ReportsService.summary` — a locked panel's query is never even run, so a
   Lite tenant's browser receives `null` for it, not real numbers blurred by
   CSS. The admin app renders a locked panel in place, with a "Pro feature"
   badge, so the page never reflows or looks broken — but what makes it safe
   is that the server never sent the data, not that the client chose not to
   show it.

6. **Two different things share the word "limit," decided with the product
   owner rather than picked unilaterally.** Seat caps (max managers /
   receptionists / stylists / services / incentive plans) are hard: refused
   outright, because creating a login or a profile is a deliberate action,
   not something that overflows by accident. The daily-booking cap is soft:
   a salon may run `BOOKING_LIMIT_GRACE` (2) bookings over it before the next
   one is actually refused, because organic daily volume shouldn't turn away
   a paying customer on a genuinely busy day. Crossing the limit itself
   raises no stored flag — the platform tenant list computes `bookingsToday`
   live against real appointments every time it loads, so there is nothing to
   reset at midnight and nothing that can drift from what actually happened.

7. **A ceiling on a setting the tenant already edits themselves, not a new
   toggle.** `bookingWindowDays`, `reminderOffsets` and `discountCapPercent`
   were already 100% self-service via `PATCH /tenant/me/settings`, with no
   upper bound but validation. Rather than a fourth kind of control,
   `TenantService.updateSettings` refuses a value past the plan's own ceiling
   — refused outright, not silently clamped, since a salon that asked for a
   90-day window and quietly got 14 would never know their own setting didn't
   take.

8. **Multi-role staff logins and service offers/discounts are deliberately
   not gated in this pass.** Both cut across many existing routes rather than
   living behind one controller or one creation call, which is exactly the
   "5 clean modules" scope boundary chosen with the product owner up front —
   a known, accepted gap between what the pricing page promises and what is
   technically enforced today, to close in a later pass rather than rushed
   into this one.

## 35. Salon logo branding & gift cards (2026-08-22)

1. **Logo storage is Cloudinary, chosen with the product owner over
   base64-in-Postgres.** The codebase had zero upload infrastructure, and
   `docs/DEPLOYMENT.md` already warned against media in Neon's 0.5 GB free
   quota. A data: URI stored in `tenant.settings.logoUrl` would have needed
   no new vendor, but a real hosted URL is also the safer choice for the
   invoice HTML email — several mail clients strip inline `data:` images —
   so Cloudinary's free tier won on both grounds. Replacing a logo does not
   delete the old Cloudinary asset; an orphaned free-tier asset is an
   accepted, documented gap rather than added delete-tracking complexity.
2. **The four upload constraints are enforced server-side, in a fixed
   order, before anything reaches Cloudinary**: size (≤1MB) → real file type
   (magic bytes, not the client-supplied `mimetype`) → pixel dimensions
   (200–4000px per side) → aspect ratio (within 2:1). A rejected upload never
   spends a Cloudinary credit. File-type and dimension detection is
   hand-rolled (`apps/api/src/tenant/logo-image.util.ts`) rather than a
   general image-parsing dependency — the one plausible candidate
   (`image-size`) carries unfixed high-severity DoS advisories in parsers
   (ICNS/JXL/HEIF) this endpoint never accepts, and CLAUDE.md requires a
   clean `npm audit`. Reading three well-documented, stable binary headers
   (PNG/JPEG/WebP) is a small, closed amount of code by comparison, and
   doubles as the real content-based type check.
3. **Every surface that renders the logo wraps it in a fixed, padded
   container** (~9% internal padding, `object-fit: contain`) rather than
   trusting each upload to already carry margin — the sidebar badge, the
   invoice header cell (both the React print view and the inline-styled
   HTML email), and the Settings preview all share this rule, per explicit
   product-owner direction during planning.
4. **`tenant.settings.logoUrl` is frozen into `InvoiceSnapshot.salon` at
   issue time**, exactly like `businessRegNo` and `salon.name` already are —
   a later logo change never rewrites an invoice already sent.
5. **Gift cards carry a rechargeable balance, not a single-use full
   claim** — a deliberate product-owner call, closer to how a real prepaid
   gift card behaves than a one-shot voucher. `GiftCard.remainingBalanceCents`
   is drawn down by `GiftCardService.redeem*` under a DB row lock
   (`SELECT ... FOR UPDATE`), the same "DB is the final arbiter" posture the
   availability engine uses; a `CHECK` constraint
   (`CHK_gift_card_balance_range`) makes "never negative, never above the
   initial value" a database guarantee rather than something the service is
   merely trusted to get right under concurrency.
6. **Two redemption modes, not one, because the two surfaces have
   different contracts.** `redeemExact` (the admin-recorded payment form,
   where staff types a specific amount) refuses outright
   (`GIFT_CARD_INSUFFICIENT_BALANCE`) rather than silently applying less than
   asked. `redeemUpTo` (the public online-booking confirm) applies
   `min(balance, amount due)` and lets the existing placeholder `ONLINE`
   payment cover any remainder — the server decides the real figure in both
   cases; the client only ever sends a code, never an amount to deduct.
7. **A gift card is applied at confirm, not at reserve** — the same moment
   `BookingService.confirmHold` already creates the real advance `Payment`
   row, inside the same transaction. This avoids needing to provisionally
   reserve part of a card's balance at hold time and restore it if the hold
   expires unconfirmed — the existing hold-expiry path is untouched. The
   accepted UX trade-off: the "amount due now" figure on the payment step
   doesn't live-update from the preview check; the actual breakdown only
   appears after "Book it" is pressed. A public preview endpoint
   (`POST /payments/:intentId/gift-card-preview`) is a pure read with no
   side effect, so a customer can still see the balance before committing.
8. **A gift card code is a deliberate bearer credential, unlike a booking
   reference.** A booking reference is always paired with a phone-number
   second factor before it unlocks anything (SECURITY.md); a gift card code
   alone redeems real stored value, the same way a physical gift card
   works, so it carries materially more entropy on its own (10 random
   base32 characters vs. a booking reference's 5) plus its own dedicated,
   tighter rate-limit rule (`gift-card-lookup`, 10/min per IP vs. the
   existing `payment` rule's 20/min) — this codebase's first public
   endpoint where guessing codes to find a live balance is the realistic
   threat model.
9. **The purchaser is a real `Customer` record, found-or-created by phone —
   the same identity resolution the booking flow already uses — rather than
   free-text fields on the gift card itself.** This folds a gift-card sale
   into the salon's existing CRM data for free, and reuses
   `CustomerService.findOrCreateForBooking` instead of inventing a second
   "customer-ish" shape. The recipient, by contrast, stays purely
   descriptive (optional name/phone/email) — there is no reason a gift
   recipient needs their own CRM record before the card is even redeemed.
10. **Creating a gift card always records a real payment** (cash/bank/card,
    the same three methods the appointment-payment form already offers) —
    a product-owner call, so issued value is never untracked revenue. The
    `Payment` row is created directly by `GiftCardService.create` rather
    than through `PaymentService.recordPaymentInternal`, since that method
    is appointment-balance-coupled and a gift-card purchase has no
    appointment; `appointmentId` is simply `null` (already nullable).
    Creation is idempotent the same way appointment payments are — a
    retried `Idempotency-Key` is deduplicated via the `Payment` row's own
    unique index, with the matching gift card found via
    `purchasePaymentId`, rather than a second key on `gift_card` itself.
11. **Voiding mirrors `IncentivePayout`'s void pattern exactly** — the same
    `voidedAt`/`voidedBy`/`voidReason` columns, the same
    `CHK_..._void_has_reason` constraint shape, and the same posture that
    only an already-void row blocks a second void; a partially-redeemed
    card can still be voided as a correction, the same way a paid-but-wrong
    incentive payout can.
12. **Gift cards are not added as a sixth Lite/Pro gated module in this
    pass.** `packages/shared/src/tenant-entitlements.ts` was scoped to five
    specific modules deliberately (§34); folding in a brand-new feature
    wasn't asked for. A natural, easy future extension, not built
    speculatively now.

## 36. Win-back campaigns & prepaid service packages (2026-08-22)

1. **Scope-boundary call, made explicitly rather than silently.**
   CLAUDE.md §1.11's MVP out-of-scope list names *"marketing automation"*
   and, separately, *"loyalty, memberships, gift cards"* verbatim — gift
   cards were on that same list (§35) and got built once explicitly
   approved. The same path applies here: a prepaid service package is the
   closer cousin of a gift card (one purchase event, a stored balance drawn
   down over visits), not a subscription/membership (no recurring-billing
   infrastructure exists anywhere in this codebase) or a points-accrual
   loyalty scheme (no accrual-on-spend mechanic exists either). The win-back
   campaign is a narrow slice of "marketing automation" — one manual,
   staff-triggered message to a bounded, already-computed audience of at
   most 25 lapsed customers — not a scheduling/automation engine.
2. **Real SMS/WhatsApp sending was not activated for win-back messages.**
   `NotificationService.sendCampaignMessage` uses exactly the two channels
   `fire()` already sends for real (CONSOLE, EMAIL) — the SMS/WhatsApp
   providers stay hard-stubbed `501`s, per CLAUDE.md's explicit "real
   payment gateway and real SMS/WhatsApp are stubbed only" rule. Activating
   a real SMS/WhatsApp provider is a separate, larger decision than "let an
   owner message their own lapsed customers."
3. **`ServicePackage` is a sibling entity to `GiftCard`, not an extension
   of it.** The balance is **N uses of one specific `Service`**, not a
   cents balance — `GiftCard`'s `CHK_gift_card_balance_range` and
   `redeemUpTo`'s `min(cents, cents)` math don't generalize to "N uses,"
   and `GiftCard` has no `serviceId` column to scope eligibility against.
   The proven mechanics were copied wholesale rather than re-invented: the
   `Check`-constrained balance-range pattern, the
   `lockActiveCard`/`assertRedeemable`/`debit` structure (renamed
   `lockActivePackage`/`assertRedeemable`/inline decrement), the void
   pattern, the `Payment.giftCardId`-style nullable FK trail (→
   `Payment.packageRedemptionId`), and the `recordPaymentInternal`/
   `confirmHold` integration seams.
4. **v1 packages are single-service only** — `service_package.serviceId`
   is one FK, not a set. This matches the "5 haircuts" style example the
   feature was scoped from; a package spanning several services (or a
   service *category*, which doesn't structurally exist yet — `Service`
   has only a free-text `category` column, no `ServiceCategory` entity) is
   a clean future extension, not built speculatively now.
5. **One redemption method, `redeemOne`, not gift cards' exact-vs-up-to
   split.** A package's "unit" is inherently all-or-one — you can't
   partially consume a use — so `redeemOne` always computes
   `appliedCents = min(unitPriceCentsSnapshot, maxCents)` and decrements
   `remainingUses` by exactly 1 regardless of `appliedCents`, used
   identically by both the desk payment form and the online-booking confirm
   flow. One consequence worth naming: at the desk, the amount actually
   recorded on the `Payment` row can be **less** than what staff typed in
   the amount field (when `unitPriceCentsSnapshot < amountCents`) — this is
   the one place `PaymentService.recordPaymentInternal` computes a
   `finalAmountCents` that can diverge from the caller's requested
   `input.amountCents`, mirrored through to the appointment's
   paid/balance mutation and the audit metadata.
6. **`serviceId` is `ON DELETE RESTRICT`, not `SET NULL`/`CASCADE`.**
   Unlike `AppointmentServiceLine.serviceId` (nullable, `SET NULL` — a
   closed historical record surviving the deleted service it once named),
   a `ServicePackage` is an *active, spendable balance*. A package whose
   service just vanished is not a preserved history row, it's a live
   liability nobody can redeem correctly — so deleting a service with
   active packages against it is blocked outright rather than silently
   orphaning them.
7. **`ServicePackageService.redeemOne` validates service eligibility
   against the actual booked/appointment services, passed in by the
   caller** (`eligibleServiceIds: string[]`), not a single `serviceId`
   parameter — the desk payment form doesn't pin one specific
   `AppointmentServiceLine`, and the booking-confirm flow's hold snapshot
   can (in principle) cover more than one service. A package redeems only
   if its own `serviceId` is among the set actually being paid for;
   otherwise `409 PACKAGE_SERVICE_MISMATCH`, surfaced by the booking
   controller before anything commits (the whole confirm runs in one
   transaction, so a mismatch mid-confirm rolls back the appointment
   insert too — nothing partially commits).
8. **`customer.marketingOptOut` is a new boolean, default `false`, set
   only through a new, deliberately narrow `PATCH /customers/:id { marketingOptOut? }`** —
   not a general customer-edit endpoint. Without this column and a way to
   set it, `WinbackService`'s opt-out check would have had nothing to
   check; a single checkbox was added to the existing customer detail page
   (not a fresh mockup pass — a one-control addition to an already-built
   detail screen, not a new surface) so the feature is actually usable
   end-to-end, not merely modeled in the schema.
9. **A campaign message's exact text is persisted on the `Notification`
   row (`body`, new nullable column) rather than only held in memory.**
   Every other `NotificationEvent` rebuilds its text fresh on a manual
   retry from `type` + `appointmentId` (`NotificationService.buildMessage`)
   — `WINBACK_OFFER` has no appointment to rebuild from, since it's
   staff-composed free text sent to a customer with no appointment behind
   the message. Without persisting it, a failed-then-retried win-back send
   would silently regress to a generic "you have a notification from your
   salon" fallback instead of the actual offer. `sendCampaignMessage` is a
   sibling method to `fire()`, not a special case inside it, for the same
   reason — the two have genuinely different message-sourcing contracts.
10. **A 14-day "already contacted" dedupe is enforced server-side in
    `WinbackService`, not left to the UI.** A stray page refresh or a
    second click sending the same lapsed-customer list twice is an
    accidental-repeat-send guard, not a scheduling system — it queries the
    `Notification` table for an existing `WINBACK_OFFER` row for that
    customer within the window, same tenant. Paired with a dedicated
    `winback-campaign` rate-limit rule (5/min per IP) — tighter than
    `payment`'s 20/min, reasoned the same way `gift-card-lookup` was: this
    is the first endpoint where a compromised or careless OWNER/MANAGER
    session repeatedly firing it is a real reputational risk to the
    salon's own customers, not just an API-abuse concern.
11. **The win-back campaign is gated behind the same Reports entitlement
    as the panel it reads from** (`@RequiresModule("reports")` on
    `WinbackController`, alongside the new `SEND_MARKETING_CAMPAIGN`
    permission, OWNER/MANAGER only) — a Lite-tier salon that can't see the
    locked "Worth a call" panel can't reach the send endpoint directly
    either. `WinbackController`/`WinbackService` are deliberately siblings
    of `ReportsController`/`ReportsService`, not methods on them —
    `ReportsService` stays purely read-only aggregation; the one write
    (a `Notification` row per message, an audit row per send) lives in its
    own service.
12. **Neither feature was added to the Lite/Pro gated-module list itself**
    (`packages/shared/src/tenant-entitlements.ts`) beyond piggybacking on
    the *existing* Reports gate for win-back — same "don't silently expand
    a five-module system" call already made and documented for gift cards
    (§35.12).

## 37. Inventory & Quick Billing — retail products, bundles, returns, scanning (2026-08-22/23)

1. **Scope-boundary call, made explicitly rather than silently, and wider
   than any prior exception.** CLAUDE.md §1.11 names *"inventory"*,
   *"purchases"*, and *"full POS/ERP"* as three separate out-of-scope
   items — this module touches all three, not one, unlike gift cards
   (§35) or service packages (§36), each of which landed on a single
   excluded phrase. Each is bounded on purpose rather than built in full:
   "inventory" is addressed head-on (that is the point) but scoped to a
   retail counter's actual needs, not a generic warehouse-management
   checklist; "purchases" stays unbuilt — no supplier entity, no PO
   approval chain, receiving stock is one manual action with a free-text
   supplier field; "full POS/ERP" stays unbuilt — no till/register
   sessions, no GL integration, no tax engine beyond the existing flat
   LKR model. Approved explicitly before Phase A began, the same gate
   gift cards and service packages went through.
2. **`Payment.customerId` stays `NOT NULL`; a walk-in sale resolves to a
   lazily-created, per-tenant placeholder `Customer`** rather than
   relaxing the column. Every existing `Payment` consumer (reports,
   refunds, invoices, audit rendering) already assumes a real customer
   row; auditing every call site for a null-safety gap that has never had
   to hold would have been the more invasive change. The placeholder is
   matched by a new `customer.isWalkInPlaceholder` boolean, not by phone,
   which sidesteps the `(tenantId, phone)` uniqueness constraint entirely;
   every place that broadly enumerates customers (search, reports'
   `topSpenders`/`frequentCustomers`/`lapsedCustomers`, win-back candidate
   selection) filters it out explicitly, confirmed by a regression test.
3. **Costing is weighted-average, not FIFO/specific-lot**
   (`ProductVariant.weightedAvgCostCents`, recomputed transactionally on
   every receipt). Matches the codebase's existing "denormalized figure
   kept in sync transactionally" pattern (`quantityOnHand`,
   `Appointment.balanceCents`) and is simpler to reason about under
   concurrency than tracking cost per physical unit. Every
   `retail_sale_line` snapshots `unitCostCentsSnapshot` at sale time —
   history is never reconstructed from a variant's current cost, the same
   rule `AppointmentServiceLine` already follows.
4. **Batch *selection* for a sale is FIFO by `expiresAt` (nulls-last),
   separate from costing, which always snapshots the variant's current
   weighted-average regardless of which physical batch the units came
   from.** The two questions — "which lot loses inventory" and "what did
   this line cost" — have different right answers and are computed
   independently rather than one being inferred from the other.
5. **No bill-level discount on retail sales in Phase A.** Quick Sale is
   "ring up items, take payment"; a bill-level discount is a materially
   different feature (needing a `RECORD_PAYMENT`-vs-`OVERRIDE_DISCOUNT_CAP`
   split, same as appointments already have) deferred rather than bolted
   on to keep the core checkout lean.
6. **The core concurrency guarantee is one `pessimistic_write` lock on
   `product_variant`, taken before any read a caller acts on**
   (`StockMutationService.lockVariant`), the same "DB is the final
   arbiter" posture the availability engine and gift-card/package
   redemption already use. `StockMutationService.applyMovement` is the
   *only* place a `stock_movement` ledger row is ever written or
   `quantityOnHand` ever mutated — receiving, selling, and manual
   adjustment all funnel through it, so the ledger can never drift from
   the running total by construction.
7. **Three business rules were confirmed with the product owner before
   Phase B was built, not assumed:** (a) a quarantined return is a pure
   record — it never re-enters `quantityOnHand`, because it isn't
   sellable, rather than being tracked as "present but unsellable" via a
   batch-status split; (b) a return's refund is staff-entered and
   optional (defaulting to the returned lines' value, editable down to
   zero for an even exchange), not automatic and not all-or-nothing;
   (c) restocking a unit whose original batch is gone creates a *new*
   batch at the original sale line's frozen cost, preserving that unit's
   real cost basis rather than either the current weighted-average or a
   forced quarantine.
8. **A serialised product's restock reactivates its exact original batch
   by serial number rather than creating a fresh one** — the one place
   decision (c) above doesn't apply as stated. `UQ_stock_batch_tenant_serial`
   is a real partial-unique index on `(tenantId, serialNumber)`; the
   original batch row is never deleted (no hard deletes on business
   records), so a second insert with the same serial would violate that
   constraint. `RetailReturnService.restock` branches on
   `product.trackSerial` for exactly this reason, and validates the
   serial was actually part of *this* sale line (via
   `retail_sale_line_batch`) before reactivating it.
9. **A bundle sale is one aggregate `RetailSaleLine`, not one line per
   component** — a product-owner call, weighed against exploding into
   per-component lines with a price split proportional to each
   component's standalone price. The aggregate approach needs no pricing
   formula to invent: cost is a straightforward sum of each component's
   cost × quantity at sale time, and "Product sales & margin" reports the
   bundle as one named row ("Gift Set"), which is how a salon actually
   thinks about a kit it sells. Stock still depletes exactly right per
   component underneath — `RetailSaleLineBatch` already supported "one
   line, several batches" for FIFO spill, and extends unchanged to
   "several batches across several different variants." `retail_sale_line`
   gained one new nullable `bundleId` column, mirroring the existing
   nullable `variantId` — exactly one of the two is ever set per line.
10. **Bundle-line returns are out of scope for Phase B — a disclosed
    narrowing, not a silent gap.** `RetailReturnService.process` refuses
    a bundle line outright (`BUNDLE_RETURN_NOT_SUPPORTED`) rather than
    guessing how to fan a partial bundle return back out across
    components; the admin return drawer shows the line with an explicit
    "can't be returned yet" note rather than hiding it.
11. **Checkout locks every touched variant — direct lines and every
    bundle's components alike — in one globally sorted order** (by
    variant id) before any allocation happens, rather than locking
    per-line in cart order. Two concurrent checkouts that both include,
    say, a bundle and a loose unit of one of its own components could
    otherwise request the same two locks in opposite orders and deadlock;
    a single global sort makes every transaction request its locks in the
    same order, which Postgres never deadlocks on.
12. **Reorder intelligence is simple velocity vs. a reorder point, computed
    fresh on every `GET /product-variants` read from the existing
    `stock_movement` ledger — never stored, and never ML/seasonal**, per
    the scope explicitly confirmed before Phase A began. A 30-day trailing
    window and a 7-day "reorder soon" threshold are reasonable defaults,
    not tenant-configurable in this pass. Deliberately *not* a new
    paginated filter: the signal is attached to whichever page the caller
    already fetched (via `lowStockOnly`/search/browse), because computing
    it inside a single correctly-paginated query would need a join
    against a second aggregate query — real complexity for what stays an
    advisory, not a money-moving, feature.
13. **Camera barcode scanning uses `@zxing/library` + `@zxing/browser`
    (Apache-2.0, `npm audit` clean) rather than a hand-rolled decoder.**
    The `detectImage` precedent (§35.2 — hand-rolling PNG/JPEG/WebP header
    parsing instead of a flagged dependency) does not generalise here:
    that was reading three well-documented, static binary headers: this
    is decoding a 1D barcode from a live, noisy camera stream, a
    materially larger problem where a maintained library is the
    responsible choice, not a bounded reimplementation. The reader is
    hinted to the six formats a retail counter actually sees
    (EAN-13/8, UPC-A/E, Code128/39) — never QR/Aztec/PDF417 — so it can't
    false-match printed matter elsewhere in frame. The same exact-barcode
    lookup (`GET /product-variants?barcode=`) already built for a
    USB/BT scanner-gun's Enter keystroke serves the camera path too;
    no new backend endpoint was needed for this feature.

## 38. SMS/WhatsApp gateway ownership — one shared platform account, not per-salon (2026-08-28)

1. **Confirmed with the product owner ahead of building any real
   SMS/WhatsApp adapter**, because it decides who holds the provider
   account, who eats the per-message cost, and what a tenant's settings
   screen needs to contain — none of which was written down anywhere
   (`PRD.md`, `SECURITY.md`, and this file were all silent on it), and
   `CLAUDE.md` §1.11 explicitly keeps real SMS/WhatsApp stubbed until a
   decision like this one is made.
2. **The platform will hold one shared gateway account (e.g. Twilio,
   Dialog, or a local aggregator) that every tenant's messages send
   through, metered per tenant** — not a bring-your-own-credentials model
   where each salon owner signs up for and configures their own provider.
   Reasoning: the target owner is a small unisex salon in Sri Lanka, not
   a technical operator who can self-serve a Twilio/Dialog account and
   paste API keys correctly; a shared gateway means a salon gets SMS/
   WhatsApp the moment a plan enables it, with zero setup. The platform
   absorbs the messaging cost and recovers it through subscription/plan
   pricing rather than passing a provider bill straight through.
3. **This matches infrastructure already built, not just a preference
   going forward.** `NotificationQuota` (migration `NotificationQuota
   1750000500000`) already tracks a monthly send count and limit per
   tenant per channel (email/SMS/WhatsApp/console) — a shape that only
   makes sense under one shared account being metered per tenant. There
   is no schema anywhere for a tenant to store its own provider
   credentials, and building that (encrypted secret storage, a
   credentials settings UI, per-provider error mapping, validation) would
   have been substantial net-new work this decision avoids for the MVP.
4. **Not a permanent close on bring-your-own.** If a specific salon later
   wants its messages to send from its own locally-recognized number, a
   BYO-credentials option can be added as a later, opt-in upsell without
   disturbing the shared-gateway default — it was deliberately left open
   rather than designed away.
5. **Still not implemented.** `SmsNotificationProvider` and
   `WhatsAppNotificationProvider` remain interface-only stubs that throw
   `501 NOT_IMPLEMENTED` (§ providers). This decision fixes the ownership
   model for whenever that real adapter is actually built and approved —
   it does not itself turn SMS/WhatsApp on.
6. **When the real `SmsNotificationProvider` is built, it targets a local
   Sri Lankan SMS aggregator (e.g. Notify.lk / Text.lk class of provider),
   not a global provider like Twilio.** Confirmed with the product owner
   alongside the shared-gateway decision above: this product sends only
   to Sri Lankan numbers, and a local aggregator is materially cheaper
   per message, has a faster/simpler path to a locally-recognized alpha
   sender ID, and avoids international routing markup. The specific
   vendor (Notify.lk vs. Text.lk vs. another) is still open and should be
   picked at implementation time based on live pricing/reliability, but
   the *class* of provider is fixed so the adapter is built against a
   simple local REST API, not a heavier SDK like Twilio's.
7. **The vendor is Text.lk**, chosen by the product owner. `Sms
   NotificationProvider` calls its OAuth/Bearer REST API
   (`POST https://app.text.lk/api/v3/sms/send`), falling back to
   console-logging when `TEXTLK_API_TOKEN`/`TEXTLK_SENDER_ID` are unset —
   the same unconfigured-credential fallback shape `EmailNotificationProvider`
   already uses for SMTP, so local/demo environments never break. A new
   `normalizeSriLankanPhone()` in `packages/shared` converts whatever shape
   a customer's/staff's phone was typed in (`0771234567`, `+94771234567`,
   `94771234567`) to the bare-digits E.164 form the gateway expects, and
   rejects anything that doesn't resolve to a plausible 9-digit Sri Lankan
   subscriber number rather than forwarding garbage to the gateway. Text.lk
   documents no outbound delivery-receipt webhook for this account tier —
   only an *inbound* webhook for replies — so delivery confirmation for now
   is whatever the synchronous send response reports; a later phase could
   poll `GET /sms/{uid}` if firmer delivery confirmation is needed.

## 39. Notification Rules engine actually dispatches; one reminder scheduler, not two (2026-08-28)

1. **The Rules engine (`NotificationEvaluatorService`) could not have sent
   anything, on any channel, before this — including SMS.** `execute()` was
   a stub that only logged `"Would send..."`; the scheduler's own
   "already sent?" dedup check queried `notification_log`, a table the
   Activity Log screen never reads, and unconditionally wrote a fabricated
   `status: 'SENT'` row there regardless of whether anything was actually
   sent. Discovered while wiring Text.lk in — building the real SMS
   provider (§38.7) would have had no visible effect without this fix, and
   the existing behavior silently lied to whoever read that log. `execute()`
   now calls `NotificationService.sendForRule()`, a new method that creates
   a real `Notification` row (visible in the Activity Log, participating in
   quota/retry like any other channel) and dispatches it through the same
   provider machinery every other send path uses. A channel is skipped with
   a logged reason (not silently dropped) when the customer has no
   email/phone on file for that channel.
2. **Two independent reminder schedulers were running at once, and only one
   should exist going forward — confirmed with the product owner.** The
   original P15 scheduler (`notification.scheduler.ts`, every 15 min) fired
   a hardcoded CONSOLE+EMAIL 24h/2h reminder unconditionally, for every
   tenant, regardless of any Rule. The newer `NotificationSchedulerService`
   evaluates each tenant's Rules — but before this fix, that engine did
   nothing (point 1), so the two were dormant-compatible by accident. Making
   Rules actually send meant an Owner configuring a "24h reminder" Rule
   would receive both the old automatic email and the new Rule's email/SMS —
   a real duplicate, and real duplicate cost once SMS carries a per-message
   price. Decision: the Rules engine replaces the old scheduler outright,
   not "old scheduler stays as an unbreakable baseline" and not "just turn
   the old one off with nothing to replace it" — either alternative was
   rejected, the first for keeping two permanent parallel paths (this
   project's own single-engine convention, applied here as much as to
   availability/pricing/refunds), the second for silently regressing every
   tenant's existing reminders to nothing.
3. **Every ACTIVE tenant is backfilled with two default Rules** (24h and 2h
   before appointment, channels `console`+`email`, matching the retired
   scheduler's exact behavior) via migration `DefaultReminderRules
   1750000600000`, idempotent on `(tenantId, timingType, offsetHours)` so
   re-running it is a no-op. The old scheduler's cron method is deleted, not
   just disabled, along with its now-dead `NotificationService.runReminderScan`/
   `scanAndFireReminders` and their tests. Existing behavior is unchanged
   the moment this runs, but it is now a real, editable Rule an Owner can
   see in Notifications > Rules and change — add SMS, adjust timing, add
   targeting — instead of fixed, invisible code.
4. **Notification templates gained an `isEnabled` toggle** (migration
   `NotificationTemplateEnabled1750000700000`, defaulting every existing row
   to enabled), surfaced as a switch in the admin Templates tab for
   whichever roles already hold `MANAGE_NOTIFICATION_TEMPLATES`
   (Owner/Manager). `NotificationEvaluatorService`'s system-template
   fallback now only selects `isEnabled: true` rows. Caveat disclosed, not
   hidden: today, every Rule created through the admin Rule drawer always
   carries its own inline `templateBody` (the field is required), so it
   never falls back to a system template — meaning disabling a system
   template currently has no effect on a Rule-driven send, only on the
   fallback path itself. The toggle is still real and correctly enforced
   where templates *are* consulted; it just isn't yet the only thing
   standing between an Owner and a send, which would need the Rule drawer
   to support "use the system default" as an alternative to an inline body.
5. **Not fixed here, left as a known follow-up:** `SystemTemplatesService
   .seedForTenant()` (which seeds the 31 default templates) and an
   equivalent seed for the two default reminder Rules are never called from
   live tenant-provisioning code — today they exist only because a
   migration backfilled them for tenants that already existed at the time
   each migration ran. A tenant provisioned after both migrations have
   already run would get zero system templates and zero default reminder
   Rules. Not fixed in this pass to keep it scoped to making SMS work
   correctly; worth wiring into tenant provisioning before a real second
   salon onboards.

## 40. Per-event kill switch — "don't send Cancellation messages at all," not a per-template toggle (2026-08-28)

1. **§39.4's `NotificationTemplate.isEnabled` toggle didn't do what the
   product owner actually wanted, and they caught it immediately.** That
   toggle only affects the one, narrow fallback path used when a Rule has
   no inline message text — and every Rule made through the admin drawer
   always has inline text (the field is required), so disabling a system
   template currently has zero effect on any real send. The actual ask was
   simpler and more useful: "if I turn off Cancellation, cancellation
   messages stop going out — on every channel, everywhere" — a tenant-wide
   kill switch per `NotificationEvent`, not per channel-variant of text.
2. **New `notification_event_setting` table** (tenantId, eventType,
   isEnabled — unique per pair), checked via `NotificationService
   .isEventEnabled()` before *any* dispatch for that event: inside `fire()`
   (the hardcoded lifecycle path — booking/payment/cancellation/reschedule/
   no-show/late-arrival), inside `sendCampaignMessage()` for WINBACK_OFFER,
   and at the top of `NotificationEvaluatorService.evaluate()` for the
   Rules/reminder path — so a disabled event returns zero results before
   even reading Rules, rather than "matched but every channel happened to
   skip." No row for a (tenant, event) pair means enabled, deliberately: a
   `NotificationEvent` added in the future defaults to "on" with no
   migration required to say so, and no existing tenant needed backfilling.
3. **Surfaced as a new "Notification Types" tab** in the admin Notifications
   screen — one row per event (Booking Confirmation, Payment Confirmation,
   24h/2h Reminder, Cancellation Confirmation, Reschedule Confirmation,
   No-Show, Late Arrival, Win-Back Offer), each a single on/off switch,
   Owner/Manager only (`MANAGE_NOTIFICATION_RULES`), with the event's
   trigger described in plain language rather than the enum name. Placed
   first among the tabs — "should this even send" is more fundamental than
   the Rules/Templates/Log tabs that follow it.
4. **The §39.4 template toggle was kept, not removed** — it's still
   correctly wired to the one fallback path it actually governs, and stays
   useful once a Rule can be built to reference a system template instead
   of always carrying inline text (§39.4's own noted follow-up). The two
   toggles now answer two different, non-overlapping questions: "should
   this event send at all" (this section) vs. "which starting-point text
   would an as-yet-unbuilt template-based Rule use" (§39.4).

## 41. Notification quota is enforced, not just displayed — CONSOLE stays unmetered (2026-08-28)

1. **Phase 2 of the SMS plan.** `NotificationQuota` (migration
   `NotificationQuota1750000500000`) had columns for monthly per-channel
   sent counts and limits, and `GET /notifications/quota` read them, but
   nothing ever incremented a counter or blocked a send at the limit — the
   quota card in the admin UI showed real limits against permanently-zero
   usage. `NotificationService.attemptDelivery()` now checks the tenant's
   current-month row before calling the provider, and increments the right
   column — atomically, via TypeORM's `increment()` (`col = col + 1` at the
   DB level, not read-then-write) — only after a *confirmed successful*
   send. A message that failed at the gateway was never actually delivered,
   so it doesn't count against the tenant's allowance.
2. **CONSOLE is deliberately exempt from being blocked, though its usage is
   still counted for reporting.** It's the codebase's own documented
   "guaranteed-offline, always succeeds" fallback (Decision Q4) — `fire()`
   creates one for every single lifecycle event, so a busy salon could
   plausibly approach its default 5000/month console cap through entirely
   ordinary volume. Gating it the same way as paid SMS would risk locking
   an Owner out of their own booking/payment/reminder confirmations over a
   channel that costs nothing and was explicitly designed to never fail.
   EMAIL/SMS/WHATSAPP are all enforced — a blocked send is recorded
   `FAILED` immediately (not queued into the retry backoff, since retrying
   sooner won't help until the counter resets next month) with a message
   naming the exceeded quota, not a generic failure.
3. **The existing `alertedAt` column is now used**: crossing 80% of a
   channel's monthly limit logs a warning and stamps `alertedAt` once, so
   repeat sends in the same month don't re-log. This is intentionally the
   simplest possible mechanism — a server log line, not a new notification
   channel of its own — appropriate for how far this project's alerting
   needs to go today; a dashboard banner or an actual email-to-owner alert
   is a natural next step if this proves not enough.

## 42. Closed the `notifications` module-gate gap — every other module-gated feature already had this (2026-08-28)

1. **Phase 4 of the SMS plan.** The `notifications` entitlement key has
   existed since the Lite/Pro split (`packages/shared/tenant-entitlements
   .ts` §34) and `ModuleGuard`/`@RequiresModule` is the established,
   already-working mechanism enforcing it — `reports`, `inventory`,
   `attendance`, `incentives`, `invoices`, and `auditLog` controllers all
   apply it. `NotificationController` was the one gate never wired up,
   flagged as a known gap as far back as the original UAT plan. A Lite-plan
   tenant could reach every notification endpoint — Rules, Templates,
   real SMS sends, quota — with nothing stopping them. Fixed with the same
   one-line `@RequiresModule("notifications")` every sibling controller
   already carries; no new guard logic, no new pattern.
2. **Verified safe before shipping, not assumed.** The local demo tenant
   (`elegance`) is explicitly `entitlements.tier: "PRO"`, confirmed
   unaffected live (`GET /notifications` and `/notifications/event-settings`
   both still 200). A second local tenant with no tier override (defaults
   to LITE, per `resolveModules`) turned out to already be suspended from
   earlier test fixtures — blocked one guard layer earlier
   (`TENANT_SUSPENDED`) before ever reaching this one — so the specific
   `MODULE_NOT_ENABLED` 403 wasn't independently re-demonstrated live for
   this change. Confidence instead comes from the mechanism being
   unmodified, already-proven code shared with six other controllers; not
   worth un-suspending a test fixture to force a redundant demonstration.

## 43. Public, no-login unsubscribe link for marketing messages (2026-08-28)

1. **Phase 4b of the SMS plan.** Win-back/marketing messages had no
   self-serve opt-out mechanism at all — a customer's only recourse was
   calling the salon and asking staff to flip `marketingOptOut` for them via
   `PATCH /customers/:id`. Sri Lanka's telecom rules expect a promotional
   message to offer a way to stop it, and this closes that gap.
2. **`GET/POST /customers/:id/unsubscribe` is deliberately tenant-agnostic**
   — the customer's own id (a UUID primary key, globally unique) is the only
   credential, not the `(tenantId, phone)` pair `CustomerController`'s
   `findById` requires. A one-tap link from an SMS/email can't ask its
   recipient to re-type identifying details to prove ownership. The
   accepted tradeoff: the worst case of this id being guessed or leaked is
   a customer opting out of marketing they never chose to see — mildly
   annoying and staff-reversible, not a destructive or financial action —
   the same "low friction over cryptographic rigor" posture
   `bookingReference` already carries for cancel/reschedule links, just
   without even that link's second factor (phone), because there is no
   appointment/phone pairing to check for a message with no appointment
   behind it.
3. **Lives in its own `@Public()` controller**
   (`CustomerUnsubscribeController`), not bolted onto the existing
   `CustomerController` — that controller carries a class-level
   `@Permissions(MANAGE_CUSTOMERS)` guard, and fighting that for one route
   risked accidentally weakening it for the others. Same shape
   `BookingController` already uses for its own self-service routes: a
   whole controller marked public, sharing a path prefix with a protected
   sibling controller without colliding.
4. **GET, not just POST, and a confirm-then-submit page, not a bare
   GET-triggers-the-action link** — an SMS/email link-preview crawler
   fetching the URL to render a rich preview must not silently opt someone
   out. The public `apps/web` page at `/unsubscribe/[customerId]` reads
   state via `GET` (safe to fetch blindly) and only mutates on the
   customer's explicit button press (`POST`), mirroring `/receipts/[id]`
   and `/booking/[reference]`'s existing "id in the URL, no login" shape.
5. **`{unsubscribeUrl}` is honored where the Owner places it, but appended
   automatically if they don't** (`winback.service.ts`'s `personalize()`)
   — compliance shouldn't depend on every Owner remembering to include the
   token in every custom message. Wording is deliberately channel-neutral
   ("Visit … to stop these messages", not "Reply STOP"): `sendCampaignMessage()`
   only ever fires CONSOLE+EMAIL today, never SMS (win-back campaigns are
   not yet wired to the Rules/SMS path at all — a separate, undecided
   question from this fix, noted here rather than silently addressed), so
   an SMS-specific instruction would be actively wrong for an email
   recipient.
6. **Delivery-status polling (`GET /sms/{uid}` for a message Text.lk's
   synchronous response left non-final) was deliberately deferred, not
   forgotten.** Confirmed with the product owner: build it once real
   traffic through an actual Text.lk account shows messages that need it,
   rather than speculatively now against a vendor response shape that's
   only been read from documentation, never exercised live.

## 44. Appointments must be dated today before check-in/start-service/complete (2026-08-28)

1. **The rule.** Check-in, start-service, and complete are all blocked
   (`APPOINTMENT_DATE_MISMATCH`, 409) unless the appointment's stored
   `appointmentDate` is today (Asia/Colombo). A stale `CONFIRMED` booking
   nobody checked in on its day, or a future one someone's trying to serve
   early, must be moved to today first — the system never silently treats
   "whatever day it says" as "now."
2. **Two different fixes for two different situations, both reached through
   one new endpoint, `POST /appointments/:id/move-to-today`
   (`MANAGE_APPOINTMENTS` only — never `MANAGE_OWN_APPOINTMENT`, so a
   stylist can never self-correct a date; they're told to ask the front
   desk).** A `CONFIRMED` appointment hasn't been claimed onto today's
   calendar for real, so it goes through the *same* reschedule engine every
   other date change uses (`BookingService.rescheduleAppointment`, now
   accepting an `isDateCorrection` flag) — same availability check, same
   GiST-backed safety, just logged as `APPOINTMENT_DATE_CORRECTED` instead
   of `APPOINTMENT_RESCHEDULED` and never firing `RESCHEDULE_CONFIRMATION`.
   A `CHECKED_IN`/`IN_SERVICE` appointment is already actively happening —
   closing it out and creating a new appointment row would lose
   `checkedInAt`/`inServiceAt` and hand the visit a new booking reference
   mid-service, so that case is a plain in-place date correction on the
   same row (no new appointment, no slot re-check — the DB's exclusion
   constraint is still the real backstop against a genuine clash).
3. **No customer notification for either fix.** This is a front-desk data
   correction for someone who is, in the ordinary case, standing at the
   counter — not a change they asked for. Confirmed explicitly rather than
   assumed: sending the usual reschedule SMS/email here would be redundant
   at best, confusing at worst.
4. **The frontend surfaces one "Move to today" button** in the shared
   `AppointmentDetailDrawer`, offered only to elevated roles; a STAFF-only
   viewer instead sees "ask the front desk." Tapping it tries the same
   time-of-day today first (silent); if that slot isn't free, the existing
   reschedule slot-picker opens in a "date-correction" mode that calls
   `move-to-today` instead of `reschedule`. Either way, the action the
   operator originally tapped (check-in/start-service/complete) retries
   automatically once the date is fixed.

## 45. A stylist's own appointments, on the Floor app (2026-08-28)

1. **The gap.** `GET /appointments` already scoped results to the caller's
   own `staffId` for `MANAGE_OWN_APPOINTMENT` (and already supported
   `?date=`), but nothing in the Floor kiosk actually called it — the
   kiosk was entirely attendance (Today/History/Requests) plus Earnings.
   A stylist logging into their own account had no way to see who they
   were seeing that day.
2. **New "Schedule" tab, no backend change.** `apps/admin`'s existing
   `AppointmentDetailDrawer` is reused as-is, so a stylist gets the exact
   same in-service/complete actions (and the date-mismatch handling from
   §44) the desk uses — not a second implementation of appointment status
   changes.

## 46. Customer accounts, sign-up, and phone verification (2026-08-28)

1. **Guest booking is untouched.** Phone + reference code, no login,
   sub-60-second booking — the architecture CLAUDE.md §2 already commits
   `apps/web` to — keeps working exactly as it does today. An account is
   an optional, faster path for a repeat customer, never a requirement to
   book.
2. **One account works across every salon on the platform**, not one
   account per tenant. `customer_account` is deliberately a new,
   platform-level table — not tenant-scoped like the existing `Customer`
   entity, which still means exactly what it always has ("this person's
   booking history at this salon"). `customer_account_salon_link` is what
   will connect the two once a logged-in account actually books somewhere;
   the table exists now with the rest of the schema but nothing populates
   it yet — booking-flow integration is later work, following the
   frontend mockup.
3. **Built ourselves — no Neon Auth.** Neon Auth (Neon's hosted auth
   product) is built around email/password or social login, not
   phone-number-plus-OTP; the OTP flow that's the actual point of this
   feature would have to be hand-built either way, and the tenant-free
   "one account, many salons" resolution isn't something it knows about
   regardless. Bringing it in would add a dependency without removing the
   part that's actually the work. `apps/api/src/customer-auth` instead
   mirrors the existing staff auth module's already-proven pattern exactly
   — argon2id (`PasswordService`, reused directly), an opaque
   rotate-on-use refresh token with reuse detection
   (`CustomerRefreshSession`, same design as `RefreshSession`), and a
   short-lived HS256 access token — kept as fully separate tables/services
   rather than generalizing the staff versions, because a customer session
   carries no tenant or role to resolve, and forcing one code path to
   handle both would mean every read branches on which kind of session it
   found. The access token's audience (`salon-web-customer` vs. staff's
   `salon-reservation`) is a real cryptographic boundary, not just a
   naming convention — one kind of token is rejected outright by a guard
   expecting the other.
4. **Password logs a returning customer in on a new device; OTP is only
   ever for verifying a phone number** (at signup, or if a phone number
   ever needs to change later) — not re-required on every login. This
   mirrors Uber/PickMe's actual behavior (verify once, then password or a
   remembered session), and was called out explicitly during planning as
   the one place a different reading of "just like Uber" was plausible.
5. **OTP codes are never stored raw** — only a SHA-256 hash, same policy as
   a refresh token — and sending rides the same `SmsNotificationProvider`
   (Text.lk) notifications already use, now exported from
   `NotificationModule`, rather than a second SMS integration. Capped at 5
   wrong guesses per code (then a resend is required) plus network-level
   rate limits tighter than ordinary login (`customer-otp-send`:
   3-per-10-minutes per phone) — a send is a real cost through the paid
   gateway, not just an abuse surface.
6. **Frontend followed the project's standing UI workflow**: a static
   mockup (via `/impeccable`, consulting `/ui-ux-pro-max` for the
   timed-modal and OTP-input patterns) was reviewed and approved before
   any real component was written, then built to match it — see points 7–8.
7. **The whole optional-account flow lives in one place**:
   `CustomerAuthProvider` (`apps/web/src/context`) holds the account, the
   silent-refresh-on-load that makes a returning customer's login
   persistent, and which of five screens (prompt/signup/created/login/otp)
   is on screen, if any — rendered by one `AccountOverlay` mounted once in
   the root layout. The booking-confirm button
   (`payment-step.tsx`) opens straight to the `otp` screen through the same
   context rather than a second OTP implementation. The timed prompt
   (40s dwell, once per browser tab via `sessionStorage`) is suppressed the
   instant `useBookingWizard`'s step leaves `"services"` — it must never
   appear mid-task, only while someone is still just looking.
   Password guidance is a live strength bar plus a three-item checklist
   (length, a number/symbol, mixed case) that only ever *guides* — the one
   rule that actually blocks submission is the server's real one, 8–128
   characters.
8. **Deliberately not wired yet, and worth naming rather than leaving
   silent**: booking a slot while logged in does not look up or create a
   `customer_account_salon_link`, and the booking-details form is not
   pre-filled from the account — a verified customer still retypes their
   name, phone, and email today. Wiring the account into
   `BookingService.reserveAndConfirm` is the follow-up that actually
   delivers "skip the form," and it touches core booking logic, so it
   wasn't bundled into this pass without a separate go-ahead. Also
   dropped: the mockup's "Wrong number? Change it" link on the OTP
   screen — there is no endpoint yet to change a verified phone number, so
   showing a link that goes nowhere would be worse than not offering it.

## 47. Admin desk shell: collapsible nav + a mobile-usability pass (2026-08-28)

1. **The bug.** `apps/admin`'s sidebar (23 items across 7 groups) never
   collapsed below `lg` (1024px) — it rendered as a full-width block
   *stacked above* the page, pushing content down. `docs/UX.md` §5 already
   specified the fix ("sidebar collapses to drawer" below 1024px); only
   the "stack to single column" half of that spec had ever been built.
   This finishes it: a new sticky `AppTopbar` (hamburger) below `lg`,
   `AppSidebar` becomes a left-docked off-canvas panel driven by a
   `transform` transition (not a keyframe, since — unlike every other
   drawer in this app — it must stay permanently mounted; it's the same
   element as the static `≥lg` rail), state lifted into `(app)/layout.tsx`.
   Auto-closes on route change, Escape, and backdrop click; background
   `<main>` goes `inert` while open; a `matchMedia` listener force-closes
   it if the viewport crosses back to desktop width while open, so the
   body-scroll lock can never get stuck on. `≥lg` is unchanged — same
   classes, same static rail, verified pixel-identical via screenshot.
2. **Two real clipping bugs, not just polish.** `globals.css` sets
   `overflow-x: hidden` on `html, body`; a wide element without its own
   `overflow-x-auto` silently clips on a narrow screen instead of
   scrolling — the Attendance table (`overflow-hidden` instead of
   `overflow-x-auto`) and the Reports "Product sales & margin" panel (no
   wrapper at all) were both actually losing data on a phone, not just
   looking squeezed. Fixed both; swept the other eight `reports/*.tsx`
   panels and found no further occurrences.
3. **Mobile-usability pass** (the deeper option, chosen when asked how far
   to take this): the staff×service (`SkillsMatrix`) and staff×weekday
   (`RotaGrid`) grids already scrolled but were genuinely hard to use on a
   phone (rotated headers, thumbnail checkboxes) — each now swaps to a
   `<lg` accordion (native `<details>`, no existing precedent either way
   in this codebase) built on the exact same draft/save state as the grid,
   presentation-only. Quick Sale's product/bundle results grid had its
   column-count breakpoints re-tuned — `md:grid-cols-4` assumed full
   viewport width, but at `lg` that same space is split against the
   sidebar and a 380px cart, so it stepped back to 2 columns there and
   climbs through `xl`/`2xl` as room returns. Added `break-words` to the
   product-import error table's message cell (same silent-clip risk as
   point 2, lower odds of firing).
4. **Test-id collision, caught before it shipped.** The mobile accordions
   initially reused the desktop grid's `data-testid`s. Since both mount
   simultaneously (CSS just hides one via `lg:`), that would have broken
   `staff.spec.ts`'s `[data-testid^="matrix-row-"]` locator the moment it
   matched two elements instead of one — Playwright's strict mode. Every
   mobile-variant id now leads with `mobile-` (`mobile-matrix-row-…`,
   `mobile-rota-row-…`, …) so no existing prefix selector can ever match
   both.
5. **Verified, not just typechecked**: a standalone Playwright script
   (not part of the e2e suite) drove the running dev server through the
   drawer's full interaction set — open/close via toggle, nav-item tap,
   Escape, backdrop click, the 1023/1024 breakpoint edge, body-scroll-lock
   engaging and releasing — plus screenshots confirming the mobile
   accordion and `≥lg` grid both render correctly and the desktop rail is
   visually unchanged.
6. **Not touched**: the Floor kiosk (`(floor)/**`, already mobile-first,
   a deliberately separate surface per `apps/admin/PRODUCT.md`) and the
   Platform/SUPER_ADMIN shell; `visible()`/module-gating logic; any shared
   `Button` component (this app hand-styles buttons per call site — a
   consolidation refactor is a separate decision, not bundled in here).

## 48. Per-salon activate/deactivate — customer visibility, independent of staff access (2026-08-28)

1. **The ask.** A platform admin needs to hide a specific salon from
   customer-facing discovery/booking — e.g. a salon that's paused
   operations — without cutting off its own staff's admin access.
2. **Deliberately not `Tenant.status`.** `TenantStatus` (ACTIVE/SUSPENDED/
   TRIAL) already gates staff/admin login live, on every request
   (`TenantGuard`). Reusing it here would take staff access down along
   with customer visibility — a different decision nobody asked for. New,
   independent column instead: `Tenant.customerBookingEnabled` (boolean,
   `DEFAULT true` so every existing tenant's current behavior is
   unchanged). Two axes, two meanings, never conflated.
3. **One shared choke point closes both discovery paths.** The public
   salon directory (`SalonService.list`) already filtered
   `WHERE status = ACTIVE`; it now also requires the new flag, folded into
   the same `.where()` (not a second `.andWhere()`) to keep the existing
   "no andWhere call without a search term" test's contract intact. More
   importantly, `TenantService.findActiveBySlug` — already shared by the
   salon profile page, the availability check, *and* booking creation —
   got the same check added once, so all three call sites are protected
   without three separate changes and without trusting a customer's
   browser to have already seen a "come back later" state before it POSTs
   a booking directly.
4. **A distinct error code, not folded into 404.** An unknown/suspended
   slug still 404s (`SALON_NOT_FOUND`) — a deactivated salon exists and is
   operating, so it gets its own `403 SALON_BOOKING_DISABLED`. The
   customer site (`apps/web`) catches that code specifically and renders a
   branded "not accepting online bookings right now" page instead of
   either the wizard or a dead-end 404.
5. **Existing bookings are untouched, on purpose.** Self-service
   cancel/reschedule-by-reference never routes through
   `findActiveBySlug` — confirmed by checking every caller, not assumed —
   so a customer with a confirmed appointment can still manage it after
   their salon is deactivated. Self-service *reschedule* specifically was
   left as-is (not additionally gated) since it wasn't part of what was
   asked; picking a literal new slot at a deactivated salon via reschedule
   remains possible today and would need its own decision to close.
6. **Audited like every other platform-admin mutation.** `SuperAdminService
   .setCustomerVisibility` records `TENANT_CUSTOMER_VISIBILITY_UPDATED`,
   matching `updateEntitlements`'s existing audit shape exactly — same
   `PLATFORM_ADMIN`-gated route pattern, same server-derived `tenantId`
   (URL param, never trusted from a body), same DTO-whitelist-only input
   (`UpdateTenantVisibilityDto` accepts exactly one boolean field).
7. **Verified live**, not just unit-tested: deactivated a real local
   tenant end-to-end — disappeared from `GET /salons`, its profile/booking
   endpoints returned the new 403, staff login for that same tenant kept
   succeeding throughout, the customer site rendered the friendly page,
   and the admin platform page's new Activate/Deactivate button and
   "Hidden from customers" pill round-tripped correctly in both
   directions (screenshots taken at each step) — then reactivated to
   leave the dev database as found.

## 49. Two UAT gaps fixed: product deactivation didn't stick, and Products/Stock over-restricted Receptionist (2026-08-29)

1. **The bug (UAT PRD-16).** Deactivating a product's own toggle promises
   "stop it appearing in Quick Sale," but `product.service.ts`'s
   `lookupVariants()` — the query Quick Sale's search actually hits —
   filtered `v.active = true` on the variant alone and never checked the
   parent product's `active` flag, so a deactivated product's still-active
   variants stayed fully sellable. Fixed with one more `.andWhere(
   "product.active = true")`, since `product` was already joined for the
   sort order; regression test added.
2. **The second half of PRD-16**: once deactivated, a product vanished
   from `/products` with no way back — not because reactivation was
   broken (`PATCH /products/:id { active: true }` always worked, confirmed
   by UAT restoring state that way), but because the *page* never asked
   for inactive products. The API already had `includeInactive` on
   `ProductQueryDto`, unused by the frontend. Added a "Show discontinued"
   checkbox to the Products page wired to that existing param — no
   backend change needed here, and no drawer change either, since the
   existing edit drawer's "Active" checkbox already flips it back.
3. **The bug (UAT PRD-20).** `product.controller.ts`'s own comment states
   the intended policy plainly: *"reads open to whoever can also take a
   payment, writes MANAGE_INVENTORY only"* — and the server enforces
   exactly that (`@Permissions(MANAGE_INVENTORY, RECORD_PAYMENT)` on the
   read routes). The admin frontend never implemented that split: the
   Products and Stock pages gated their *entire* page behind
   `canManageInventory`, showing a placeholder to RECEPTIONIST instead of
   read access the server always granted.
4. **Fix mirrors the server's OR exactly.** New `canViewInventory` in
   `apps/admin/src/lib/permissions.ts` = `canManageInventory(roles) ||
   canRecordPayment(roles)`. Both pages' top-level gate switched to it;
   the actual write affordances (Create/Import product, Receive/Adjust
   stock) stay behind `canManageInventory` specifically, matching
   `inventory.controller.ts`'s write routes, which really are
   `MANAGE_INVENTORY`-only with no OR.
5. **`ProductDetailDrawer`'s in-drawer writes, found while fixing point 4,
   fixed too on request.** Its "Edit" button and each variant's inline
   edit form had no role gate at all — a RECEPTIONIST who can now open the
   drawer (per point 4) would see an Edit button the server would still
   correctly reject at 403 on save. Flagged first rather than silently
   fixed; the user asked for it too. Product-level Edit button and
   `AddVariantForm` now hidden behind `canManageInventory`, matching the
   page-level pattern. For a variant row specifically: rather than
   retrofit a disabled/read-only mode into every field type (plain
   inputs, a checkbox, the image uploader, and `AttributesEditor`, which
   has no such mode at all), a read-only viewer gets the same summary row
   with no expand-to-edit affordance whatsoever — consistent with how the
   product-level Edit button is hidden outright rather than shown
   disabled, and far less new surface than building a parallel read-only
   rendering path for a component nobody asked to view in more detail.
6. **Verified**: typecheck, lint, and the full `product.service.spec.ts`
   suite (22 tests, including the two new ones) all green; `apps/admin`
   typechecks, lints and builds successfully after the drawer changes too.
   `docs/uat_results.json`'s PRD-16 and PRD-20 entries updated to
   `completed: Yes` with the fix described.

## 50. KNOWN GAP, DEFERRED TO GO-LIVE — standard notification templates are never actually rendered (2026-08-29)

**Found while wiring real email delivery (Brevo).** There are two entirely
separate systems for notification content, and only one of them is
connected to what customers actually receive:

1. **`NotificationTemplate` rows** — 31 of them, auto-seeded per tenant by
   `system-templates.service.ts`, one per (event type × channel). Fully
   editable in the admin Notifications → Templates tab, with a real
   Handlebars renderer (`template-renderer.service.ts`): variable registry,
   `{{#if}}` conditionals, `formatCurrency`/`formatDate`/etc. helpers, a
   live preview. This is what an Owner edits believing it controls what
   gets sent.
2. **`NotificationService.buildMessage()`** — the method actually called by
   `attemptDelivery()` every time `booking.service.ts` fires one of the 8
   standard lifecycle events (booking confirmation, payment confirmation,
   24h/2h reminders, cancellation, reschedule, no-show, late arrival). It
   is a hardcoded switch statement building a plain interpolated string and
   **never reads a `NotificationTemplate` row or calls the renderer at
   all**. This is confirmed by production behavior: editing the Booking
   Confirmation template has zero effect on the email actually sent.

The only consumer of the template system today is
`NotificationEvaluatorService` (the custom Notification **Rules** an Owner
can build, e.g. a bespoke win-back rule) via `NotificationService.sendForRule()`,
which does pass pre-rendered text through. The 8 standard events do not go
through rules at all — they call `fire()` directly.

**Also found while scoping the fix — some template variables have no real
data source yet:**
- `cancelUrl` / `rescheduleUrl` — no self-service cancel/reschedule page
  exists in `apps/web`. The seeded templates already wrap every reference
  to these in `{{#if}}`, so once the renderer is wired in, they correctly
  disappear rather than rendering broken links — no separate fix needed
  for that half.
- `salonEmail` — no such field exists anywhere (not on `Tenant`, not on
  `Branch`). Also `{{#if}}`-guarded in the templates, so it will correctly
  just not appear.
- `salonPhone` / `salonAddress` — real data exists, on `Branch` (MVP's
  single branch per tenant).
- `totalAmount` / `paymentMethod` (Payment Confirmation template only) —
  **not** `{{#if}}`-guarded in the seeded template, and `fire()`'s current
  signature only receives `(tenant, event, appointment, customer)`, no
  payment record. Wiring these correctly needs a small added lookup
  against the actual `Payment` row for that appointment.

**Decision: hold, fix before go-live.** The user chose not to fix this now
and asked for it to be tracked and raised again when they announce they're
going live with a real client — same trigger point as the credential
rotation walkthrough (F-01, `SECURITY_AUDIT_REPORT.md`). **The fix, when
picked up:** make `buildMessage()` look up the tenant's `NotificationTemplate`
row for `(eventType, channel)`, build a `TemplateContext` from real
appointment/customer/tenant/branch data (and the payment record, for
`PAYMENT_CONFIRMATION`), and render it via `TemplateRendererService.render()`
— falling back to today's hardcoded string only if no template row exists
for that tenant (shouldn't happen given seeding, but keeps the "never
silently fail" behavior this codebase already follows elsewhere). No new
pages or entity fields needed for this pass; `cancelUrl`/`rescheduleUrl`/
`salonEmail` stay absent until those features exist separately.

## 51. Salon offboarding — deactivate, retain 90 days, then anonymize (2026-08-29)

1. **The ask, and why the obvious answer was wrong.** The user asked to add
   "delete a salon" from super-admin, explicitly on the assumption that
   deletion means erasing everything from the database — then asked, before
   any planning, whether that was actually the right way to do it. It
   isn't: it directly conflicts with CLAUDE.md §1.8 ("No hard deletes on
   business records... preserve appointment, payment, refund, and audit
   rows"), and would cascade-destroy exactly that data — every tenant-owned
   FK except `audit_log` (`SET NULL`) cascades on `tenant.id` today. §8 of
   this document already flagged this moment as coming: "neither tenants
   nor users are hard-deleted in this codebase today, so this is
   future-proofing." This is that decision.
2. **The shape, confirmed with the user:** deactivate immediately
   (reversible) → retain 90 days → purge (anonymize personal data, never
   touch payment/appointment/refund/audit rows). Standard SaaS offboarding
   pattern; the retention length and "anonymize, don't delete" scope were
   both explicit choices, not defaults assumed unasked.
3. **Deactivation reuses `TenantStatus.SUSPENDED` — a status that already
   existed and was already enforced, but had no code path that ever set
   it.** `TenantGuard` has always 403'd non-`ACTIVE` tenants
   (`TENANT_SUSPENDED`) on every request; no endpoint had ever written
   `status` away from its `ACTIVE` default. `TenantOffboardingService
   .deactivate()` sets `status = SUSPENDED` *and*
   `customerBookingEnabled = false` (§48's flag) together, so one action
   removes a salon from both staff login and customer discovery — no new
   guard logic needed, just finally wiring up enforcement that was already
   live.
4. **A new, separate `deletionRequestedAt` column drives the retention
   clock — deliberately not reusing `status` alone to mean it.** A
   hypothetical future "suspend for non-payment" feature could reuse
   `SUSPENDED` without starting an offboarding countdown. `purgedAt` marks
   the terminal state (no further reactivation possible once set);
   `deactivationReason` is free-text, audit-trail-only, never validated.
5. **The tenant's slug is renamed at deactivation, not at purge** —
   `${slug}--removed-<epoch>` — because `IDX_tenant_slug` is an
   unconditional unique index with no soft-delete awareness, and waiting
   the full 90 days to free a departed salon's name for reuse serves no
   one. Reactivation tries to restore the original slug and silently keeps
   the renamed one if another salon has since claimed it — a cosmetic
   trade-off, not a blocking error.
6. **Future appointments are deliberately left untouched on deactivation.**
   No auto-cancel, no auto-refund. The salon/staff are expected to have
   resolved them beforehand; deactivation only surfaces the count
   (`futureAppointmentCount`) to the admin performing it, informationally.
7. **The purge anonymizes; it never deletes a business record.**
   `Customer`/`Staff`/`Inquiry` PII is scrubbed in place (unique
   placeholders for `Customer.email`/`.phone`, which carry per-tenant
   unique indexes — a fixed placeholder would collide across the second
   customer anonymized in the same tenant). `Payment`, `Refund`, `Invoice`,
   `Appointment`, `RetailSale`, and `AuditLog` are never touched — this
   service holds no repository for any of them, so it is structurally
   incapable of writing to them, not just disciplined about avoiding it.
   The `Tenant` row itself survives too (renamed to "Deleted Salon", not
   deleted), so `AuditLog.tenantId` keeps resolving to a real row forever.
8. **A `User` (staff login) is only anonymized if this was its only
   tenant.** `UserTenantRole` technically allows one user across multiple
   tenants even though nothing creates that today; the purge always deletes
   this tenant's membership row, and only scrubs the shared `User` row
   (email/name, `status = DISABLED`) when no other tenant's membership
   remains for that user. A platform-level `CustomerAccount` (customer-auth)
   is treated the same way in spirit — only its `CustomerAccountSalonLink`
   row for this tenant is removed, never the account itself, since it may
   have bookings at other salons.
9. **Manual immediate purge exists for a genuine erasure request, gated
   behind having already deactivated first** — no endpoint can jump
   straight from `ACTIVE` to purged. The "confirmation step" the user asked
   for is deliberately client-side (planned: type-the-salon-name-to-confirm
   in the admin UI), not server-side, since the API call itself is the
   confirmed action once the client gate is passed.
10. **Every deactivation, reactivation, and purge sends an unconditional
    platform-admin email** via the existing `PlatformAlertService` — this
    is a destructive/high-consequence action, not a graded security signal,
    so it does not go through `classifySecurityEventSeverity()`'s
    HIGH/CRITICAL-only gate the way security events do; a human should
    know about every one of these, always.
11. **Not built this pass, flagged rather than assumed:** exporting a
    salon's data before purge (real scope of its own — format, tables,
    delivery — not asked for), and verifying actual Sri Lankan tax/financial
    record-retention minimums (the "anonymize, keep payment/refund records
    forever" default is the safe, industry-standard posture and matches
    CLAUDE.md already, but isn't a substitute for real legal confirmation
    if this is ever tested by a dispute).

## 52. Three UAT fixes: STF-08's silent gap, SVC-02's reversed uniqueness rule, APT-10's cash change (2026-08-29)

1. **STF-08 — a stylist with services assigned but no working hours was a
   silent, undiscoverable gap.** `skills-matrix.tsx` already banners the
   inverse failure ("no stylist qualified for X"); nothing surfaced the
   reciprocal one. Fixed by teaching `rota-grid.tsx`'s existing no-hours
   banner the difference — it now takes an optional `assignments` map (same
   shape `SkillsMatrix` already uses) and says "{name} is qualified for N
   service(s) but has no working hours set" instead of the generic message,
   whenever that stylist has ≥1 assigned service. `apps/admin/.../availability
   /page.tsx` now also fetches `fetchStaffServiceAssignments()` (the same
   bulk call `/staff`'s matrix tab already relies on) to feed it. No new
   endpoint, no new banner component — a smarter copy branch on an existing
   one.
2. **SVC-02 — reversed, on purpose, not a bug fix.** The UAT test's own
   note called the lack of a uniqueness constraint "as designed"; the user
   asked for that design reversed. Scope, confirmed with the user: unique
   among a tenant's *active* services only, case-insensitive — retiring a
   service frees its name. Enforced twice: a partial DB index
   (`IDX_service_tenantId_name_active`, `WHERE active = true`) as the real
   constraint, and a `ServiceService.assertNameAvailable()` pre-check for a
   friendly `SERVICE_NAME_TAKEN` error ahead of it — checked on create, on
   any rename, and on reactivating a retired service (which could
   reintroduce a collision the row's own history doesn't know about).
   **Migration safety, not assumed away:** SVC-02's own UAT run deliberately
   created a real duplicate-named pair in production to prove the old
   behavior — a naive unique constraint would fail against that today. The
   migration renames every duplicate but the newest per colliding group
   (`"Name (duplicate 2)"`, `"(duplicate 3)"`, ...) *before* adding the
   index, automatically, no manual cleanup required.
3. **APT-10 — cash tendered over the balance is now accepted, not
   rejected; every other payment method still hard-rejects it.** A card,
   bank transfer, gift card, or package amount is exactly what moves — there
   is no physical note to hand change back from, so those keep today's
   `PAYMENT_EXCEEDS_BALANCE` behavior unchanged. Cash alone gets the
   real-world treatment: tendering Rs.1,000 against a Rs.600 balance applies
   exactly Rs.600 to the invoice and records Rs.400 as change.
   `Payment.amountCents` keeps meaning exactly what it always meant (the
   amount actually applied) — every existing report, aggregate, and the
   offboarding purge's "never touch Payment" guarantee all stay correct
   with zero changes. Two new nullable columns, `tenderedCents`/
   `changeCents`, populated only for an over-tendered cash payment; null on
   every payment recorded before this shipped and on every ordinary payment
   after it. Surfaced on the receipt/invoice (in-app, email, and the admin
   payment drawer) as "(tendered Rs.X, change Rs.Y)" alongside the applied
   amount, never replacing it.
4. **Incidentally consolidated:** `formatCents()` existed as three separate,
   character-for-character-identical private copies (`booking.service.ts`,
   `gift-card.service.ts`, and now needed again in `payment.service.ts`)
   for the exact same "quote an amount back in an error message" need.
   Extracted to `common/money.util.ts` rather than adding a fourth copy;
   also fixed `payment.service.ts`'s two error messages
   (`PAYMENT_EXCEEDS_BALANCE`, `REFUND_EXCEEDS_PAYMENT`) that were
   showing raw cents ("60000 cents") instead of currency, the same
   formatting gap this consolidation exists to prevent from recurring.

## 53. Admin login brute-force protection — account-level lockout (2026-08-29)

1. **The ask was research-first, not build-first.** The user asked how to
   stop someone deliberately hammering the admin login with wrong
   passwords, explicitly wanting the industry-standard approaches weighed
   before anything was built. Researched what already existed (this
   session's own earlier work) before proposing anything new.
2. **What already existed and was already enough for a fast attacker:**
   `RateLimitGuard` enforces 10 attempts/minute per IP and 5/minute per
   email on `/auth/login`, and every failure is already audited
   (`LOGIN_FAILED`) and already escalates to a HIGH-severity platform-admin
   email after 5 failures in 10 minutes (the monitoring feature). **The gap
   only a slow attacker exploits:** one guess every 10 seconds is
   comfortably under 5/minute forever, with the identical generic "Email or
   password is incorrect." on every attempt, no matter how many.
3. **CAPTCHA and exponential backoff were both considered and declined.**
   CAPTCHA is real friction for a small, known user base (salon staff, not
   the general public) plus a new third-party dependency, disproportionate
   to the actual threat here. Exponential backoff (each failure doubling
   the delay before the next is even evaluated) is effective but adds real
   latency to the hot login path and its own footgun risk (an attacker who
   just needs someone's email can lock out a real user's normal login
   speed). **Chosen: account-level temporary lockout** — 5 wrong passwords
   for the same account within 15 minutes locks that account for the
   remainder of the window, independent of source IP. This is the standard
   pattern most SaaS admin panels use for exactly this gap.
4. **Built almost entirely from data that already existed.**
   `AuditService.lockoutExpiry()` is the only new method — it reuses the
   `LOGIN_FAILED`/`LOGIN_SUCCEEDED` audit trail every login already writes,
   rather than inventing new tracking state or a stored "locked" flag.
   `AuthService.login()` checks it before ever calling into
   `PasswordService.verify()`, on the exact same entityId convention
   `LOGIN_FAILED` already audits under (`user?.id ?? email`) — an unknown
   email degrades gracefully to a pure sliding window, since no
   `LOGIN_SUCCEEDED` can ever exist for a plain email string.
5. **A genuine login resets the count — an improvement over the plan's own
   literal first draft, not a silent scope change.** The plan as approved
   said "no separate unlock state needs to be stored," which is true, but
   a pure sliding window would keep counting failures from *before* a
   correct password, which is needless friction for a real user who typed
   their own password wrong a few times before getting it right. Instead,
   `lockoutExpiry()` only counts failures *after* the account's own most
   recent success — the standard OWASP-recommended behavior — computed from
   the same two audit actions with one extra indexed lookup, no new
   storage.
6. **The locked-out response is honest, not vague.** `429
   ACCOUNT_TEMPORARILY_LOCKED`, "Too many incorrect attempts. Try again in
   N minutes." — a real improvement over today's identical, unchanging 401
   on every attempt. `apps/admin`'s login page needed zero changes: it
   already surfaces whatever message the API returns verbatim.
7. **Scoped to admin/staff login only** (`AuthService`), matching the
   user's own framing and the approved plan. `customer-auth.service.ts`
   has the identical `LOGIN_FAILED`/`LOGIN_SUCCEEDED` audit shape already
   and could take the same `lockoutExpiry()` call with no new backend
   work — flagged as a natural follow-up if wanted, not built here since it
   wasn't what was scoped and approved.

## 54. Real stylist photos, job title, gender, and a public profile popup (2026-08-30)

1. **The gap:** the customer site rendered a stable-per-id stock photo for
   every stylist regardless of who they actually were, name only, and
   clicking a card did nothing — confirmed by research before building
   anything, not assumed. `Staff` gains three columns: `imageUrl`,
   `jobTitle` (free text, same convention as `specialties`), and `gender`
   (display only, per the locked decision — no booking-wizard filter).
2. **`imageUrl` follows `Product.imageUrl`'s pattern, not the tenant logo's**
   — a direct nullable column with its own migration, because `Staff` is a
   normal relational entity, not a settings bag. The upload pipeline
   (`StaffService.uploadPhoto`/`assertPhotoValid`) is a close copy of
   `ProductService`'s own (same `detectImage` magic-byte sniffing, same
   size/dimension checks), with one deliberate difference: aspect ratio is
   capped at 2:1 (matching the tenant logo), tighter than a product photo's
   3:1 — a headshot three times wider than tall isn't a face crop gone
   slightly odd, it's the wrong kind of photo.
3. **A new Cloudinary transformation, not the existing pad-based one.**
   Every other upload here (`uploadLogo`/`uploadProductImage`) letterboxes
   onto a square canvas via `crop: "pad"` — correct for a logo or a product
   flat-lay, wrong for a face, since it would waste most of the frame on
   empty margin. `uploadStaffPhoto` uses `crop: "fill", gravity: "face"`
   instead — a tight, face-centered square regardless of how the original
   was framed. `CloudinaryService.upload()` was generalized to accept a
   transformation array (default unchanged) rather than duplicating the
   whole method.
4. **The public salon endpoint (`SalonService.profile`) now returns each
   stylist's `imageUrl`/`jobTitle`/`gender`/`specialties`**, not just
   `{id, name}` — `specialties` already existed on `Staff` but was never
   exposed publicly before. `apps/web`'s `SalonStaff` type declares these
   as optional, since the same type is also used for a booking's own staff
   reference (a different, older response shape that doesn't carry them).
5. **Real photos get the same treatment as the bundled stock ones, not an
   exception.** `apps/web`'s own visual world deliberately desaturates and
   dyes every photograph into its palette (`imagery.ts`'s own comment: "a
   swapped photo cannot break the world by arriving in the wrong
   colours") — a real stylist photo keeps the identical `grayscale
   contrast-110` treatment rather than appearing as a jarring full-colour
   drop-in. `imageUrl` simply replaces which source feeds the same frame;
   nothing about the frame itself changes when a stylist has no photo yet
   (falls back to `portraitFor()`, exactly as before).
6. **The profile popup reuses `AccountOverlay`'s exact chrome** (dimmed
   backdrop, bottom sheet on mobile / centered card on larger screens, the
   dyed ground, the same close-button treatment) rather than inventing a
   second modal idiom for this app to carry. Gender is shown as a plain
   label ("Female"/"Male") when set, never as a filter or booking
   constraint, matching the locked decision exactly.
7. **Admin UI**: `StaffPhotoField` mirrors `LogoUploadField` component-for-
   component (uploads immediately, no separate save step — a file isn't a
   diffable draft value); it only renders once a stylist has an id, so
   during *create* the drawer shows "You can add a photo once this stylist
   is saved" instead. Job title and gender sit in the same drawer as
   existing fields, following the same optional-field conventions already
   established there.

## 55. "Get Directions" (simple coordinates, no map picker) and a web login entry point (2026-08-30)

1. **Geolocation, per the locked decision: a pasted link, not an interactive
   map.** An embedded/click-to-pin map needs a Google Maps JavaScript API
   key and a billing-enabled Google Cloud project — a new paid dependency
   this project has avoided everywhere else (free-tier-only stack). A plain
   directions link (`google.com/maps/dir/?api=1&destination=lat,lng`) needs
   no key at all. `Branch` gains `latitude`/`longitude` (both nullable, set
   together) — on `Branch`, not `Tenant.settings`, since address already
   lives there and coordinates are the same kind of fact.
2. **Parsing a pasted link is input formatting, not a business rule — so it
   happens client-side, deliberately.** `BranchUpdateDto` only accepts and
   range-checks two plain numbers (a real business rule: a coordinate
   outside ±90/±180 cannot exist); `parseGoogleMapsLink()` (admin-only,
   `apps/admin/src/lib/format.ts`) turns a pasted share link or a typed
   "lat, lng" pair into those two numbers before the request is sent. Same
   precedent this codebase already follows elsewhere (e.g. converting a
   typed rupee amount to cents client-side) — the server never trusts a
   client-derived *value* it can't independently verify, but reformatting
   what someone typed into the shape an already-validated field expects is
   not that.
3. **The settings field doubles as both input and display**, showing "lat,
   lng" once a location is set (there is nothing to reconstruct the
   original pasted URL from, since only the two numbers are stored) — an
   owner can either paste a fresh link over it or hand-edit the numbers
   directly; both are accepted by the same parser.
4. **Hidden entirely wherever coordinates aren't set** — the salon page,
   the booking-confirmation screen, and the admin settings hint all treat
   "no location yet" as the default, ordinary state, matching how a blank
   address/phone already renders nothing rather than an empty label.
5. **The web login entry point needed no new backend, form, or OTP code —
   the flow was already complete** (`CustomerAuthProvider`/`AccountOverlay`,
   DECISIONS.md §46); it only ever appeared passively, after a 40-second
   dwell timer or at booking-confirm. `AccountHeaderButton` jumps straight
   to the existing `"login"` screen (which already has its own "New here? /
   Sign up" escape hatch, confirmed before relying on it) — a deliberate,
   on-demand door into the same flow, placed on the home page's header
   alongside the existing "My booking" link. Logged in, the same button
   shows the customer's first name and logs them out; logged out, "Log in".

## 56. Staff notification bell (2026-08-30)

1. **Exactly three triggers, hooked at the three existing call sites that
   already write the matching `AuditLog` row** — never a second source of
   truth for "what happened." `confirmHold()` fires unconditionally on a
   fresh insert (the only path that ever sets `source: ONLINE`);
   `cancelAppointment()`/`rescheduleAppointment()` fire only when
   `actorUserId === null`, the same signal `AuditLog` itself already uses to
   tell a customer's own action apart from a staff member acting on their
   behalf. A date correction (`isDateCorrection`) is excluded from the
   reschedule hook for the same reason it's excluded from the customer-facing
   message right above it — a front-desk data fix was never something the
   customer asked for.
2. **Two new tables, not one bolted onto `AuditLog`.** `StaffNotification`
   stores pre-rendered plain-language copy (`explainStaffNotification`, the
   same pure-function-copy convention `monitoring/explain-event.ts`
   established) at write time — there's no "the rule changed" reason to
   recompute it later, and a stored sentence survives a later purge/
   anonymization of the underlying customer. `StaffNotificationRead` is a
   companion table for per-user read state (composite PK, no third value —
   absence means unread), the same split `SecurityEventReview` already uses
   to keep `AuditLog` itself immutable. Neither table carries a FK to
   `Appointment`, matching `ErrorLog`'s own documented reasoning: this
   table must never be the reason a tenant's data can't be purged.
3. **Polling, not a socket.** No real-time infrastructure exists anywhere in
   this codebase, and Render's free-tier services sleep after 15 minutes
   idle — a persistent connection fights that hosting model, while a 25s
   poll of a cheap `COUNT`/indexed query costs nothing extra.
4. **The popup's threshold is a live `COUNT`, never a stored counter** —
   `unreadStatus` compares a tenant's live count of `Appointment` rows with
   `source = 'ONLINE'` against a constant (10). A stored counter could drift
   during an unrelated data operation (the salon-offboarding purge, for
   one) and would need its own reconciliation; a live count is always
   consistent with reality and self-heals nothing because there's nothing
   to heal.
5. **UI: a fixed-position bell, not a new top bar.** The admin desk shell
   has no persistent desktop header today (`AppTopbar` is `lg:hidden`), and
   restructuring `(app)/layout.tsx` to add one would shift every existing
   page's layout for a feature meant to be purely additive. Below `lg`,
   `AppTopbar` already occupies the top-right corner with its hamburger, so
   the bell sits just to its left there instead of on top of it, and only
   takes the corner outright at `lg` where no topbar exists. Mounted once in
   `(app)/layout.tsx` (owner/manager/receptionist desk shell) — deliberately
   not mounted in the floor kiosk (`(floor)/floor/layout.tsx`), which is
   phone-first attendance chrome with no room for extra chrome and where "a
   customer booked online" is a front-desk concern, not a floor one.
6. **The settings tab controls only the popup, never the badge/drawer** —
   per the locked decision, the auto-decay itself has no manual override.
   The toggle is a new `TenantSettings.staffNotificationPopupsEnabled`
   boolean (default `true`), following the exact merge-patch pattern every
   other tenant setting already uses, on the existing `/notifications`
   page rather than the generic `/settings` page, since that page already
   owns every other notification-adjacent config. A dedicated listener
   (`setStaffNotificationSettingsListener`, mirroring
   `setTenantProfileListener`'s existing precedent) pushes a saved toggle to
   the bell immediately rather than waiting for its next page load.

## 57. Drag-and-drop stylist reassignment (2026-08-30)

1. **Zero new backend business logic — the drop calls the exact same
   `rescheduleAppointment` engine a typed reschedule already uses.** That
   service already accepts an optional `newStaffId` alongside `newStart`
   and re-runs the full qualification/conflict check regardless of which
   changed; a dropped card just sends the appointment's own unchanged
   `startTime` back with a new `staffId`. A rejected drop (unqualified
   stylist, a conflict the exclusion constraint catches, a version race)
   surfaces the exact same error a typed reschedule would, reused via the
   existing `errorCopy()` map (`STAFF_NOT_QUALIFIED`, `STAFF_UNAVAILABLE`,
   `SLOT_UNAVAILABLE`, …) — nothing new to get wrong twice.
2. **`@dnd-kit/core` + `@dnd-kit/utilities`, the new dependency the plan
   called for** (CLAUDE.md: justify new libraries). Hand-rolled native HTML5
   drag-and-drop has poor touch/tablet support, and this app's PRD targets
   desktop *and* tablet for the admin side; `@dnd-kit` is accessible and
   touch-capable out of the box. `PointerSensor` with a 6px activation
   distance is the only sensor configured — small enough that a tap still
   opens the detail drawer normally (dnd-kit only initiates a drag past that
   threshold), large enough that an accidental drag doesn't fire on every
   click.
3. **Only `CONFIRMED` cards are draggable** — `useDraggable`'s own `disabled`
   flag gates it client-side for immediate visual feedback (no grab cursor,
   no drag), and the server's existing terminal-state guard
   (`assertMutable`) is the real, authoritative enforcement either way.
4. **The "who's free" hint reads already-loaded appointments, not a new
   endpoint.** The original plan proposed exposing
   `AvailabilityService.loadBusyIntervals` via a new route so a column could
   show working-hours/leave-aware availability before a drop. Built instead:
   while dragging, a column shades amber the moment the dragged card
   overlaps another appointment already on that stylist's column for the
   day being viewed — computed entirely from data the board already fetched,
   no request in flight during the drag. This does not know about
   qualification or whether a stylist is rostered on at all; those stay
   exactly where CLAUDE.md says they belong, decided once, server-side, on
   drop — the hint only saves a receptionist an obviously-doomed attempt at
   an already-double-booked time, it never decides anything. Revisit with
   the dedicated endpoint later if a fuller live-availability shading proves
   worth the extra request per drag.
5. **The dragged card renders via `DragOverlay`, not an in-place transform.**
   The board's cards are absolutely positioned inside a per-column
   `overflow`-bearing layout; a floating overlay clone follows the pointer
   unclipped by any column's box, while the source dims to 30% opacity in
   place. Both `today` and `schedule` pass `onReassign`/`canReassign` into
   the same `DayCalendar`, so the one board component gained the capability
   once for both the live and planning views.

## 58. Account lockout v2 — manual reset by owner/manager/super-admin (2026-08-30)

A consultation, not a literal build: the original ask specified 3 attempts
and "contact manager or admin to reset." Code research surfaced three gaps
the literal wording didn't account for — an OWNER has no one in-tenant to
ask, MANAGER had zero Team-page access at all, and no password-reset
capability existed anywhere in the app — so the design below was worked out
with the user before writing any code, then explicitly hardened further per
their instruction to bias every open tradeoff toward stronger security.

**Locked decisions:**
1. **Reset access**: OWNER (unchanged) + a new, narrow
   `RESET_TEAM_MEMBER_PASSWORD` permission for MANAGER — full `MANAGE_TEAM`
   (role changes, enable/disable) stays OWNER-only. SUPER_ADMIN gets the
   cross-tenant equivalent and is the *only* path that can reset an OWNER
   (the existing `CANNOT_MODIFY_OWNER` guard is untouched for the
   tenant-scoped route).
2. **"Reset" = a full password reset**, not a bare unlock — generates a new
   temporary password, shown once, and clears the lock.
3. **Threshold: 5**, not the originally-stated 3 — matches the mechanism
   already shipped this session and the HIGH-severity trigger already tuned
   into `classify-severity.ts`, avoiding two different magic numbers for
   the same concept. This *replaces* that mechanism entirely rather than
   stacking a second, stricter one on top of it.
4. **Scope: admin/staff logins only** (OWNER/MANAGER/RECEPTIONIST/STAFF).
   Customer web accounts also have `LOGIN_FAILED`-tracked passwords, but are
   explicitly out of scope — they already have OTP-based self-recovery, and
   "ask your manager" doesn't fit a customer.
5. **SUPER_ADMIN is not exempt** — it locks after 5 the same as anyone
   else. Exempting the single most powerful account in the system would be
   a real regression (a compromised super-admin credential affects every
   tenant); its recovery path is the existing CLI break-glass script
   (`user:set-password`), since nothing in the app outranks it to click an
   "unlock" button.
6. **Bonus, folded in mid-consultation**: any password set by someone other
   than the account holder (creation, or this new reset) now forces a
   mandatory password change on next login, before any real session is
   issued — raised by the user as a related gap once they noticed the app
   had never had this. Mirrors AWS Cognito's/Okta's
   `NEW_PASSWORD_REQUIRED` challenge shape: the server withholds real
   access/refresh tokens entirely, returning a short-lived, single-purpose
   change-token instead.

**Maximum-security hardening**, added on top of the above per explicit
instruction to resolve every open tradeoff toward stronger security:
1. **Enumeration-resistance preserved for unknown emails.** A persisted
   counter on the `User` row (needed for a manual-reset design) has nothing
   to persist for a nonexistent email. Rather than let that silently reopen
   the exact gap the old mechanism closed, an unknown email still falls
   back to the *original* audit-log-derived sliding window
   (`AuditService.lockoutExpiry`, unchanged) and returns the identically-
   worded `ACCOUNT_LOCKED` response — a fake identity has nothing real to
   protect, so auto-expiry there is correct, not a compromise.
2. **Sessions revoke the moment an account locks**, not only at reset —
   five wrong passwords is itself a signal worth acting on immediately,
   closing the window where a stale session on a front-desk machine stays
   valid throughout an active attack on the same account.
3. **The first-login change-token is fingerprinted against the exact
   password it was issued for** (a hash of `passwordHash` at issuance,
   rechecked at redemption) and rejected outright by the normal
   `TokenService.verify()` via a `purpose` claim — a password-change token
   can never work as a real access token, and can't be replayed after the
   password already changed through some other path.
4. **The affected person is told when their own password is reset**, not
   just the person who reset it — a best-effort email (reusing
   `resolveEmailTransport()`, the same low-level sender
   `PlatformAlertService` already uses, generalized beyond its
   platform-admin-only original use) to the account holder, and separately
   to the OWNER whenever a MANAGER performed the reset. A careless or
   compromised manager login can never silently take over a colleague's
   account unnoticed.
5. **No weaker password-generation path**: `PasswordService.generate()` is
   now the one generator behind both the CLI break-glass script and the new
   in-app reset endpoints — extracted from the CLI script's own
   `generatePassword()`, not reimplemented.
6. **A plain status change can no longer clear a lockout.** Discovered
   while wiring the Team page: the pre-existing ACTIVE/DISABLED toggle
   would otherwise let an OWNER "restore access" on a LOCKED row without
   forcing a password change, without revoking sessions, and without
   resetting the failure counter — quietly bypassing every hardening above.
   `TeamService.update()` now explicitly refuses an ACTIVE transition while
   `status === LOCKED`; only the reset endpoint may clear it. Disabling a
   locked account outright is still allowed.

**Implementation shape:** `UserStatus` gains `LOCKED`; `User` gains
`failedLoginAttempts` (a real persisted counter, replacing the old
audit-log-derived window for known accounts — cheaper, and there's nothing
left to "expire" once the design is manual-reset) and `mustChangePassword`.
`ACCOUNT_LOCKED` and `TEAM_MEMBER_PASSWORD_RESET` join
`SECURITY_EVENT_ACTIONS`, the former MEDIUM severity (a real consequence,
worth a look), the latter permanently LOW and non-alerting (routine,
expected remediation) — both now appear in the existing Security events
feed rather than a new screen. The platform's Tenant usage table gained a
live `lockedAccountCount` column. The super-admin's OWNER-reset action lives
directly on an `ACCOUNT_LOCKED` event card (a new generic `extraAction` slot
on `EventCard`) rather than a new "browse this salon's team" screen, since
the platform page is deliberately scoped to lifecycle/plan/visibility only
and team management is "the salon's own business" — reusing the row's
already-present `tenantId`/`entityId` instead. `ACCOUNT_LOCKED` resolves and
records a real `tenantId` (unlike the hot-path-sensitive `LOGIN_FAILED`)
since it fires once per lockout, not once per attempt, and the platform
feature needs to know which salon to act on.

Every typed password field this work touched now uses the same show/hide
toggle the login page already had (extracted into
`PasswordVisibilityToggle`), per explicit instruction to keep that
convention everywhere a password is typed — including `TeamDrawer`'s
temporary-password field at account creation, which previously showed the
password permanently unmasked with no toggle at all, by original design
(the code's own comment: masking a value the owner must read aloud or
transcribe causes typos, not security, since nobody is shoulder-surfing
their own screen). Rather than either regress that reasoning (a toggle
defaulting to hidden, like every other field) or skip the field entirely,
it gets the same toggle **defaulting to visible** — consistent chrome, a
way to hide it if a coworker walks by or the screen is shared, without
reintroducing the transcription-typo risk as the default state.

## 59. Customers module: Add/Edit, tags, and five customer segments

The Customers module previously had no way to add a customer proactively
(only auto-created on first booking), no general edit (`PATCH` touched only
`marketingOptOut`), no tagging, and no segmentation. This adds an
"Add customer" drawer mirroring `BookingDrawer`'s conventions, a richer
profile (title, DOB, profile photo, client source, address, province,
tags), a live phone-duplicate check while typing, a per-row Edit action, and
five segment quick-filters (`New`, `Recent`, `First visit`,
`Upcoming birthdays`, `Web customers`) with a configurable settings section.

**Decisions, confirmed with the user before building:**
1. Phone number is editable after creation via Edit, re-running the same
   duplicate check the existing `POST /customers` already enforces —
   excluding the customer's own row.
2. Segment day-windows (`New`/`Recent`/`Upcoming birthdays`) are fully
   tenant-configurable, not fixed — `FIRST_VISIT` and `WEB` are structural
   conditions with no window to configure.
3. Day-to-day add/edit/apply-a-tag stays on the existing `MANAGE_CUSTOMERS`
   (OWNER/MANAGER/RECEPTIONIST, unchanged). Creating/renaming/deleting tag
   *definitions* needed a new, narrower permission
   (`MANAGE_CUSTOMER_TAGS`, OWNER/MANAGER only — same split shape as
   `RESET_TEAM_MEMBER_PASSWORD` carved out of `MANAGE_TEAM`). Segment
   day-window settings did **not** need a new permission: they're just new
   fields on the tenant settings JSON, already gated by the existing
   `MANAGE_TENANT_SETTINGS` (also OWNER/MANAGER-only) — reusing the
   mechanism already built for exactly this shape of thing rather than
   inventing a permission that would duplicate it.
4. Audit logging is narrow on purpose: only a customer's phone number
   changing gets an audit entry (`CUSTOMER_PHONE_CHANGED`) — the one
   identity/security-relevant edit. Routine edits (notes, tags, name,
   address) are not audited, to keep the feed from flooding with everyday
   CRM data entry. Unlike `ACCOUNT_LOCKED`/`TEAM_MEMBER_PASSWORD_RESET`,
   this action is **not** added to `SECURITY_EVENT_ACTIONS` — it has no
   security narrative, so it stays a plain audit-log row and never appears
   in the Security events monitoring feed.

**Design choices made without asking, stated for visibility:**
- DOB is a plain native `<input type="date">` — every date field in this
  app already does this; no custom calendar component was built.
- Province is a fixed 9-value enum (Sri Lanka's real provinces), no
  tenant-custom additions — a geographic fact, not a business concept.
- Title and Client source are resolved plain text on `Customer` (like
  `service.category` already is); their tenant-addable custom options live
  as string arrays inside the existing `TenantSettings` JSON blob — no new
  tables, no dedicated manage screen for these two (only Tags get that,
  since tags need real relational identity: rename/delete, many-to-many).
- Profile image upload is sequenced behind one "Save" click (create/update
  the customer, then immediately upload the photo against its id) rather
  than requiring the stricter save-then-reopen flow the staff-photo
  precedent uses — a small UX improvement since the user explicitly wants
  the photo capturable at creation time. A photo-upload failure surfaces as
  its own toast without rolling back the customer record.
- Add and Edit share one component (`CustomerFormDrawer`, mode-switched):
  the field set, validation, and duplicate-check behavior are identical:
  only the endpoint called and the pre-filled values differ.
- `CustomerAccount`/`CustomerAccountSalonLink` (the separate cross-tenant
  customer-login identity) is untouched — none of these fields belong
  there; they're salon-specific CRM facts on the tenant-scoped `Customer`
  row only.

**A real bug found and fixed during planning, not left as a landmine:**
`TenantService.getSettings()` returned `{ currency, timezone, ...tenant.settings }`
— it never merged in `DEFAULT_TENANT_SETTINGS` for keys missing from a
tenant's stored JSONB. Every tenant that existed before this feature has a
`settings` blob frozen at whatever `DEFAULT_TENANT_SETTINGS` looked like
when its row was created; simply adding `customerSegmentSettings`/
`customTitleOptions`/`customClientSourceOptions` to that constant would have
left every existing tenant reading `undefined` for all three. Fixed by
having `getSettings()` merge `{ ...DEFAULT_TENANT_SETTINGS, ...tenant.settings }`,
and by giving `customerSegmentSettings` the same deep-merge treatment
`updateSettings()` already gives `cancellationPolicy` on patch, rather than
a blind top-level spread.

**Security hardening on image upload**, raised explicitly by the user
("stop hackers uploading malicious scripts and other database breach
codes"): the existing upload pipeline (`detectImage`'s real magic-byte
parsing — SVG, the one format that can carry a `<script>` tag, never
parses successfully; hard size/dimension/aspect-ratio bounds; the buffer is
streamed straight to Cloudinary and re-encoded, never written to or
executed from this server's own disk; the original filename is never
captured, so there's no path-traversal surface; only the resulting HTTPS
URL is ever persisted, always through parameterized TypeORM calls) is
reused verbatim for customer photos — no separate, laxer path. Two
additions beyond what already existed: `flags: "strip_profile"` on the
Cloudinary transformation, stripping EXIF metadata (a phone-camera photo
routinely carries GPS coordinates) on ingest; and a new `photo-upload` rate
limit rule (`RateLimitGuard`, 20/min) covering both the new customer-photo
route and the pre-existing staff-photo route, which had no dedicated rule
before — only the generous global backstop, unlike every other cost-bearing
or abuse-prone endpoint in that file.

**Segment queries** follow `ReportsService.lapsedCustomers`'s existing
hand-written-query style rather than a generic "segments engine" this
codebase doesn't otherwise have. The trickiest one, `UPCOMING_BIRTHDAY`,
deliberately avoids constructing a hypothetical "this year's birthday" via
`make_date` — that throws a real Postgres error for anyone born Feb 29
whenever the current year isn't a leap year. Instead it walks real calendar
days forward from Colombo "today" via `generate_series` + `make_interval`,
comparing `MMDD` strings — this naturally wraps Dec 31 → Jan 1 and never
constructs an invalid date; the accepted trade-off is that a Feb 29
birthday doesn't surface in the segment during a run of non-leap years, a
one-in-1,461-days edge case.

## 60. Quick Sale: selling an item that isn't in the catalog yet (2026-09-01)

Quick Sale could previously only sell a real, already-created `ProductVariant`
or `ProductBundle`. The user wanted a cashier to ring up something found on
the shelf but never entered into the catalog (e.g. "Body Butter, 30g"),
without waiting on someone with catalog-write access.

This runs directly into an existing, deliberate boundary: creating a
`Product`/`ProductVariant` requires `MANAGE_INVENTORY` (OWNER/MANAGER only);
checkout only requires `RECORD_PAYMENT` (RECEPTIONIST has this, not
MANAGE_INVENTORY). Three approaches were considered and put to the user with
their trade-offs:

1. **The literal ask** — create a real, immediately-searchable
   `Product`/`ProductVariant` on the spot from Quick Sale itself. Rejected:
   it means a RECEPTIONIST session functionally creates catalog rows (a real
   permission-boundary crossing, not just a UI convenience), fabricates a
   cost basis (`weightedAvgCostCents = 0`) that permanently skews margin
   reporting for that sale once frozen, and risks a fragmented catalog if
   the same product name is retyped slightly differently next time.
2. **Pure industry-standard** — a one-off "custom/open item" (Square,
   Shopify POS, Vend, Toast all use this exact convention): name + price
   typed in, sold immediately, zero inventory impact, never saved to the
   catalog. Simplest and safest, but doesn't get toward "this becomes a
   real, findable product later," which the user explicitly wanted.
3. **Hybrid (chosen)** — a genuinely off-catalog line at sale time (no
   `Product`/`ProductVariant`, no stock impact, no permission change:
   checkout stays `RECORD_PAYMENT`-only), with a deliberate, later,
   manager-only action to turn a sold line into a real catalog product.

**Confirmed with the user:**
- Margin/COGS reporting excludes custom lines entirely (no fabricated 0
  cost standing in for a real number) — their revenue still counts in plain
  sales/takings totals, which are built from `RetailSale.totalCents`, not
  this per-product breakdown.
- The "turn into a real product" action lives as a persistent "Needs
  review" queue in the existing Products screen (so an owner can batch
  through it anytime, present at the sale or not), plus an inline shortcut
  on the post-sale confirmation when the checkout-taker already holds
  `MANAGE_INVENTORY`.
- No price ceiling on custom items for now — matches how the rest of Quick
  Sale already trusts staff with real prices; revisit only if actually
  abused.

**Implementation shape:** `RetailSaleLine.variantId`/`bundleId` can now both
be null (a third line kind, not a new table) — `nameSnapshot`/
`attributeSnapshot`/`unitPriceCentsSnapshot` are still frozen exactly like
every other line, `unitCostCentsSnapshot` is `0` (documented as "genuinely
unknown," not a real cost). `convertedToVariantId` (nullable FK to
`product_variant`) is set once a manager completes the conversion — a line
"needs review" exactly when `variantId`, `bundleId` and
`convertedToVariantId` are all null, so no separate status column exists.
`POST /retail-sales/custom-lines/:lineId/convert-to-product` reuses
`ProductService.create`/`createVariant` directly (never duplicates
catalog-insert logic) and deliberately opens with `quantityOnHand: 0` — it
adds a catalog entry, not stock; Receive Stock stays the separate, existing
step for that. `RetailReturnService`'s old `saleLine.variantId === null`
check had silently doubled as "is this a bundle line" — fixed to check
`bundleId !== null` specifically, since a custom line is also `variantId
=== null` but needs its own path (a straight monetary refund, no
restock/quarantine branch, since there was never any stock to move).

## 61. apps/marketing SEO pass — metadata, robots/sitemap, structured data, CTA tracking (2026-09-02)

First real SEO pass on the marketing site, following a user-supplied
implementation brief. Audited first (Next 16.3 App Router, `output: "export"`
static site on Cloudflare Pages, zero prior metadata beyond a title/
description, no robots.txt/sitemap.xml/structured data/analytics anywhere)
before changing anything, per the brief's own Step 1 and this project's
"inspect before coding" rule.

**Demo duration — confirmed and corrected, twice.** Every visible CTA said
"30-minute demo"; the brief assumed 15 minutes. First check: user confirmed
30 minutes was correct, leave the copy as-is. Mid-implementation, reading
`.env.local` for its own purposes surfaced that the live
`NEXT_PUBLIC_CALENDLY_LINK` value was `faakeermohamed/15min` — the real
booking link disagreed with the just-confirmed answer. Flagged it plainly
rather than silently trusting either source; re-asked with the new evidence.
Resolved: the Calendly event genuinely is 30 minutes, the URL slug was just
stale from an earlier rename. Site copy stays untouched; `.env.local` fixed
to `faakeermohamed/30min` to match reality. The user still needs to update
the same env var in whatever dashboard controls the production build
(Cloudflare Pages), since fixing the local file doesn't touch production.

**H1 changed for SEO clarity, marketing copy demoted, not dropped.** Hero H1
was "One system. Every booking. No double-bookings — ever." (strong copy,
zero SEO signal for what the product is or where it operates). Changed H1 to
"Salon Management Software Built for Sri Lankan Salons"; the old H1 text
moves to a bold tagline directly under it, so nothing was deleted — the
hierarchy just now leads with search-clarity. Screenshotting the real mobile
viewport (not just reasoning about the CSS) caught a real regression this
introduced: the extra headline lines pushed the body paragraph down into the
fixed WhatsApp button on first paint. Fixed with small mobile-only spacing
trims (`pt-16`→`pt-10`, animation `my-6`→`my-4`, CTA row `mt-8`→`mt-6`);
desktop untouched.

**OG image deferred, not fabricated.** No asset on the site is a correct
1200×630 social card (the only candidate, a logo lockup PNG, is 1200×352
with a transparent background — wrong shape, would render broken on link
previews). Shipped every other Open Graph field; user chose to design a real
card as a separate follow-up rather than skip it permanently or ship a
wrong-shaped one.

**New dependency: `@next/third-parties@16.3.0`** (pinned to match the
installed `next` version exactly). Considered hand-rolling a `next/script`
gtag.js loader instead — asked the user given this project's "no
unnecessary dependencies" rule; chose the official Vercel-maintained
package since it's the Next.js team's own documented recommended path for
GA4 in App Router (optimized script loading, a safe `sendGAEvent` helper
that already no-ops instead of throwing if analytics was never
initialized). No GA4 property/Measurement ID exists yet —
`NEXT_PUBLIC_GA_MEASUREMENT_ID` unset means `<GoogleAnalytics>` never
renders at all, matching the honest-fallback convention `demo-booking.tsx`
and `contact-section.tsx` already used for Calendly/Web3Forms.

**CTA tracking uses one delegated click listener, not five new client
components.** hero/site-nav/founding-banner/site-footer/floating-whatsapp
were all plain server components; converting each to add an `onClick` would
have meant five new client-component boundaries for a single-page site that
had deliberately kept only five total. Instead each CTA carries plain
`data-analytics`/`data-cta-location` attributes, and one new client
component (`analytics-listener.tsx`, only mounted when GA is configured)
handles every click via `element.closest("[data-analytics]")`.
`demo_booked` is the one event requiring real client logic on its own
component: Calendly's iframe embed posts a genuine
`calendly.event_scheduled` message to the parent window on a real booking,
so `demo-booking.tsx` became a client component specifically to listen for
it — a real confirmation signal, not the guess the brief explicitly warned
against faking.

**Structured data:** Organization + WebSite + SoftwareApplication only, no
AggregateRating/Review/pricing — none of those are real. Verified via a real
build's output, not just reading the source: JSON-LD renders once, robots.txt
and sitemap.xml both work under static export (needed `export const dynamic
= "force-static"` on both route files — not documented explicitly in this
Next version's static-exports guide, found by reading the actual build
error), title/canonical/meta description/H1/`<main>` all appear exactly
once, and zero accidental `noindex`.

## 62. Payroll module — Phase 0 discovery + Phase 1 foundation (2026-09-03)

User supplied a full Sri Lankan payroll implementation spec and asked for a
new Payroll module in `apps/admin`, with no code until findings, questions,
and a plan were approved, mockups shown, and a final build approved. Root
`CLAUDE.md` §1.11 and `docs/PRD.md` §5 both explicitly list "payroll" as out
of MVP scope ("do not build unless explicitly approved") — this session is
that explicit approval, recorded here rather than silently overridden.

**Repository audit surfaced a fact that reshaped the whole plan: a real
commission/payout engine already exists.** The marketing site's copy about
"set a commission plan, run a payout" isn't aspirational — it's the
Incentives module (§33), and its own code comment already says plainly
*"commission plans and payouts are payroll."* Building a second, competing
compensation engine would have violated this project's own single-source-
of-truth rule. Decided: Incentives folds into a new unified Payroll domain
(moved, not deleted or rewritten — the commission math itself is untouched)
rather than Payroll merely wrapping it read-only. That fold-in is Phase 3,
not this phase.

**Scope decisions (asked, not assumed):**
1. v1 targets the full statutory spec, not a narrower wage-tracking cut —
   but the EPF/ETF/APIT engine ships **flagged off by default** until a
   qualified Sri Lankan payroll/accounting professional signs off; the user
   doesn't have that review lined up yet. The spec's own Definition of Done
   requires that sign-off before production use of statutory figures.
2. Both MONTHLY and DAILY pay frequencies are required from Phase 1, not
   DAILY bolted on later — daily-paid staff are first-class per the spec's
   own insistence.
3. A new effective-dated `Employment` entity, linked to `Staff` rather than
   adding columns to it — `Staff` is identity (name, specialty, calendar
   color) read throughout booking/attendance/incentives; none of that code
   needs to know how someone is paid, and the spec's own "never overwrite a
   salary change" rule needs real version history a mutable `Staff` row
   can't give it.

**Statutory research, sourced, before any daily-pay architecture was
chosen** (per the spec's own §31 instruction to use official sources, not
memory): EPF (8% employee / 12% employer) and ETF (3% employer-only) apply
to every employee from day one regardless of pay frequency — confirmed via
the [Department of Labour's EPF division](https://labourdept.gov.lk/epf-division-new/)
and [EPF's own membership page](https://epf.lk/?p=203) — and both are flat
percentages, safe to compute per individual payout. APIT is different: the
[IRD's APIT Tax Tables page](https://www.ird.gov.lk/en/publications/sitepages/apit_tax_tables.aspx?menuid=1502)
publishes exactly one table for regular primary-employment income, and it
is explicitly a **monthly** table — there is no officially published daily,
weekly, or fortnightly APIT table. Decided: EPF/ETF are computed and
reserved on every payout (daily or monthly); APIT is computed only once, at
month-end statutory close, regardless of how often someone was actually
paid that month. This is a real technical reason, not a UX preference — but
still not a substitute for professional sign-off before it handles real
money (Phase 4, still flagged off per decision 1 above).

**Phase 1 (this entry's actual code change) — foundation only, backend, no
UI.** Per the project's own UI workflow (impeccable mockup-then-approval),
no screen work happens without a shown-and-approved mockup first, and the
approved plan itself scoped Phase 1's UI down to "no more than strictly
needed" — so this phase is deliberately backend-only:

- `Employment` entity (`apps/api/src/entities/employment.entity.ts`,
  migration `1750002100000-PayrollFoundation.ts`): effective-dated pay
  frequency + base rate, versioned by closing the currently open row
  (`effectiveTo IS NULL`, enforced unique per staff member) and inserting a
  new one — the same supersede-not-edit shape `incentive_payout` already
  uses. `EmploymentService.upsert` decides create-vs-supersede from whether
  an open row already exists, and rejects an `effectiveFrom` that doesn't
  come after the current version's own start (a genuine backdated
  correction is a later phase's problem, not a silent rewrite of history).
- `PayCalendar` entity: one optional row per tenant configuring the monthly
  pay-period cycle's start day; a tenant with none configured gets the
  ordinary calendar-month default in code, the same "resolve with a tier
  default" shape `resolveModules`/`resolveLimits` already use for
  entitlements. `PayPeriod` is deliberately **not** a persisted table —
  given a calendar config and a date, the period is pure derived data
  (`payroll.domain.ts#resolvePayPeriod`), the same "computed at read time,
  never materialized" reasoning `AttendanceDayStatus` already follows.
- New `MANAGE_PAYROLL` permission (OWNER/MANAGER only) and `payroll`
  `ModuleKey` (tier-gated PRO-only, same as `incentives`), mirroring the
  existing Incentives precedent exactly. Every write goes through
  `AuditService.record` (`PAYROLL_EMPLOYMENT_CREATED`/`_SUPERSEDED`,
  `PAYROLL_CALENDAR_UPDATED`).
- `docs/API.md`, `docs/DATABASE.md` updated with the new routes/tables.
  `CLAUDE.md`/`docs/PRD.md`'s "out of scope" lines still need their own
  one-line update to reflect this decision — deliberately deferred to when
  Phase 1 is demoed and confirmed stable, per this project's "commit at the
  end of a completed phase" convention, not bundled into this entry.

Phases 2–7 (attendance-linked base pay, the Incentives fold-in, the
statutory engine, payslips/payments, reports/accounting, hardening) each
get their own short plan and, where UI is involved, their own approved
mockup before real components are written — see the approved plan for the
full phase breakdown and the remaining open questions (bank formats,
accounting integration, payslip languages, historical-data migration,
record retention) that aren't blocking Phase 1 but need answers before
their own phase starts.

## 63. Payroll module — Phase 2, attendance-linked base pay (2026-09-03)

Phase 2 of the plan from §62: turning `Employment` (Phase 1) and real
Attendance/Leave records into a base-pay figure. Backend-only again, same
reasoning as Phase 1 — this is a calculation preview, nothing persists yet,
and no UI ships without its own mockup-approval pass.

**Three business-rule gaps surfaced from inspecting the actual data before
writing any calculation — asked rather than assumed, per this project's
standing rule:**

1. **How an unpaid absence reduces a MONTHLY salary.** Decided: divide the
   monthly rate by a **fixed 30**, deducted once per confirmed unpaid day —
   a real, common Sri Lankan payroll convention, and independent of the
   period's actual day count (28/29/30/31 all divide by 30 the same way).
   "Confirmed" maps directly onto the existing
   `AttendanceDayStatus.ABSENT` — a day that's rostered, over, and has
   nothing recorded is already a settled fact in this codebase, not a
   pending review state, so no new "confirmation" workflow was needed.
2. **`StaffLeave` had no paid/unpaid distinction.** Decided: add a real
   `paid` column now (migration `1750002200000-StaffLeavePaidFlag.ts`),
   defaulting `true` and backfilling every existing row `true` so nothing
   already approved is retroactively docked. `CreateStaffLeaveDto.paid` is
   optional for the same backward-compatibility reason — `apps/admin`
   already has a live leave-creation screen (`rota-grid.tsx`) that doesn't
   send this field, and making it required would have broken that screen
   outright. There is deliberately no admin UI to set it `false` yet; that's
   its own future mockup-approved change, not bundled into this backend
   addition.
3. **What makes a DAILY-wage day payable.** The user's answer distinguished
   worked days, statutory/company-paid leave, eligible paid weekly
   holidays, and Poya/public holidays — each with different legal footing.
   Implemented the two resolvable cases (worked, and leave via the new
   `paid` flag) and deliberately left holiday/closure-day payability
   **unresolved** rather than guessing either way: `Closure` (this
   codebase's existing "salon shut, e.g. a Poya day" entity) has no
   statutory-pay semantics today, and Sri Lankan weekly/public-holiday pay
   entitlement for daily-rated workers is real labour law this session
   hasn't verified against official sources — the same "flag, don't invent"
   treatment §62 already gave EPF/ETF/APIT. A DAILY employee's closure day
   earns 0 in the total but is surfaced separately
   (`unresolvedClosureDays`) so nobody mistakes silence for a considered
   answer.

**Implementation** (`apps/api/src/payroll/base-pay.domain.ts` +
`base-pay.service.ts` + `base-pay.controller.ts`, route
`GET /payroll/base-pay/preview?staffId&from&to`, `MANAGE_PAYROLL`): computed
**day-by-day**, not by splitting the period into Employment segments — a
pay-rate change or a MONTHLY→DAILY switch mid-period falls out for free
this way, since each date just looks up whatever Employment version and
Attendance status apply to it, with no separate segment-boundary logic to
keep in sync with `Employment`'s own versioning. Reuses
`AttendanceService.report` unmodified as the attendance source of truth
(the same board/report every other screen already reads) rather than
re-deriving day statuses — this project's "single source of truth" rule
applied to a read, not just a write path.

Phase 3 (folding Incentives under this Payroll umbrella) is next.

## 64. Payroll module — Phase 3, combining base pay with commission (2026-09-03)

The approved plan (§62) called for "folding" Incentives into Payroll via a
physical file move — relocating `apps/api/src/incentive/` into `payroll/`.
On reflection during implementation, that was flagged back to the product
owner rather than executed as originally written: Incentives is live,
shipped functionality that `apps/admin` already calls today, and a full
move (every import path, every route re-verified byte-identical) carries
real regression risk to a working feature for a purely organizational
win — nothing about the routes, permissions, or commission math would
actually change.

**Decided:** Incentives' files, routes, and permissions stay exactly where
they are, untouched — a salon that wants commission tracking without
Payroll keeps using it standalone, exactly as before. A salon that enables
Payroll gets the commission figure **included automatically** as part of
the payroll total; a salon with Payroll but not Incentives simply gets no
commission component, rather than an error or a stale one. "Folding in"
now means: a new read in the `payroll` module that combines Phase 2's base
pay with the Incentives module's own data, not a code relocation.

**Implementation** (`payroll-preview.service.ts`/`.controller.ts`,
`GET /payroll/preview?staffId&from&to`): for the commission component,
prefers an already-**finalized** `IncentivePayout` for the exact requested
period (a settled fact — `IncentivePayoutStatus <> VOID`) and falls back to
`IncentiveService.earningsFor`'s live estimate when no payout has been run
yet, labelling the response `FINALIZED_PAYOUT` vs `LIVE_ESTIMATE`
explicitly so nobody reads an estimate as if it were settled. Whether the
commission component appears at all is decided from the calling tenant's
own resolved entitlements (`ctx.modules.incentives`), not from whether
commission data happens to exist in the database — the two module keys
(`payroll`, `incentives`) are independent, and the response respects
whichever combination the tenant actually has.

Reads `IncentiveService`/`incentive_payout` as an existing source of truth
(the same way `IncentiveModule` itself already reads `Payment`/`Appointment`
rows it doesn't own) rather than duplicating the commission calculation —
this project's single-source-of-truth rule applied without requiring the
two modules to physically merge.

Phase 4 (the statutory engine, shipped flagged off per §62) is next.

## 65. Payroll module — Phase 4, statutory engine infrastructure (flagged off) (2026-09-03)

Built the EPF/ETF/APIT calculation infrastructure per §62's decision that it
ships inert until a qualified Sri Lankan payroll/accounting professional
reviews it. Two independent gates, deliberately, neither a stand-in for the
other:

1. **`Tenant.statutoryPayrollEnabled`** (default `false`, every tenant,
   including PRO) — a compliance sign-off, not a plan-tier feature.
   SUPER_ADMIN-only to flip (`PATCH
   /super-admin/tenants/:id/statutory-payroll`), same shape as the existing
   `customerBookingEnabled` toggle: a salon owner can enable Payroll itself,
   but cannot self-certify their own statutory configuration.
2. **`StatutoryRuleSet.verified`** (default `false`) — whether the rate
   table itself has been professionally confirmed. Publishing a rule set,
   verified or not, never turns on real calculations for any tenant on its
   own; that still needs gate 1.

**Rates are global, not per-tenant** (`statutory_rule_set` carries no
`tenantId`) — EPF/ETF/APIT are facts about Sri Lankan law, not a salon's
own policy, and are configured by `PLATFORM_ADMIN` only (spec §21: "restricted
to platform/authorized compliance role"). Effective-dated the same
close-old/open-new shape as `employment` (§62), so a payroll run finalized
under one rate table stays reproducible after IRD publishes a new one
(CLAUDE.md §7). No rule set is seeded by this migration — the table starts
empty. Seeding one with real-looking numbers via a migration would have
asserted them more confidently than a manually reviewed draft should;
instead, `POST /super-admin/statutory-rule-sets` exists for a platform admin
(or a future session, on request) to publish one deliberately, with its
`sourceNote` recording exactly which official document and retrieval date
it came from, per spec §31's own requirement.

**Two calculation functions** (`statutory.domain.ts`, pure and unit-tested):
`computeEpfEtf` — flat percentages of gross, safe on any period since
neither EPF nor ETF is progressive; `computeApitForMonth` — a progressive
band table applied only to one full calendar tax month, per §62's finding
that IRD's own APIT Table 01 has no daily/weekly/fortnightly equivalent.
`StatutoryPreviewService` (`GET /payroll/statutory/preview`) refuses any
period that isn't exactly the 1st through the last day of one calendar
month (`400 INVALID_STATUTORY_PERIOD`) — this is a fixed Gregorian tax
month regardless of a tenant's own internal `PayCalendar` cycle, which can
use a different anchor day for its own payroll periods.

**Gratuity deliberately has no code yet**, not even a stub. The spec's own
§11.4 requires a real separation/termination workflow, a confirmed
continuous-service start date, and applicability rules this session hasn't
built or verified — a placeholder function would either do nothing useful
or imply more support than exists. Deferred to whichever later phase adds
final-settlement/termination handling, with a real employment-start-date
question resolved at that time rather than guessed now.

Phase 5 (approval workflow, payslips, payments) is next — the first phase
with real UI, and the first that needs a mockup shown and approved before
any screen is built, per this project's standing UI workflow.

## 66. Payroll module — Phase 5 backend, the payroll run and maker-checker workflow (2026-09-03)

The first persisted, real payroll document — everything before this phase
was a live preview that saved nothing. A `PayrollRun` covers **every staff
member with an employment profile for one period at once** (`SUBMITTED` →
`APPROVED` → `PAID`, or `VOID` from any of those), unlike `IncentivePayout`,
which is one row per staff member per period — this matches spec §13's own
description of a run as a batch unit with period totals and an employee
list, not thirteen separate single-person documents to review one at a time.

**A genuine maker-checker separation isn't structurally enforced**, and
that's a deliberate, considered choice rather than an oversight: `submit`
and `approve` are both gated by the same `MANAGE_PAYROLL` permission,
because splitting it into separate "prepare" and "approve" permissions
would require a new role or sub-permission this project doesn't have yet.
The tempting alternative — blocking an actor from approving their own
submission — was considered and rejected: many of this platform's actual
tenants are single-owner salons where the OWNER is the *only* person who
will ever hold `MANAGE_PAYROLL`, and a hard block would make payroll
literally unusable for exactly the salons this product is built for.
Instead, `submittedBy` and `approvedBy` are tracked as genuinely distinct
columns/actors regardless, so a salon with more than one manager can see
whether the same person did both — informational, not a blocker.

**Idempotent on the money**, the same shape as `IncentivePayoutService.run`:
resubmitting a period with an unchanged total (gross, net, and staff count)
returns the existing live run rather than a near-duplicate; a moved total
voids the old run and submits a fresh one. Refuses outright to supersede a
run that's already been marked `PAID` (`409 PAYROLL_RUN_ALREADY_PAID`) —
correcting paid-out money needs a deliberate void with a reason, not a
silent resubmission.

**Statutory figures are computed inline in `PayrollRunService`, not by
calling `StatutoryPreviewService`** — that service throws when a tenant
isn't statutory-enabled, which is the correct behaviour for its own
single-staff-member preview endpoint but wrong here: most tenants don't
have statutory calculations on, and a run must still submit normally for
them, simply with every line's `statutory` field `null`. The same
`computeEpfEtf`/`computeApitForMonth` pure functions are reused either way,
and a statutory line only appears when the tenant is enabled, a rule set is
published, **and** the period is exactly one calendar month
(`isFullCalendarMonth`, extracted from `statutory-preview.service.ts` into
`payroll.domain.ts` so both services share the identical predicate rather
than two copies quietly drifting apart).

**Known v1 limitation, not a silent gap**: a run only includes staff members
who currently have an *open* employment profile (`EmploymentService.listCurrent`)
— someone who left partway through the period and whose profile was
otherwise handled won't appear on that period's run. A real leaver/final-
settlement workflow is spec territory this phase doesn't attempt (§11.4,
already deferred in §65's gratuity note).

Next in Phase 5: payslip documents, cash/bank payment recording, and — the
first real UI screens for this whole module — a mockup, shown and approved,
before any admin component is written.

## 67. Payroll module — Phase 5 UI, Employment/Runs/Settings screens (2026-09-03)

Real admin screens for the first time — `/payroll`, `/payroll/runs`,
`/payroll/settings` — built to a mockup shown and approved first
(`/impeccable` + `/ui-ux-pro-max` + `/frontend-design`, per the user's
standing instruction), following the Incentives module's own screens
(`incentives/page.tsx`, `incentives/payouts/page.tsx`) as the direct
implementation precedent rather than inventing new conventions: same
`DataTable`/`EmptyState`/`DrawerShell`/toast/`errorCopy` primitives, same
teal-600/slate desk world, same route-per-screen-with-a-back-link shape
(no in-page tab switcher, which the mockup used for reviewer convenience
but doesn't match how Attendance/Incentives are actually structured).

**Settings needed one new small backend read** discovered while wiring the
frontend: nothing previously let a regular salon admin read their own
tenant's `statutoryPayrollEnabled` status — only the SUPER_ADMIN write side
existed (Phase 4). Added `GET /payroll/settings`
(`PayrollSettingsService`/`Controller`) combining the pay calendar and
statutory status in one round trip, the same "one endpoint, one screen"
shape `ReportsService.summary` already uses. A tenant not enabled for
statutory calculations never receives the platform's rate table in the
response at all — not just hidden client-side.

**One deliberate deviation from the approved mockup's mechanics, not its
design**: the mockup showed a "Preview" step before "Submit" for a payroll
run. The real backend has no non-persisting preview across every staff
member at once — only single-staff previews exist as true previews.
`POST /payroll/runs` is itself idempotent on the money (§66): calling it
again for an unchanged period returns the same live run rather than a
duplicate, which makes submitting the run *itself* the safe way to see the
breakdown before approving it. The real "Run payroll" button submits
directly and shows the resulting `SUBMITTED` run for review — same
information architecture as the mockup (breakdown table, status trail,
approve/mark-paid/void), different (and more honest, given what actually
exists) button semantics.

**Data availability also trimmed one mockup detail**: the mockup showed a
"22 days worked" sub-line for daily-wage staff. `PayrollRunLine` carries
`basePayCents` but not the underlying day-rate or day-count needed to
derive that display, so it was dropped rather than invented; `unpaidAbsenceDays`
and `unresolvedClosureDays` (real fields) are shown instead when nonzero.

Allowances/deductions remains its own future phase (not yet numbered),
confirmed with the user after they asked where EPF/ETF/allowances settings
were in the mockup — the Settings screen answers the statutory half; the
allowances half is deliberately still nothing, backend or UI, until that
phase starts.

Phase 5 continues: payslip documents and cash/bank payment recording are
still ahead.

## 68. Payroll module — Phase 5, payslips and payment recording (2026-09-03)

Closes out the two remaining pieces of Phase 5.

**Payment recording**: "Mark paid" previously flipped a run's status with no
record of how the money actually moved (spec §15). Added
`paymentMethod` (`CASH|BANK_TRANSFER|MIXED` — a new, narrow
`PayrollPaymentMethod` enum, not the existing customer-facing
`PaymentMethod`, which is mostly meaningless for paying staff: CARD_CAPTURED,
QR, GATEWAY, GIFT_CARD don't apply) and a free-text `paymentReference` to
`PayrollRun`, required together with `paidAt`/`paidBy` whenever a run is
marked paid. Deliberately not a full cash-drawer reconciliation or
digital-signature capture — a typed reference/note is what "mark paid"
already implied trusting the caller to get right; this just gives that
trust a real, visible record instead of none.

**Payslips**: no new backend endpoint — `GET /payroll/runs/:id` already
returns every line, so the payslip page reads that plus the existing
`GET /tenant/me` (already used elsewhere in the admin app) for the salon
name, and renders client-side. Built as a printable document exactly the
way `RetailSaleReceipt`/`InvoiceDocument` already are: plain HTML with
`print:` Tailwind utilities so Ctrl-P produces a clean PDF, no new PDF
library. Reused the established Invoice-receipt document pattern directly
rather than treating this as new visual design needing its own
mockup-approval round — it's an implementation detail filling in the
already-approved Payroll mockup, not a new surface.

Deliberately narrower than spec §16: English only (no reviewed Sinhala/
Tamil translations exist), no year-to-date totals (would need aggregating
every run a staff member has ever appeared in, not built), no allowances/
deductions lines (don't exist yet, §67). Employer EPF/ETF appear as
clearly-labelled informational lines ("paid by your salon, not deducted
from your pay"), never folded into the employee's own net-pay deduction —
spec's own explicit warning against misrepresenting them.

A payslip is only shown for a run that's `APPROVED` or `PAID` — a still-
`SUBMITTED` run is a plan awaiting review, not yet a fact worth handing to
a stylist as an official record of their pay.

This closes Phase 5. Phase 6 (allowances/deductions, per the user's
decision after reviewing the Phase 5 mockup) is next; Phase 7 (reports &
accounting mapping) and Phase 8 (hardening) follow, renumbered down one
each from the original §62 plan.

## 69. Payroll module — Phase 6, allowances and deductions (2026-09-03)

New ground: nothing existed for this before, backend or UI. Scoped with
the product owner before any code, the same way every other phase started:

1. **A curated fixed list, not an owner-typed generic catalog.** Six
   allowance types (transport, meal, attendance, phone/data, uniform,
   cost-of-living) and four deduction types (salary advance recovery, loan
   repayment, uniform/equipment recovery, and `OTHER_DEDUCTION` — the one
   escape hatch, requiring a typed reason, for a one-off case like a court
   order that doesn't fit a preset category). Covers the common Sri Lankan
   salon cases from the spec (§6.2/§9) without the long tail (acting
   allowance, union dues, ...) a small salon doesn't need.
2. **Both allowances and deductions, one mechanism** (`EmployeePayComponent`,
   a `kind` derived from `type` via one shared lookup, `PAY_COMPONENT_KIND`,
   rather than two parallel tables).
3. **Recurring by default.** Assigning "Transport allowance: Rs. 5,000"
   applies to every payroll run computed while active, until changed or
   deactivated — not effective-dated like `Employment`, since an allowance
   amount changing isn't the same kind of record-worthy event a wage
   change is, and `PayrollRun.snapshot` already preserves what was actually
   applied to a finalized period regardless of later edits. "Editable per
   run" is satisfied by components being read fresh at submit time, not by
   a separate per-run override mechanism — changing or removing one before
   running payroll for the next period is enough, and a true one-off,
   non-persisted override was deliberately left out of v1 as unnecessary
   added complexity.
4. **EPF/ETF applicability is a configurable flag per assignment, default
   off.** Whether a given allowance counts toward EPF/ETF is genuinely
   unclear in general — the same caution the statutory engine itself
   already uses (§62) rather than asserting a specific legal position for
   every salon's exact setup.

**A real correction, found while building this, not left sitting next to
it**: the Phase 4 `computeEpfEtf` call folded incentive/commission into the
EPF/ETF base by feeding it `gross.totalCents` (base pay + incentive)
directly. This directly contradicts this project's own sourced Phase 0
research (§62): *"Excluded [from EPF]: overtime payments, reimbursable
traveling expenses, and incentive/bonus payments."* Fixed as part of this
phase's necessary refactor (adding a second, allowance-derived base makes
this the natural moment): `computeEpfEtf` now takes two explicit bases,
`epfApplicableEarningsCents`/`etfApplicableEarningsCents` — each basePay
plus only the allowances marked applicable, **never incentive**. Computed
once in `PayrollPreviewService` (`computeEarningsBases`, pure and unit-
tested) and read from there by both `PayrollRunService` and
`StatutoryPreviewService`, so the two can't drift apart on what "the EPF
base" means.

**Net pay now also subtracts `deductionsCents`** (advance/loan/uniform
recovery, `OTHER_DEDUCTION`) after statutory, in both the run and the
single-staff statutory preview: `netCents = grossCents − deductionsCents −
epfEmployeeCents − apitCents`. Deductions are recoveries against net pay,
not a reduction to gross earnings or to either statutory base.

UI: a "Allowances & deductions" drawer per staff member (Employment page),
offering only types not already assigned (one active per type); the Runs
panel's per-staff table gained Allowances/Deductions columns; the payslip
document lists each active component by name and amount.

Phase 7 (reports & accounting mapping) is next.

## 70. Payroll module — Phase 7, reports & cost breakdown (2026-09-03)

Scoped before building, per this project's standing rule: this codebase
has no accounting/GL system anywhere (Phase 0's discovery flagged "what
accounting system and chart of accounts are used?" as an open question
that was never answered, because there isn't one integrated) — so spec
§18's "accounting mapping" (posting journal entries) has nothing to map
into. Asked the product owner directly rather than build a fictional
journal-posting feature or silently skip the whole phase.

**Decided**: a read-only cost breakdown, grouped the way a bookkeeper
needs it for manual entry into whatever accounting software or
spreadsheet the salon already uses (salary/base-pay expense, commission
expense, allowances expense, EPF employee withheld, EPF/ETF employer
expense, APIT withheld, deductions recovered, net pay, and total cost to
the salon), plus a CSV export. No journal, no GL, no posting — this is the
realistic, buildable half of spec §18 given what this product actually is.

**Implementation** (`GET /payroll/reports?from&to`, `PayrollReportService`):
sums figures directly out of every non-void `PayrollRun.snapshot` fully
contained in the requested range — no new table, no second copy of
figures already frozen in each run. A run only partly overlapping the
range is excluded entirely rather than counted at a fraction, so every
total is the sum of whole, real runs. "Total cost to the salon" is gross
pay plus employer EPF/ETF (the true cost to the business, not just what
staff took home) — distinct from "net pay," which is what actually left
the bank/cash drawer.

UI: `/payroll/reports` — a date-range picker, the cost-breakdown cards, a
per-run table, and a client-side CSV export (no new dependency — a Blob
and an anchor download, the same pattern this app already has no reason
not to reuse elsewhere).

This completes the phase list from the original discovery pass except
Phase 8 (hardening: security review, parallel-run testing, and the
professional sign-off gate before the statutory engine can ever be turned
on for a real tenant) — everything else in the roadmap set at §62 has now
shipped.

## 71. Payroll module — Phase 8, hardening (2026-09-03)

An audit pass over everything built in Phases 1–7, not new features. Two
of the three things spec §27's hardening phase asks for are genuinely
outside what a coding session can do, and are named here rather than
quietly skipped:

- **Parallel-run testing** (two real payroll cycles run alongside the
  salon's existing/manual process, compared for discrepancies) needs real
  salons, real staff, and real usage over real time — a business activity
  for whoever operates this once it's live, not something buildable now.
- **Professional sign-off** on the statutory configuration needs a
  qualified Sri Lankan payroll/accounting/labour-law professional, which
  this session has never claimed to be (§62's own framing throughout).
  `Tenant.statutoryPayrollEnabled` stays off for every tenant until that
  happens — nothing in this hardening pass changes that gate.

**What this session could do, and did**: a systematic audit of every
payroll controller and service built in Phases 1–7 for tenant isolation
and role enforcement, per CLAUDE.md's security checklist and spec §26's
test matrix.

- Every tenant-scoped controller (`employment`, `pay-calendars`,
  `pay-components`, `base-pay`, `preview`, `runs`, `settings`, `reports`,
  `statutory`) carries both `@RequiresModule("payroll")` and
  `@Permissions(MANAGE_PAYROLL)` on every route — verified directly against
  the source, not assumed. The one controller without `@RequiresModule`
  (`statutory-rule-sets`) is deliberately platform-only (`PLATFORM_ADMIN`),
  which is correct: it has no tenant context to gate.
- Every service method that accepts a client-suppliable ID (a `staffId`, a
  run `id`, a pay-component `id`) resolves it through a query that also
  filters by `tenantId` derived from the caller's own JWT — never trusts an
  ID alone. Confirmed by reading every `find`/`findOne` call across the
  module's services, not by assuming the pattern held.
- The two places a lookup omits `tenantId` (`EmploymentService.upsert`'s
  reload of a just-created row, `PayrollRunService.run`'s equivalent) are
  safe, not overlooked: the row was inserted moments earlier inside the
  same tenant-scoped transaction, and a UUID collision across tenants is
  not a real risk — the identical, pre-existing pattern
  `IncentivePayoutService.reload` already uses.
- `Tenant.statutoryPayrollEnabled` has exactly one write site in the whole
  codebase (`SuperAdminService.setStatutoryPayrollEnabled`, `PLATFORM_ADMIN`-
  gated); `StatutoryRuleSet.verified` is likewise only ever set inside the
  same `PLATFORM_ADMIN`-gated publish flow. No tenant-side route can flip
  either — confirmed by grep across the entire backend, not by re-reading
  the two services that were expected to be the only ones.

**New tests, not just a read-through**: this codebase had zero automated
tests pinning down which roles hold which permission — `role-permissions.ts`
being correct relied entirely on reading it by hand. Added
`role-permissions.spec.ts` asserting OWNER/MANAGER hold `MANAGE_PAYROLL`
and RECEPTIONIST/STAFF/SUPER_ADMIN don't — the first such test in the
project, scoped to payroll rather than backfilling the entire pre-existing
matrix. Also added explicit "tenant isolation" test blocks to
`EmploymentService`, `PayComponentService`, `PayrollRunService`, and
`PayrollReportService` proving each read/write is scoped by the caller's
own `tenantId` — properties that were already incidentally true and
covered by other tests' mock assertions, now named and asserted directly
as what they are: a security guarantee, not a side effect of a "not found"
test.

No defects were found in this audit. That is itself worth recording,
distinctly from "nothing was checked."

