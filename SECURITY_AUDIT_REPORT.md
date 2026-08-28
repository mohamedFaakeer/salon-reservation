# Security & Multi-Tenant Audit Report — Salon Reservation SaaS

**Date:** 2026-08-28
**Scope:** `apps/api` (NestJS 11 + TypeORM 1.x + PostgreSQL 17/Neon), `apps/web`, `apps/admin` (Next.js 16)
**Method:** Manual code review with live, read-only verification against production (`salon-api-ncok.onrender.com`, `salon-web-qmpb.onrender.com`) where stated. No code, schema, or config changes were made. No destructive testing was performed.
**Audit template:** Adapted from a supplied generic OWASP/multi-tenant-SaaS checklist, mapped onto this repository's actual stack (NestJS/TypeORM/raw-SQL migrations — not Prisma/Drizzle; custom argon2id+JWT — not Clerk/Auth.js; no Redis; **zero Postgres RLS or `SECURITY DEFINER` functions anywhere in this codebase**, confirmed by full-repo grep before this audit began).

---

## 1. Executive Summary

This is a mature, deliberately-engineered codebase from a security standpoint. Every major boundary the template asks about — tenant isolation, authentication, session handling, authorization/RBAC, resource ownership, SQL injection, XSS, CSRF, secrets, file upload, error handling — was traced to real code and found correctly implemented, in most cases with an explicit design comment showing the author already reasoned through the exact attack this audit was checking for. `docs/SECURITY.md` and `docs/DEVELOPMENT_PLAN.md`'s own S1–S12 security test matrix make specific claims; this audit verified them against the actual implementation rather than taking them on trust, and found them accurate.

No CRITICAL or HIGH code-level vulnerability was found. **One urgent, non-code action was outstanding and has since been resolved**: the production Neon database connection string and the platform-admin password had been shared in working chat transcripts — at least twice, including once during this audit's own investigation (a migration had to be run and the credential was pasted into chat to do it). `docs/DEVELOPMENT_PLAN.md` had already named it as an owed rotation. Both credentials were rotated on 2026-08-28 (see F-01) — the values that were exposed are no longer valid.

Two MEDIUM defense-in-depth gaps were found (detailed below) — neither is currently being exploited (one was verified live and found to be correctly configured today), but both represent a control that could silently fail without warning. A handful of INFORMATIONAL items round out the report, including one item worth stating precisely so it isn't mistaken for a new discovery: the customer "verify your phone" gate is confirmed, by a full-codebase grep, to have zero server-side authorization role — it is UI-only, exactly as `docs/DECISIONS.md` §46 already disclosed when it was built.

## 2. Architecture Overview

```
Browser (apps/web, apps/admin — Next.js 16)
   │  Bearer JWT in Authorization header (primary), httpOnly SameSite=strict
   │  refresh-token cookie (secondary, rotation/logout only)
   ▼
NestJS API (apps/api) — global guard chain, in module-import order:
   1. JwtAuthGuard    — verifies HS256 JWT (jose), issuer+audience checked
   2. TenantGuard     — re-derives tenantId from the verified JWT ONLY;
                        live-checks tenant.status===ACTIVE and membership
                        still exists, on every request
   3. RolesGuard      — @Permissions(...) checked against ROLE_PERMISSIONS,
                        server-derived roles only
   4. ModuleGuard     — tenant plan/entitlement gating
   + global CsrfOriginGuard, RateLimitGuard (applied in main.ts)
   ▼
Services (business logic) — resource ownership (e.g. a STAFF member's own
   appointment) enforced here, since a role→permission map can't express it
   ▼
TypeORM (parameterized queries only — verified, see §9)
   ▼
PostgreSQL 17 / Neon — GiST exclusion constraints for double-booking,
   raw-SQL migrations, no RLS, no SECURITY DEFINER functions
```

Tenant model: `tenant_id` (a real UUID column, `Tenant` entity) is the tenant. A user's tenant membership lives in `user_tenant_role` (one row per user per tenant, carrying their role). `SUPER_ADMIN` is a platform role carried on the `User` row itself (not `user_tenant_role`, which has a `NOT NULL tenantId`) and operates with no tenant context. There is no multi-tenant-per-user tenant-*switching* UI in this product — a staff login belongs to exactly one salon.

## 3. Multi-Tenant Isolation (§6–8, §64 of the template)

