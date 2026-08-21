# API.md — REST API Contract (OpenAPI)

**Base:** `https://<api>.onrender.com/api/v1` (local: `http://localhost:3000/api/v1`)
**Auth:** `Authorization: Bearer <accessToken>` (admin) — no token for public customer endpoints · Secure httpOnly cookies for refresh · CSRF token for state-changing requests. Access token presented as cookie in the same-origin admin app; public endpoints need none.

All responses are JSON. Errors use a consistent envelope (see §7). API is documented with OpenAPI (`@nestjs/swagger`) and exposed at `/api/docs`.

---

## 1. Conventions

- **Money:** all amounts in `*Cents` integer (LKR × 100) — see DATABASE.md §5 for the LKR rounding rule.
- **Time:** ISO 8601 UTC for timestamps; `date` fields are `YYYY-MM-DD`; `tz` query param required for availability (default `Asia/Colombo`).
- **Idempotency:** `POST` booking & payment endpoints require header `Idempotency-Key` (UUID). Retrying a request with the same key returns the same result, never a duplicate.
- **Pagination:** list endpoints accept `?limit=1..100&offset=0` (default limit 50). Responses include `{ data, meta: { total, limit, offset } }`.
- **Tenant scoping:** never send `tenantId` from clients; it is derived from the authenticated session (admin) or from the public salon slug (customer endpoints).

---

## 2. Public (no auth) — Customer & Booking

### Public Salon Discovery

| Method | Path | Description |
|---|---|---|
| GET | `/salons` | List active salons (`slug`, name, city/address snippet, services summary) — minimal fields for SSR listing |
| GET | `/salons/:slug` | Salon public profile: hours, services (active only, with price+duration), staff names, advance rule label, cancellation policy summary, closure notices |

### Booking (public)

| Method | Path | Description |
|---|---|---|
| POST | `/salons/:slug/availability` | **The engine query.** Body: `{ serviceIds[], staffId? (null = ANY), date }` → returns `{ slots: [{ staffId, staffName, start, end }] }` sorted by time, earliest first; `staffId=null` returns per-staff earliest slots with earliest highlighted. Server validates: salon open, within booking window, same-day lead time. |
| POST | `/salons/:slug/bookings` | Create booking. Body: `{ serviceIds[], staffId, start, customer: { firstName, lastName, phone, email? }, notes?, advanceMethod? }` + header `Idempotency-Key`. Flow: hold → payment intent (manual) → `201` with `{ bookingReference, holdExpiresAt, paymentIntent: { id, amountCents, status } }`. Appointment is `PENDING_PAYMENT`. |
| POST | `/payments/:intentId/confirm` | Confirm payment (manual provider "succeeds" in MVP). Body: `{ providerData?: { note } }` + `Idempotency-Key` (same key as booking). → `200 { appointment: {...}, bookingReference }`, appointment → `CONFIRMED`. |
| POST | `/payments/:intentId/cancel` | Cancel payment flow → hold released, appointment `EXPIRED` (if any). |
| GET | `/bookings/:reference` | Appointment by reference `ELN-XXXXXX`. Query param `phone` required (customer ownership check). |
| POST | `/bookings/:reference/cancel` | Customer self-service cancel (within 2 h cutoff). Body `{ phone, reason }`. → refund calculation applied (server-side). |
| POST | `/bookings/:reference/reschedule` | Customer reschedule. Body `{ phone, newStaffId?, newStart }`. Re-runs availability; original appointment untouched if new slot fails. |

### Hold semantics

- On `POST /salons/:slug/bookings`, a `SlotHold` is created (10-min TTL) and the slot is invisible to other customers immediately.
- If payment isn't confirmed within TTL, `POST /payments/:intentId/confirm` returns `409 HOLD_EXPIRED`; the customer may rebook (new hold).
- On `409`/`400` from hold insert: `409 SLOT_UNAVAILABLE` with "That slot was just booked by another customer."

---

## 3. Admin (auth required) — Salon Staff

All admin routes require bearer access token; roles enforced per route (see §5 matrix). Tenant derived from token.

### Auth

