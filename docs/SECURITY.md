# SECURITY.md — Security Strategy & Controls

**Threat model priority (MVP demo but production-minded):** tenant isolation, authentication/authorization, double-booking integrity, payment idempotency, client manipulation of prices/availability/permissions.

---

## 1. Core Principles

1. **Never trust the client.** Client-supplied `tenantId`, `userId`, `staffId`, prices, availability, payment status, and permissions are all ignored or re-derived server-side.
2. **Tenant context comes from the session/JWT**, never from request bodies or query strings.
3. **Authorization is enforced in the backend** (guards on every route). Frontend hiding is convenience, not security.
4. **Critical values computed once, server-side:** price (PricingService), availability (AvailabilityEngine), refunds (RefundCalculator), tenant scoping (interceptor).
5. **Defense in depth** — guard + scoping interceptor + DB-level constraints.

---

## 2. Authentication

- **Password hashing:** `argon2id` (via `argon2` package) — memory/iteration parameters tuned to OWASP recommendation for the demo hardware; config via env.
- **Access tokens:** short-lived JWT (15 min default) signed with HS256 using a secret from env (`JWT_SECRET`, ≥ 32 random bytes). Claims: `sub`, `tenantId`, `roles`, `branchId`, `sid` (session id).
- **Refresh tokens:** opaque, stored hashed, bound to device/session (`sid`), rotating; httpOnly cookie (`Path=/api/v1/auth; HttpOnly; Secure; SameSite=Strict`), 7-day expiry; revocation on logout and on reuse detection.
- **CSRF:** state-changing requests to the API require a CSRF token (`X-CSRF-Token`) validated against the session; origin/host header checks on the API.
- **Rate limiting:** auth login/refresh endpoints: per-IP + per-account throttling (sliding window); booking and payment creation endpoints: per-IP throttle. `429 RATE_LIMITED` with `Retry-After`.
- **Password policy:** minimum 8 chars (NestJS DTO validated); no password storage beyond argon2 hash; no plaintext logging anywhere.

**Customer side (public booking):** no customer authentication at all (Decision Q2). Ownership of a booking is proven by **phone number + booking reference** ("something they know" combination). Suitable for MVP scope:
- Reference codes are 6-char base32 (case-insensitive; excludes similar chars like O/0/I/1) — ~2³⁰ space, unguessable for practical purposes.
- Phone verification is not performed (no OTP — cost decision); the phone field is normalized/validated (`E.164`-ish) and rate-limited.

---

## 3. Authorization (RBAC)

- Roles: `SUPER_ADMIN` (platform), `OWNER`, `MANAGER`, `RECEPTIONIST`, `STAFF` (tenant-scoped via `user_tenant_role`).
- Permission matrix from API.md §5 is implemented as a `Permission` map, consumed by `@Permissions(...)` decorator + `RolesGuard`.
- `TenantGuard` runs **before** `RolesGuard`:
  1. Resolve user + tenant from JWT.
  2. Attach `TenantContext` to the request.
  3. If the route is tenant-scoped but no valid tenant → 401/403.
  4. Super-admin routes additionally require `SUPER_ADMIN` role and an explicit audit event.
- Access-control checks that must exist as tests: role X cannot call manager-only route; STAFF cannot mutate another staff member's appointment; cross-tenant read returns 403/404.

---

## 4. Multi-Tenancy Isolation

Three layers, all active:

1. **`TenantGuard`** — rejects requests where the JWT's tenant doesn't match the requested resource tenant (or where a public resource path is not `slug`-based).
2. **Tenant scoping interceptor** — intercepts TypeORM repository operations and injects `where: { tenantId: ctx.tenantId }` for all `TenantScoped` entities. This prevents accidental cross-tenant leakage even when a developer forgets the `where`.
3. **Public access path** — customer browsing uses the salon's public `slug`; the API resolves tenant from the slug then applies the same scoping rules to *that* tenant only.

Rules:
- `tenantId` is never an input to any writing route.
- Response for cross-tenant attempts: **404/403 indistinguishable** (no existence leak).
- `SUPER_ADMIN` operations are the only cross-tenant reads, and are audited.

---

## 5. Input Validation

- Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
- DTOs defined in `packages/shared` (class-validator): strict types, ranges, regex (phone, reference), enums.
- **Server re-validates everything the frontend pre-validates** — client validation is cosmetic.
- IDs are UUIDs; strings length-capped; `JSON` fields allowed only where modeled (settings, metadata).
- No dynamic SQL; TypeORM parameterized queries only.

---

## 6. Integrity & Manipulation Protection