**Verdict: VERIFIED.** `tenantId` is read from the verified JWT payload exactly once, in `TenantGuard` (`apps/api/src/tenant/tenant.guard.ts:79`), and attached to `req.tenantContext`. Every controller reads it via `getTenantContext(req)` — grepped across all 37 controllers; none read `tenantId` from `body`/`query`/`params`. `TenantGuard` also re-checks, on **every request** (not just login): the tenant still exists and is `ACTIVE` (403 `TENANT_SUSPENDED` otherwise), and the caller still has a membership row (403 `TENANT_ACCESS_DENIED` if revoked) — so suspending a tenant or removing a user's access takes effect immediately, not at next login.

Service-layer lookups consistently scope by `(tenantId, id)` together (e.g. `customer.service.ts:214`: `findOne({ where: { id, tenantId } })`; the same pattern was confirmed in appointment, gift-card, and product services). One intentional, documented exception exists — see §3.1.

### 3.1 Reviewed and confirmed intentional: `Customer.findByIdPublic`

`apps/api/src/customer/customer.service.ts:235` looks up a customer by `id` alone, with no `tenantId` filter — backing the public, no-login marketing-unsubscribe link. This is IDOR-*shaped* but not a vulnerability: it's explicitly documented (`DECISIONS.md §43`) as a deliberate low-friction tradeoff, identical in spirit to the existing `bookingReference` design, and the worst case of the identifier being guessed is opting a stranger out of marketing they never asked to see — not a destructive, financial, or PII-disclosing action beyond a first name and salon name the SMS itself already carried. Confirmed as **intentional, not a finding**, per the template's own false-positive-control instruction (§72).

### 3.2 Resource ownership within a tenant — the STAFF "own appointment" boundary

RBAC alone can't express "a STAFF member may only touch *their own* appointment" — `docs/SECURITY.md` names this gap explicitly as **S6**. Verified end-to-end:

- `GET /appointments` (list): `resolveStaffFilter()` (`appointment.service.ts:346`) — for any non-elevated (STAFF-only) caller, the client-supplied `staffId` query param is **ignored entirely** and silently overridden to the caller's own resolved staff id (or a sentinel that matches nothing, if they have no staff record). A STAFF user cannot pass `?staffId=<someone else>` to see another stylist's day.
- `GET /appointments/:id`, `POST /:id/in-service`, `POST /:id/complete`, `POST /:id/services` (the four single-resource `MANAGE_OWN_APPOINTMENT` routes): each calls `assertOwnershipIfStaffOnly()` (`appointment.service.ts:378`) immediately after the tenant-scoped fetch, which 403s unless the appointment's `staffId` matches the caller's own staff record.
- `checkIn`, `cancel`, `reschedule`, `move-to-today`: gated by `MANAGE_APPOINTMENTS` only (never `MANAGE_OWN_APPOINTMENT`) at the controller — a STAFF-only caller can't reach these routes at all, so no ownership check is needed there.

**Status: VERIFIED**, no gap found in any of the 6 routes this permission touches.

## 4. Authentication (§23–26)

**Verdict: VERIFIED**, and above-average engineering:

- **Passwords**: argon2id via the `argon2` package (`password.service.ts`), memory cost 19 MiB / time cost 2 (OWASP-range defaults), never stored plaintext.
- **Access tokens**: HS256 JWT via `jose` (`token.service.ts`), 15-minute default TTL, **issuer and audience both verified on every `jwtVerify` call** — the staff (`salon-reservation`/`salon-reservation`) and customer (`salon-reservation`/`salon-web-customer`) token spaces use distinct audiences, so a customer's token can't be replayed against a staff-only endpoint's verifier even though they share a signing secret.
- **Refresh tokens**: opaque 32 random bytes (`node:crypto.randomBytes`), only the SHA-256 hash is ever persisted (`session.service.ts:45`). **Rotation-on-use with reuse detection**: presenting an already-rotated token revokes the *entire session family*, not just that one token (`session.service.ts:87-99`) — the standard defense against a stolen-refresh-token replay. `buildSessionUser` re-checks `user.status === "ACTIVE"` on every rotation, so disabling an account cuts off a live refresh chain, not just future logins.
- **Boot-time secret enforcement** (`apps/api/src/common/security/production-secrets.ts`): in production, the process refuses to start if `JWT_SECRET` is missing, under 32 characters, **or matches a hardcoded blocklist of every placeholder value that appears in `.env.example`** (the file's own comment explains this was added after finding the *committed dev secret* would otherwise pass the length check). Same treatment for `SUPER_ADMIN_PASSWORD` and a `DATABASE_URL` pointed at `localhost`. This is genuinely mature: a hard boot failure, not a log line nobody reads.
- **Team/staff account creation** (`CreateTeamMemberDto`, `packages/shared/src/dto/team.dto.ts`): `role` is constrained with `@IsIn(ASSIGNABLE_ROLES)` where `ASSIGNABLE_ROLES = [MANAGER, RECEPTIONIST, STAFF]` — **`OWNER` and `SUPER_ADMIN` are structurally impossible to assign through this endpoint**, enforced server-side by `class-validator`, independent of anything the client sends. This directly answers the template's Privilege Escalation (§28) and Mass Assignment (§29) sections with positive evidence, not just an absence of an obvious bug.

No self-service password-reset flow exists for staff accounts (owners hand out logins via `TeamController`); this is a product-scope choice, not a security gap — there's no forgot-password token-generation surface to audit (§45 is N/A for staff).

## 5. Session & Cookie Security (§24, §64 of the template)

**Verdict: VERIFIED.** Both the staff (`auth.controller.ts`) and customer (`customer-auth.controller.ts`) refresh-token cookies use identical, correct flags: `httpOnly: true`, `sameSite: "strict"`, `secure` in production. Neither cookie is ever read to authorize a business mutation — both controllers use the cookie **only** for `/refresh` (rotate) and `/logout` (revoke), both low-impact if a cross-site request somehow forged them (which `sameSite: strict` already prevents outright — the cookie is never sent cross-site, full stop).

The actual API authorization mechanism for every other endpoint is a `Bearer` header (`jwt-auth.guard.ts:29`), not a cookie — this is the primary reason CSRF is a structurally weak threat class here (see §7): a cross-site attacker's forged browser request cannot attach a custom `Authorization` header without triggering a CORS preflight that the origin allowlist rejects.

### 5.1 MEDIUM — Customer refresh token duplicated into `localStorage`

`apps/web/src/context/customer-auth-context.tsx` stores the customer's 7-day refresh token in `window.localStorage` (`REFRESH_TOKEN_KEY = "salon.customerRefreshToken"`), in addition to the `httpOnly` cookie the API sets. This is a genuine, deliberate tradeoff, not an oversight — the code comment explains why: `apps/web` and `apps/api` are deployed on different Render subdomains, and a cross-origin `fetch` call cannot reliably rely on a `SameSite` cookie reaching the API from the browser's JS in that topology, so the token is also returned in the response body for the client to use directly.

The security consequence is real: `localStorage` is readable by any JavaScript running on the page, so **any future XSS in `apps/web` would allow full session takeover** (steal the token, call `/customer-auth/refresh` indefinitely) in a way an `httpOnly`-cookie-only design would not permit. Today, this is a latent risk rather than an active one — `apps/web` was swept for every dangerous sink (`dangerouslySetInnerHTML`, `innerHTML`, `document.write`, `new Function`) and has exactly one hit, a hardcoded literal HTML comment with zero user-input interpolation (`apps/web/src/app/layout.tsx:80`). The finding is: **this architecture makes staying XSS-free in `apps/web` a hard security requirement, not just good practice** — any future feature that renders user-supplied rich text/HTML needs to go through this lens specifically.

## 6. Authorization / RBAC (§27–29)

**Verdict: VERIFIED.** `apps/api/src/common/authorization/role-permissions.ts` is a static, server-only map (`ROLE_PERMISSIONS: Record<UserRole, Permission[]>`) — never influenced by client input. Spot-checked against the actual controllers (`payment.controller.ts`, `team.controller.ts`, `super-admin.controller.ts`): every mutating route across all 37 controllers is either explicitly `@Permissions(...)`-gated or explicitly `@Public()` (grepped: 106 mutating-HTTP-verb decorators, 126 `@Permissions` decorators, and the 5 files with mutating routes but zero `@Permissions` in the file are *all* also `@Public()` controllers — guest booking, staff login, customer auth, the public availability check, and the public unsubscribe link — no controller falls through with neither).

`SuperAdminController` (`super-admin.controller.ts`) — the one place a `tenantId` legitimately comes from a URL param instead of the session — is gated by `Permission.PLATFORM_ADMIN` on every route, which itself only exists on the `SUPER_ADMIN` role in `ROLE_PERMISSIONS`, itself only ever set on the verified JWT server-side. Explicit, server-side, permission-gated cross-tenant access — exactly what the template's §65 asks to confirm.

## 7. CSRF (§20–22)

**Verdict: VERIFIED, with one code-level nuance.** As covered in §5, the primary auth transport (`Authorization: Bearer`) is structurally CSRF-resistant. On top of that, `apps/api/src/common/guards/csrf-origin.guard.ts` independently checks `Origin` (falling back to `Referer`) on every non-safe-method request against the `CORS_ORIGINS` allowlist. See §8 for the one gap in how that allowlist itself is enforced at boot.

## 8. MEDIUM — `CORS_ORIGINS` is not covered by the fail-fast production-secrets check

`assertProductionSecrets()` (§4) hard-fails boot on a missing/weak `JWT_SECRET`, a placeholder `SUPER_ADMIN_PASSWORD`, or a `localhost` `DATABASE_URL` — but it does **not** check that `CORS_ORIGINS` is set. If that one environment variable were ever left blank on a production deploy:

- `main.ts:31`'s CORS config falls back to `origin: true` (reflects *any* origin) while `credentials: true` stays on.
- `CsrfOriginGuard.canActivate()` (`csrf-origin.guard.ts:25`) also degrades to fully permissive (`allowed.size === 0` → `return true` for every method).

Both defenses collapse from the same single missing variable, silently, with no warning at boot.

**Verified live, not just theorized** (2026-08-28, read-only `OPTIONS`/`GET` probes against `https://salon-api-ncok.onrender.com` with `Origin: https://evil-attacker-example.com`): `Access-Control-Allow-Origin` is correctly **absent** for the untrusted origin, and correctly present (exact match, never a wildcard) for the real `salon-web-qmpb.onrender.com` origin. **Production is configured correctly today.** This finding is about the missing fail-fast guard against a *future* misconfiguration (a fresh Render service, a typo, a redeploy that drops the var), not a live exploit.

*Minor/cosmetic nit found in the same probe, not worth a fix priority*: `Access-Control-Allow-Credentials: true` is sent even on the rejected-origin response where `Access-Control-Allow-Origin` is absent. Harmless per the CORS spec (browsers require both together to actually use credentials cross-origin), just slightly untidy — default `cors` package behavior.

**Fix**: add a `CORS_ORIGINS` presence check to `findProductionSecretProblems()` in `production-secrets.ts`, matching the pattern already used for the other three variables.

## 9. SQL Injection (§12–14)

**Verdict: VERIFIED — no injectable pattern found.** Every dynamic query point in `apps/api/src` was traced:

- All `.where()`/`.andWhere()` calls on TypeORM's `QueryBuilder` use named-parameter placeholders (`:term`, `:tenantId`, ...) bound via a separate params object — including the one search endpoint with the most complex dynamic clause (`appointment.service.ts:106-122`, appointment search by name/phone/booking reference), where the SQL *fragment* text is built from an array of hardcoded developer-written strings (never from request input), and only the bound *values* come from the request.
- The two `ILike(\`%${q}%\`)` patterns found (`bundle.service.ts:109`, `product.service.ts:149`) use TypeORM's `ILike` `FindOperator`, which binds the whole pattern as a parameter value — the search term never becomes part of the SQL text itself.
- The three `andWhere(\`a.status NOT IN (${quoted(...)})\`)` patterns (`reports.service.ts`) interpolate `DID_NOT_HAPPEN`/`NOT_A_BOOKING`, which are **compile-time constant enum arrays** defined in the same file — never request input.
- Migrations (`apps/api/src/infrastructure/database/migrations/*.ts`) contain raw `queryRunner.query()` calls, but these are static DDL executed once at deploy time, not attacker-reachable; the one migration that does parameterize a runtime value (`RbacFoundation.ts:25`, seeding the first super-admin by email) correctly uses `$1` positional binding rather than string interpolation, which is good practice even for a script no external input reaches.

## 10. XSS (§15–19)

**Verdict: VERIFIED.** `apps/admin/src` has **zero** matches for any dangerous sink (`dangerouslySetInnerHTML`, `.innerHTML =`, `outerHTML =`, `document.write`, `new Function`). `apps/web/src` has exactly one: `apps/web/src/app/layout.tsx:80`, a static `DIRECTION_CONTRACT` HTML comment string with no runtime interpolation of any kind — confirmed hardcoded, not reachable by user input. React's default JSX escaping is relied on everywhere else, which is appropriate since neither app renders markdown or intentionally-allowed rich HTML from user content.

## 11. Error Handling & Information Disclosure (§42, §59, §62)

**Verdict: VERIFIED.** `apps/api/src/common/filters/api-exception.filter.ts` is the single global exception filter: any exception that isn't a recognized `ApiError`/`HttpException` becomes a generic `{ statusCode: 500, code: "INTERNAL_ERROR", message: "Something went wrong." }` to the client — **the real error (stack trace, and for a database error, the actual Postgres message) is logged server-side only**, never returned in the response body. This was independently reconfirmed during this audit's own earlier work this session: a genuine `QueryFailedError: relation "customer_account" does not exist` was correctly surfaced to the client only as the generic envelope, with the real error visible solely in the server log. The same filter's logging explicitly excludes the request body, "since booking/customer routes carry phones and emails" — a deliberate no-PII-in-logs policy, confirmed in code.

## 12. Secrets Management (§31–32, §68)

**Verdict: VERIFIED, with one urgent operational (non-code) action outstanding.**

- `.env` and `.env.*` are gitignored (`.gitignore:13-14`) and **have never been committed** — confirmed by `git ls-files` (no `.env`-shaped file tracked) and a full `git log --all -p` scan for `.env`/`.env.local`/`.env.production` history, and separately for secret-shaped string patterns (`AWS secret key`, PEM private-key headers, `neondb_owner:`, `npg_...`, live Stripe-style/GitHub-token-style prefixes) across the **entire commit history of every file** — zero matches, all zero counts confirmed by command output, not assumed.
- The Neon connection-string fragment pasted into *this session's own chat transcript* (to run a migration) was checked against the current working tree and found in **no file** — it only ever existed as a transient shell environment variable, never written to disk.

**Outstanding action, not a code finding**: `docs/DEVELOPMENT_PLAN.md` itself already records "the Neon connection string and the platform-admin password were shared in a working transcript" as an owed rotation, predating this audit. This session repeated it (pasting the production `DATABASE_URL` into chat to run the `CustomerAuth` migration). **Recommendation: rotate the Neon database password and the `SUPER_ADMIN_PASSWORD` now**, independent of the rest of this report's timeline — a credential known to have left a secure channel should be treated as compromised regardless of how carefully it was subsequently handled.

## 13. File Upload / Path Traversal / SSRF / Webhooks / Background Jobs

- **File upload (§47–49): VERIFIED SAFE.** `apps/api/src/common/image.util.ts` hand-rolls real magic-byte detection for PNG/JPEG/WebP (explicitly *not* trusting multer's client-reported MIME type, and explicitly avoiding a dependency with unfixed high-severity advisories that `npm audit` would otherwise flag) — file type is proven from the buffer's own header bytes. Every upload route (`tenant.controller.ts`, `product.controller.ts`) sets a hard multer `fileSize` ceiling. Uploaded images are sent to Cloudinary keyed by the server-derived `tenant.slug`, never written to local disk with any client-influenced filename — no path-traversal surface exists (grepped for `originalname`/`writeFile`/`path.join` near every upload handler: zero matches).
- **CSV/Excel export / CSV-injection (§57): N/A.** No export feature exists anywhere in `apps/api` (grepped for `text/csv`, `Content-Disposition`, `exceljs`, `xlsx`) — nothing to poison.
- **SSRF (§50): N/A.** No feature accepts a URL for the server to fetch (no link previews, no webhook-URL configuration, no document-import-by-URL).
- **Webhooks (§52): N/A, confirmed by code, not by claim.** `apps/api/src/payment/providers/payhere.provider.ts` is a genuine stub — both `confirm()` and `refund()` unconditionally throw `501 NOT_IMPLEMENTED` regardless of the `PAYMENTS_PAYHERE_ENABLED` flag's value, and no webhook-receiving endpoint exists for it at all. Matches `CLAUDE.md`'s documented "stubbed only, never default" scope exactly — zero live attack surface, not merely low-risk.
- **Background jobs (§53–54): VERIFIED, no tenant leakage; one documentation-drift note.** `apps/api/src/booking/booking.service.ts:1266-1269` expires stale slot holds lazily (on the next conflicting write, scoped by `tenantId` and `staffId` in a parameterized `UPDATE`), not via a cron job — its own code comment says so explicitly ("no scheduled sweeper exists yet"), which is a factual drift from `CLAUDE.md`'s stated architecture ("expired holds are released by a scheduled job"). This has no security consequence (the lazy check is correctly tenant-scoped, and a stale HELD row cannot block a legitimate new hold once its own expiry is checked), but the two documents should be reconciled. The only real `@Cron` jobs in the codebase are the notification scheduler (`notification.scheduler.ts`, `notification-scheduler.service.ts`), which iterate tenants explicitly rather than relying on any shared mutable request-scoped state.

## 14. Dependency Security (§67)

`npm audit --omit=dev` (production dependencies only): **0 vulnerabilities.** Not run against devDependencies as part of this audit (lower risk surface, doesn't ship to production); recommend including it in CI regardless.

## 15. Not Independently Re-Verified This Pass (out of the agreed scope)

Per the scope agreed before this audit began: **no live Neon database-role privilege inspection was performed** — since this application implements zero Postgres RLS and zero `SECURITY DEFINER` functions, tenant isolation is entirely an application-layer control (§3), and the actual Neon connection role's grants (whether it could theoretically `CREATE EXTENSION`/`ALTER SCHEMA`) were not checked live. If this system is ever migrated toward database-enforced tenant isolation, that would be the point to also formally verify the connection role follows least-privilege.

## 16. Security Scorecard

| Security Area | Status | Severity | Evidence |
|---|---|---|---|
| Authentication | VERIFIED | — | §4 |
| Authorization / RBAC | VERIFIED | — | §6 |
| Multi-Tenant Isolation | VERIFIED | — | §3 |
| Resource Ownership (STAFF/own-appointment) | VERIFIED | — | §3.2 |
| IDOR | VERIFIED (1 reviewed exception, intentional) | — | §3.1 |
| SQL Injection | VERIFIED | — | §9 |
| XSS | VERIFIED | — | §10 |
| CSRF | VERIFIED | — | §7 |
| Session Security | VERIFIED, 1 finding, **guard added** | MEDIUM | §5.1 |
| CORS / boot-time enforcement | VERIFIED LIVE, 1 finding, **FIXED** | MEDIUM → resolved | §8 |
| Privilege Escalation | VERIFIED | — | §4, §6 |
| Mass Assignment | VERIFIED | — | §4 |
| Secrets in code/git history | VERIFIED | — | §12 |
| Secrets operational handling | **RESOLVED** | HIGH (operational) → resolved | §12 |
| Error Handling | VERIFIED | — | §11 |
| File Upload / Path Traversal | VERIFIED | — | §13 |
| SSRF | N/A | — | §13 |
| Webhooks | N/A (stub) | — | §13 |
| Background Jobs / Cache Isolation | VERIFIED, 1 doc-drift note, **FIXED** | INFORMATIONAL → resolved | §13 |
| Rate Limiting | VERIFIED | INFORMATIONAL (single-instance only) | §4 (rate-limit.guard.ts) |
| Dependencies | VERIFIED | — | §14 |
| Database privilege (live) | NOT VERIFIED (out of agreed scope) | — | §15 |
| RLS / SECURITY DEFINER | N/A — none exist | — | intro |

## 17. Findings Register

### F-01 — Production credentials shared in chat transcripts
- **Severity**: HIGH (operational action, not a code defect)
- **Status: RESOLVED (2026-08-28)** — all three rotation steps completed: (1) the Neon database role's password was reset in the Neon console and `DATABASE_URL` updated in Render; (2) the platform super-admin's actual account password was rotated via the existing `npm run user:set-password -w apps/api -- --email <email> --generate` script (already documented in `docs/DEPLOYMENT.md:129`), which also revoked every existing session for that account; (3) the `SUPER_ADMIN_PASSWORD` env var in Render was updated so a future from-scratch migration/disaster-recovery restore won't reseed the old leaked value. The credentials pasted into this session's transcript are no longer valid.
- **Evidence**: `docs/DEVELOPMENT_PLAN.md` "Still open" section; this session's own transcript.
- **Impact**: Anyone with access to the transcript(s) had the production database password and/or platform-admin password — now moot, both rotated.

### F-02 — `CORS_ORIGINS` absence not caught by the production boot-time check
- **Severity**: MEDIUM (latent, not currently live — see §8)
- **Status: FIXED (2026-08-28)** — `findProductionSecretProblems()` now rejects a missing/blank `CORS_ORIGINS` in production. Regression tests added in `production-secrets.spec.ts` (missing, blank, and the "reports every problem at once" count updated to 4). All 15 tests pass; typecheck/lint clean on the changed files.
- **File**: `apps/api/src/common/security/production-secrets.ts`
- **Verification test**: `production-secrets.spec.ts` — "rejects a missing CORS_ORIGINS", "rejects a blank CORS_ORIGINS the same as unset".

### F-03 — Customer refresh token duplicated into `localStorage`
- **Severity**: MEDIUM (architecture-driven tradeoff, currently mitigated by a clean XSS surface)
- **Status: PARTIALLY ADDRESSED (2026-08-28)** — no code change to the token storage itself (still the right tradeoff given the cross-origin deployment), but the recommended guard is now real: `eslint.config.mjs` adds a `no-restricted-syntax` block scoped to `apps/web/src/**` and `apps/admin/src/**` that errors on any `dangerouslySetInnerHTML`, `.innerHTML`/`.outerHTML` assignment, `document.write`, or `new Function` — using ESLint's built-in rule, no new dependency. The one existing, already-reviewed-safe usage (`apps/web/src/app/layout.tsx`'s static `DIRECTION_CONTRACT` literal) got an explicit, justified disable comment rather than being silently exempted.
- **File**: `apps/web/src/context/customer-auth-context.tsx` (unchanged); `eslint.config.mjs` (new guard).
- **Verification test**: `npx eslint apps/web/src apps/admin/src` — confirmed the guard fires on a deliberately reintroduced `dangerouslySetInnerHTML` during this fix, and confirmed zero new violations across either app afterward.

### F-04 — Informational: hold-expiry documentation drift
- **Severity**: INFORMATIONAL
- **Status: FIXED (2026-08-28)** — `CLAUDE.md` rule 4 now describes the actual lazy-expiry mechanism instead of claiming a scheduled job.
- **Files**: `CLAUDE.md` (was: claims a scheduled job) vs. `apps/api/src/booking/booking.service.ts:1266` (lazy, on-write expiry; comment admits "no scheduled sweeper exists yet")
- **Note**: a proactive scheduled sweeper is still not built — only the documentation was corrected to match reality. Building one remains a legitimate future option (e.g. if a stale-hold-count dashboard metric is ever wanted), not something this fix implies is done.

### F-05 — Informational: confirms already-disclosed behavior, not new
- **Title**: Customer phone-verification has no server-side authorization role
- **Evidence**: `grep -rn "phoneVerified" apps/api/src` outside the `customer-auth` module itself returns zero matches.
- **Note**: This matches `DECISIONS.md` §46 point 8's own disclosure exactly. Not a vulnerability — guest booking without verification was always the intended, documented default. Recorded here only so the audit explicitly confirms it with fresh evidence rather than silently trusting the prior disclosure.

### F-06 — Informational: in-memory rate limiter
- **File**: `apps/api/src/common/guards/rate-limit.guard.ts`
- **Note**: Correct and well-engineered (documented fixes for an X-Forwarded-For bypass and a trust-proxy gate already exist in the code) for a single-instance deployment. Would need a shared store (e.g. Redis) if ever horizontally scaled — not a current gap, a forward-looking note.

### F-07 — Cosmetic: `Access-Control-Allow-Credentials: true` sent on rejected-origin responses
- **Severity**: LOW / cosmetic
- **Evidence**: live probe, §8.
- **Fix**: optional; default `cors` package behavior, not exploitable on its own.

## 18. API Security Matrix (risk-tiered summary, per the agreed reporting format)

All 37 controllers were checked for: authentication (via global `JwtAuthGuard`/`@Public()`), tenant-check (`getTenantContext`, never client input), role/permission gating, and — where relevant — resource ownership. Full per-route detail was given above wherever something was actually reviewed as noteworthy (Payment, Team, SuperAdmin, Appointment). Every other controller followed the identical, verified-correct pattern with no deviation found:

| Controller group | Tenant-scoped? | Permission-gated? | Notes |
|---|---|---|---|
| Appointment, Booking (guest), Schedule, Availability | Yes / Booking is intentionally `@Public()` | Yes (see §3.2, §6) | Ownership verified in depth |
| Customer, Gift Card, Service Package, Invoice | Yes | Yes | `findByIdPublic` exception reviewed, §3.1 |
| Payment | Yes | Yes | Full detail, §6 |
| Product, Bundle, Inventory, Stock, Retail Sale | Yes | Yes | Upload validation reviewed, §13 |
| Staff, Staff-Leave, Schedule, Closure, Service | Yes | Yes | — |
| Team (staff logins) | Yes | Yes, `MANAGE_TEAM`, OWNER-effectively-only | Full detail, §4 |
| Attendance, Attendance-Edit, Incentive, Incentive-Payout | Yes | Yes | — |
| Notification (log/rules/templates/quota) | Yes | Yes | — |
| Audit, Reports, Winback | Yes | Yes, `VIEW_REPORTS`/`VIEW_AUDIT_LOG` | Query-builder search reviewed, §9 |
| Tenant (settings, logo) | Yes | Yes | Upload validation reviewed, §13 |
| Auth, Customer-Auth | N/A (pre-authentication) | `@Public()` by design | Full detail, §4–5 |
| Customer-Unsubscribe | N/A (public link) | `@Public()` by design | §3.1 |
| Super-Admin | Cross-tenant by design | `PLATFORM_ADMIN` only | Full detail, §6 |
| Dashboard, Inquiry | Yes | Yes | — |

## 19. Database Security Matrix (risk-tiered summary)

All tenant-owned tables (`appointment`, `customer`, `payment`, `staff`, `service`, `product`/`product_variant`, `gift_card`, `service_package`, `invoice`, `notification_*`, `staff_leave`, `working_schedule`, `incentive*`, `retail_sale*`) carry a `tenantId` column, enforced application-side (§3) — no Postgres RLS exists (confirmed, intro). The one cross-tenant table by design is `tenant` itself (read by `SuperAdminController`, gated by `PLATFORM_ADMIN`). No table was found relying on client-supplied identifiers for tenant scoping instead of the server-derived `tenantId`.

## 20. Remediation Roadmap

**Phase 0 — Emergency (do this regardless of anything else in this report)**
- F-01: **RESOLVED** — Neon database password and `SUPER_ADMIN_PASSWORD`/account rotated.

**Phase 1 — Tenant Isolation**
- Nothing required — verified clean (§3).

**Phase 2 — Injection**
- Nothing required — verified clean (§9, §10, §13).

**Phase 3 — Authentication / Session**
- F-02: **FIXED** — `CORS_ORIGINS` added to the production boot-time check.
- F-03: **GUARD ADDED** — no change to token storage (correct tradeoff stands), but a `no-restricted-syntax` ESLint block now enforces the XSS-free invariant in `apps/web`/`apps/admin` automatically.

**Phase 4 — Infrastructure**
- F-04: **FIXED** — `CLAUDE.md`'s hold-expiry description now matches the actual lazy-expiry implementation.
- F-06: Note for future horizontal scaling (rate limiter needs a shared store).
- F-07: Optional cosmetic CORS header cleanup.

**Phase 5 — Defense in Depth**
- F-03's lint guard is done (see above) — nothing further here.
- Consider gating `/api/docs` (Swagger) behind auth or removing it from the production build if the API's exact route/DTO shape is considered sensitive — currently public, low risk, but a conscious decision either way is better than an implicit one.

## 21. Testing Recommendations

The existing `docs/DEVELOPMENT_PLAN.md` §2.5 / `docs/SECURITY.md` §11 S1–S12 security e2e matrix already covers the right shape (cross-tenant read/write, manipulated tenantId/price/ownership, role abuse, duplicate callbacks, tampered JWT, expired+refresh, DTO rejection) and this audit found its claims to be accurate against the real implementation. Recommended additions:
- A regression test for F-02 (boot with `CORS_ORIGINS` unset in a `NODE_ENV=production` test harness → expect the process to refuse to start).
- A regression test locking in `resolveStaffFilter`'s behavior (§3.2): a STAFF-role request for `GET /appointments?staffId=<other-staff-id>` must return only the caller's own appointments, never the requested `staffId`'s.

## 22. Production Readiness Verdict

> 🟢 **NO CRITICAL/HIGH ISSUES IDENTIFIED — READY FOR FINAL SECURITY VALIDATION**

No CRITICAL or HIGH code-level vulnerability was identified within the audited scope. All findings from this report — F-01 (credential rotation, resolved 2026-08-28), F-02 (CORS boot-check, fixed), F-03 (XSS-sink lint guard, added), F-04 (documentation drift, corrected) — are now closed. Remaining items (F-06, F-07) are informational, forward-looking notes with no action required today.

No claim of "100% secure" is made. This audit traced attacker input → application → authorization → database → response for every category the supplied template asked about, adapted to this codebase's real stack, and found the documented security architecture (`docs/SECURITY.md`, `CLAUDE.md` §6) to be an accurate description of the actual implementation — a genuinely uncommon result, and worth stating plainly rather than hedging.