All auth routes are unauthenticated in the sense that they need no bearer token; `POST /auth/login` creates the session. The refresh token is set as an HttpOnly `AUTH_COOKIE_NAME` cookie (`salon_session`, 7-day maxAge, `sameSite=strict`, `secure` in production) and may also be passed in the body (`refreshToken`). The raw refresh token is never stored server-side — only its SHA-256 hash in `refresh_session.tokenHash`.

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/auth/login` | — | `{ email, password }` → validates credentials, creates a `refresh_session`, sets httpOnly refresh cookie + returns `{ accessToken, user }` where `user = { userId, email, name, tenantId, branchId, roles }` |
| POST | `/auth/refresh` | — | Body `{ refreshToken? }` (or refresh cookie). **Rotates the session:** verifies the current refresh token, revokes it (`revokedAt` + `replacedBySessionId`), issues a new refresh token + access token. Reuse of an already-rotated/revoked token revokes the entire token family (`401 UNAUTHENTICATED`). |
| POST | `/auth/logout` | — | Body `{ refreshToken? }` (or refresh cookie). Revokes the refresh session and clears the cookie. → `{ ok: true }` |

### Dashboard & Schedule

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/dashboard/today` | OWNER, MANAGER, RECEPTIONIST | Today's counts: appointments by status, expected revenue (`sum(totalCents)` of today's active), outstanding balances (`sum(balanceCents)`), checked-in now, waiting (late arrivals), cancellations, no-shows |
| GET | `/schedule/day?date=YYYY-MM-DD` | OWNER, MANAGER, RECEPTIONIST | Day calendar: appointments sorted by start, per staff group, with status + payment status |
| GET | `/schedule/me?date=YYYY-MM-DD` | STAFF | Own appointments for the day |

### Appointments

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/appointments` | OWNER, MANAGER, RECEPTIONIST | **Create** (source `RECEPTIONIST`), with `{ customerId or newCustomer, serviceIds[], staffId, start, source (WALK_IN\|PHONE\|WHATSAPP), notes?, checkInNow? }`. Same engine; appointment `CONFIRMED` immediately (or `CHECKED_IN` if `checkInNow`). |
| GET | `/appointments` | OWNER, MANAGER, RECEPTIONIST, STAFF (own only) | Filters: `?date&status&staffId&customerId&q` |
| GET | `/appointments/:id` | all | Detail incl. services (snapshots), payment, refund, audit trail |
| POST | `/appointments/:id/check-in` | OWNER, MANAGER, RECEPTIONIST | → `CHECKED_IN`; computes `lateMinutes` from grace; screen shows "LATE — X minutes" when X > grace |
| POST | `/appointments/:id/in-service` | OWNER, MANAGER, RECEPTIONIST, STAFF (own) | → `IN_SERVICE` |
| POST | `/appointments/:id/complete` | OWNER, MANAGER, RECEPTIONIST, STAFF (own) | → `COMPLETED` |
| POST | `/appointments/:id/no-show` | OWNER, MANAGER, RECEPTIONIST | → `NO_SHOW` (never destroys payment history) |
| POST | `/appointments/:id/cancel` | OWNER, MANAGER, RECEPTIONIST | Body `{ reason }`; refund calculated per policy. Terminal for this appointment. |
| POST | `/appointments/:id/reschedule` | OWNER, MANAGER, RECEPTIONIST | Body `{ newStart, newStaffId? }` — same engine + swap semantics as customer reschedule |
| POST | `/appointments/:id/reassign` | OWNER, MANAGER, RECEPTIONIST | Body `{ staffId }` — validate new staff + no overlap at the same time window; original stays on failure |
| POST | `/appointments/:id/services` | OWNER, MANAGER, RECEPTIONIST, STAFF (own) | Add service during appointment. Body `{ serviceIds[] }` → appends snapshots, recomputes totals via PricingService; audit trails |
| DELETE | `/appointments/:id/services/:appointmentServiceId` | OWNER, MANAGER, RECEPTIONIST | Mark `REMOVED` (never hard delete). Body `{ reason }`; audit who/when/why |

### Customers

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/customers?q=` | OWNER, MANAGER, RECEPTIONIST | Search by name/phone; returns dupes flagged |
| POST | `/customers` | OWNER, MANAGER, RECEPTIONIST | Create; `409 DUPLICATE_CUSTOMER` with `{ existing: {...} }` when phone/email match (no silent duplicates; explicit merge required) |
| GET | `/customers/:id` | OWNER, MANAGER, RECEPTIONIST | Profile + appointment history |

### Services & Staff

| Method | Path | Roles | Description |
|---|---|---|---|
| GET/POST/PATCH | `/services` | GET: all · write: OWNER, MANAGER | Price/duration changes recorded in AuditLog; never affect existing appointments (snapshots) |
| GET/POST/PATCH | `/staff` | GET: all · write: OWNER, MANAGER | Staff CRUD + `staff-service` assignments (`/staff/:id/services`) |