| Attack | Defense |
|---|---|
| Forged price in booking request | Server ignores any client price; PricingService derives totals from `Service` rows ✓ |
| Forged `staffId` (unqualified staff) | Engine re-verifies staff-active + staff-service match inside txn |
| Forged `tenantId` | Never read from body; derived from JWT/slug |
| Forged `appointmentId` (other customer's) | Owner check by reference+phone (customer routes); tenant+role checks (admin routes) |
| Forged payment amount | `amountCents` validated against computed totals; amounts immutable after creation |
| Forged payment status | Provider/state machine transitions only via server logic; no client-set state |
| Duplicate payment/callback | Unique `idempotencyKey` + unique provider event records |
| Double booking | Exclusion constraints at DB level (DATABASE.md §3) |
| Reschedule race | Engine re-runs availability in txn with advisory lock; optimistic lock on appointment |
| Status-change race | `version` optimistic lock (409 `VERSION_CONFLICT`) |

---

## 7. Session & Cookie Handling

- Access token delivered as `Authorization: Bearer` in responses; also acceptable as an httpOnly cookie (`SameSite=Strict`) when same-origin (admin app).
- Refresh token: httpOnly, `Secure` (prod), `Path=/api/v1/auth`, `SameSite=Strict`.
- Cookies **never** store role/permission data (JWT does, signed).
- Session rotation on privilege change; logout revokes `sid`.

---

## 8. Payments & Refunds Security

- All payment creation/confirmation goes through the server; `ManualProvider` requires an authenticated staff user (RECEPTIONIST+).
- `amountCents` is validated against `Payment`/`Appointment` totals; overpayment/underpayment rejected.
- Refund: `RefundCalculator` returns the allowed amount per cancellation policy; refund creation requires OWNER/MANAGER; external refund reference recorded, never invented.
- PayHere adapter (when enabled): webhook signature verification (HMAC from provider secret), constant-time comparison, replay absorbed by `payment_attempt.provider_event_id` unique constraint, and webhook handler is idempotent.

---

## 9. Web / Runtime Hardening

- Helmet headers on API (`X-Content-Type-Options`, `X-Frame-Options`, CSP where applicable).
- CORS: restricted allow-list (admin app origin, customer app origin) from env; credentials allowed only for those origins.
- Rate limiting: auth, booking creation, payment confirm, public availability (per-IP abusable) — throttled.
- Secrets: only in env vars / Render dashboard; `.env` committed to nothing; `.env.example` documents shape with placeholders.
- No secrets in client bundles (`NEXT_PUBLIC_*` only for non-secret config such as API base URL).
- Request logging with `requestId`; **no PII in logs** (phones/emails redacted in error paths).
- PG connection: SSL required in production (Neon), `sslmode=require`.

---

## 10. Audit Log

Audit interceptor records on `TenantScoped` writes + destructive actions:

```json
{
  "tenantId": "…",
  "actorUserId": "…",
  "action": "APPOINTMENT_CANCELLED",
  "entityType": "Appointment",
  "entityId": "…",
  "metadata": { "reason": "customer request", "refundCents": 0 },
  "ipAddress": "…",
  "userAgent": "…",
  "createdAt": "…"
}
```

Audited actions (spec §36): appointment created/cancelled/rescheduled; payment recorded; refund initiated; service price changed; staff schedule changed; staff leave created; tenant provisioned; demo seeded. Audit queries limited to OWNER/MANAGER.

---

## 11. Security Test Plan (e2e)

| # | Scenario | Assertion |
|---|---|---|
| S1 | Cross-tenant read: token of tenant A reads tenant B appointment | 403/404 |
| S2 | Cross-tenant write: token of tenant A mutates tenant B appointment | 403/404 |
| S3 | Manipulated `tenantId` in body | ignored / 400 |
| S4 | Manipulated price in booking body | server price wins (PricingService) |
| S5 | Unauthorized role: RECEPTIONIST calls manager-only route | 403 |
| S6 | STAFF calls another staff's appointment mutation | 403 |
| S7 | Forged booking ownership (wrong phone+reference) | 404 |
| S8 | Duplicate idempotency key booking | one booking, same result twice |
| S9 | Duplicate webhook/callback | one `PaymentAttempt` processed |
| S10 | Tampered JWT signature | 401 |
| S11 | Expired access token | 401 + refresh flow works |
| S12 | Invalid DTO (extra field, wrong enum, long string) | 400 `VALIDATION_ERROR` |

---

## 12. OWASP Coverage Notes (MVP)

- **A01 Broken Access Control** → TenantGuard + RolesGuard + interceptor ✓
- **A02 Cryptographic Failures** → argon2id, HS256 JWT with strong secret, HTTPS everywhere ✓
- **A03 Injection** → parameterized queries only; DOM XSS mitigated by React escaping + no `dangerouslySetInnerHTML` ✓
- **A04 Insecure Design** → threat model above; security e2e suite in CI ✓
- **A05 Security Misconfiguration** → Helmet, CORS allow-list, no debug mode in prod, env-driven ✓
- **A06 Vulnerable Components** → dependency lockfile, `npm audit` in CI, pinned majors reviewed ✓
- **A07 Identification/Auth Failures** → strong hashing, rotation, rate limiting ✓
- **A08 Software/Data Integrity** → idempotency keys, signed webhooks, immutable history ✓
- **A09 Logging/Monitoring** → structured logs, audit log, request IDs ✓
- **A10 SSRF** → no outbound URL fetch on user input in MVP (provider adapters use fixed URLs) ✓

---

## 13. Operational Checklist (Pre-Demo)

- [ ] JWT secret ≥ 32 random bytes from env, and **not** the value in `.env.example`
- [ ] `SUPER_ADMIN_PASSWORD` set to something not published in this repository
- [ ] Demo logins (`*@demo.salon`) absent from production, or `DEMO_OWNER_PASSWORD` deliberately set
- [ ] API boots with `NODE_ENV=production` — `assertProductionSecrets` refuses known-public values
- [ ] PG connection SSL required (prod)
- [ ] CORS allow-list set to actual frontend origins
- [ ] HTTPS on all Render services
- [ ] `.env` absent from git; `.env.example` only
- [ ] Demo seeding script idempotent (safe to re-run)
- [ ] Rate limits on auth/booking/payment configured
- [ ] All security e2e tests (S1–S12) green
- [ ] `npm audit` no high/critical vulnerabilities