### Schedules & Leave & Closures

| Method | Path | Roles | Description |
|---|---|---|---|
| GET/POST/PATCH | `/schedules` | read all · write OWNER, MANAGER | Weekly working schedules + breaks (per staff) |
| POST | `/staff/:id/leave` | OWNER, MANAGER | Add leave → response includes `{ affectedAppointments: n }`; UI then offers reassign / reschedule / cancel per appointment (POST `/appointments/:id/reschedule` etc.) |
| POST | `/closures` | OWNER, MANAGER | Salon closure |

### Payments

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/appointments/:id/payments` | OWNER, MANAGER, RECEPTIONIST | Record payment/advance: `{ amountCents, method (CASH\|BANK_TRANSFER\|CARD_CAPTURED), type (ADVANCE\|FULL\|BALANCE) }` + `Idempotency-Key`. Server validates amounts. |
| GET | `/payments?appointmentId&customerId` | OWNER, MANAGER, RECEPTIONIST | Payment list w/ states |
| POST | `/payments/:id/refund` | OWNER, MANAGER | Body `{ amountCents, reason }` → RefundCalculator (policy), create Refund record; external refund documented in notes |

### Settings & Config (tenant)

| Method | Path | Roles | Description |
|---|---|---|---|
| GET/PATCH | `/settings` | read all · write OWNER, MANAGER | `{ advanceRule, advanceValueCents?, cancellationPolicy, bookingWindowDays, sameDayLeadMinutes, noShowGraceMinutes, reminderOffsets }` |

### Notifications

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/notifications?appointmentId&status` | OWNER, MANAGER, RECEPTIONIST | Delivery records |
| POST | `/notifications/:id/retry` | OWNER, MANAGER, RECEPTIONIST | Manual retry |

### Audit

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/audit?entityType&entityId&from&to` | OWNER, MANAGER (read) | Audit log query |

---

### Inquiries

A question somebody asked, holding no slot. Never reaches the availability
engine — see DECISIONS.md §25.

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/inquiries?status&customerId&limit&offset` | OWNER, MANAGER, RECEPTIONIST | Newest first. Defaults to no status filter; the UI opens on `OPEN`. |
| POST | `/inquiries` | OWNER, MANAGER, RECEPTIONIST | `{ customerId \| newCustomer, serviceIds?, source, notes? }`. Services are optional. |
| PATCH | `/inquiries/:id` | OWNER, MANAGER, RECEPTIONIST | `{ status, appointmentId? }`. CONVERTED requires the booking it became, re-checked server-side for tenant **and** customer. |

### Discounts

| Method | Path | Roles | Description |
|---|---|---|---|
| PUT | `/services/:id/discount` | OWNER, MANAGER | Replace the offer whole: `{ type, value, startDate, endDate, label?, windows? }`. Empty `windows` = all day. |
| DELETE | `/services/:id/discount` | OWNER, MANAGER | End the offer. Bookings keep the price they were quoted. |
| PATCH | `/appointments/:id/discount` | OWNER, MANAGER, RECEPTIONIST | `{ type, value, reason? }`; `value: 0` removes it. Capped by `settings.discountCapPercent`, measured as a share of the bill after the salon's own offers. Exceeding it needs OWNER or MANAGER. |

### Invoices

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/appointments/:id/invoices` | OWNER, MANAGER, RECEPTIONIST | Every version, newest first. Exactly one is `ISSUED`. |
| POST | `/appointments/:id/invoices` | OWNER, MANAGER, RECEPTIONIST | Issue, or supersede the live one if the figures have moved. Idempotent on the money — an unchanged bill returns the existing invoice. |
| GET | `/invoices/:id` | OWNER, MANAGER, RECEPTIONIST | The frozen document. |
| POST | `/invoices/:id/send` | OWNER, MANAGER, RECEPTIONIST | `{ email }` — required, not defaulted: the commonest reason to resend is that the first address was wrong. |

Issued automatically when an appointment completes, and emailed only if the
customer has an address. Failure there never undoes the completion.

### Reports

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/reports?from&to` | OWNER, MANAGER | Every panel in one response, for one range. `VIEW_REPORTS`, deliberately narrower than `VIEW_DASHBOARD` — these figures include revenue, a per-stylist league table and named customer spend. |

### Staff logins

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/team` | OWNER | Everyone who can sign in to this salon. |
| POST | `/team` | OWNER | `{ name, email, password, role }`. An existing global account is reused with a new grant rather than refused. |
| PATCH | `/team/:userId` | OWNER | `{ role?, status? }`. Cannot change the owner or yourself; disables rather than deletes. |

### Ratings (public)

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/bookings/:reference/rating` | none (customer) | `{ score, comment? }` on a COMPLETED appointment. One per visit, enforced by a unique index. |

## 4. Super-Admin (platform)

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/super-admin/tenants` | SUPER_ADMIN | Provision tenant + owner user `{ salonName, slug, ownerName, ownerEmail, ownerPassword }` |
| POST | `/super-admin/tenants/:id/demo-seed` | SUPER_ADMIN | One-click demo seed: services, staff, staff–service, schedules, sample customers, sample appointments |
| GET | `/super-admin/tenants` | SUPER_ADMIN | List tenants |

---

## 5. Role → Route Permission Matrix

| Capability | SUPER_ADMIN | OWNER | MANAGER | RECEPTIONIST | STAFF |
|---|---|---|---|---|---|
| Provision tenants / demo seed | ✅ | — | — | — | — |
| Salon settings (advance, cancellation, window) | — | ✅ | ✅ | — | — |
| Services CRUD | — | ✅ | ✅ | — | — |
| Staff CRUD + staff-service + schedules + leave + closures | — | ✅ | ✅ | — | — |
| Create/check-in/in-service/complete/cancel/reschedule/reassign appointments | — | ✅ | ✅ | ✅ | in-service/complete own only |
| Record payments / refunds | — | ✅ | ✅ (refund) | ✅ (record) | — |
| Customer management | — | ✅ | ✅ | ✅ | view own checked-in customer info |
| Dashboard / day schedule | — | ✅ | ✅ | ✅ | own schedule only |
| Audit log | — | ✅ | ✅ | — | — |

All checks enforced server-side (`RolesGuard` + `@Permissions`). Frontend hiding is not security.

---

## 6. OpenAPI & Validation

- `@nestjs/swagger` generates OpenAPI 3 from DTOs; UI at `/api/docs`.
- `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` globally.
- Every DTO is in `packages/shared/src/dto` (class-validator), shared with both Next.js apps for client-side pre-validation (cosmetic only; server re-validates).

---

## 7. Error Envelope

```json
{
  "statusCode": 409,
  "code": "SLOT_UNAVAILABLE",
  "message": "That slot was just booked by another customer. Please choose another time.",
  "details": { "conflictingStaffId": "…" },
  "requestId": "req_…"
}
```

| HTTP | Codes | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR`, `BAD_STATE`, `PAST_SLOT`, `OUTSIDE_BOOKING_WINDOW`, `BELOW_LEAD_TIME`, `INVALID_DATE_RANGE`, `DATE_RANGE_TOO_WIDE`, `DISCOUNT_TOO_LARGE`, `INVALID_TIME_RANGE` | Client error — actionable message |
| 401 | `UNAUTHENTICATED`, `TOKEN_EXPIRED` | Login/refresh |
| 403 | `FORBIDDEN`, `DISCOUNT_CAP_EXCEEDED` | Role lacks permission; the cap message names what the caller may approve and who to ask |
| 404 | `NOT_FOUND` | Salon/appointment/customer missing (also used for cross-tenant access — indistinguishable from 403) |
| 409 | `SLOT_UNAVAILABLE`, `HOLD_EXPIRED`, `DUPLICATE_CUSTOMER`, `VERSION_CONFLICT`, `APPOINTMENT_NOT_CANCELLABLE`, `DISCOUNT_BELOW_PAID`, `TEAM_MEMBER_EXISTS`, `CANNOT_MODIFY_OWNER`, `CANNOT_MODIFY_SELF`, `INQUIRY_CUSTOMER_MISMATCH` | Business conflict — always states what happened + how to proceed |
| 422 | `PAYMENT_CONFLICT` | Payment state machine rejected (e.g. duplicate callback with different data) |
| 429 | `RATE_LIMITED` | Rate limit on auth/booking/payment endpoints |
| 500 | `INTERNAL` | Unexpected — logged with `requestId`; message is generic, never stack traces |

**Guiding rule (spec §40):** errors must explain what happened and the next step — never "Something went wrong."

---

## 8. Versioning & Stability

- Path version: `/api/v1`. Breaking changes → new version + deprecation of old.
- The availability endpoint contract is the most stability-sensitive API in the product; sign changes carefully.