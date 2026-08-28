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
| POST | `/payments/:intentId/confirm` | Confirm payment (manual provider "succeeds" in MVP). Body: `{ providerData?: { note }, giftCardCode?, packageCode? }` + `Idempotency-Key` (same key as booking). → `200 { appointment: {...}, bookingReference }`, appointment → `CONFIRMED`. When `giftCardCode` is present, the server redeems `min(card balance, advanceRequiredCents)` and creates a `GIFT_CARD` payment for that amount first; when `packageCode` is also/instead present, it then redeems `min(unitPriceCentsSnapshot, whatever of the advance is still due)` as a `PACKAGE_CREDIT` payment, refusing outright (`409 PACKAGE_SERVICE_MISMATCH`) if none of the booked services match the package's own service — either falls back to the manual `ONLINE` placeholder for any remainder. The client never sends an amount, only the code(s). |
| POST | `/payments/:intentId/cancel` | Cancel payment flow → hold released, appointment `EXPIRED` (if any). |
| POST | `/payments/:intentId/gift-card-preview` | Roles: none (customer). A pure read, no mutation. Body `{ code }` → `200 { remainingBalanceCents, expiresAt }` or `404 GIFT_CARD_NOT_FOUND` / `409 GIFT_CARD_VOID` / `409 GIFT_CARD_ALREADY_REDEEMED` / `410 GIFT_CARD_EXPIRED`. Lets the customer see a card's balance before deciding to use it on confirm. Rate-limited tighter than `payment` (10/min per IP) — a gift-card code is a bearer credential with no second factor, unlike a booking reference (SECURITY.md). |
| POST | `/payments/:intentId/package-preview` | Roles: none (customer). A pure read, no mutation. Body `{ code }` → `200 { remainingUses, unitPriceCentsSnapshot, serviceId, serviceNameSnapshot, expiresAt }` or `404 SERVICE_PACKAGE_NOT_FOUND` / `409 SERVICE_PACKAGE_VOID` / `409 SERVICE_PACKAGE_DEPLETED` / `410 SERVICE_PACKAGE_EXPIRED`. Same bearer-credential rate limit as the gift-card preview (10/min per IP). |
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
| PATCH | `/customers/:id` | OWNER, MANAGER, RECEPTIONIST | Currently just the marketing flag, not a general customer edit. Body `{ marketingOptOut? }` — excludes/re-includes this customer from win-back/marketing sends; never affects transactional notifications. |

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
| POST | `/appointments/:id/payments` | OWNER, MANAGER, RECEPTIONIST | Record payment/advance: `{ amountCents, method (CASH\|BANK_TRANSFER\|CARD_CAPTURED\|GIFT_CARD\|PACKAGE_CREDIT), type (ADVANCE\|FULL\|BALANCE), giftCardCode?, packageCode? }` + `Idempotency-Key`. Server validates amounts. `giftCardCode` is required when `method` is `GIFT_CARD` — the exact `amountCents` requested is redeemed from that card, refused outright (`409 GIFT_CARD_INSUFFICIENT_BALANCE`) if it can't cover it, never silently short-applied. `packageCode` is required when `method` is `PACKAGE_CREDIT` — one use is consumed and `min(unitPriceCentsSnapshot, amountCents)` is what actually lands on the row (which can be less than requested, unlike a gift card); refused with `409 PACKAGE_SERVICE_MISMATCH` if the appointment has no active line for the package's own service. |
| GET | `/payments?appointmentId&customerId` | OWNER, MANAGER, RECEPTIONIST | Payment list w/ states |
| POST | `/payments/:id/refund` | OWNER, MANAGER | Body `{ amountCents, reason }` → RefundCalculator (policy), create Refund record; external refund documented in notes |

### Gift cards

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/gift-cards` | OWNER, MANAGER | Issue a card. Body `{ amountCents, expiresAt, purchaser: { firstName, lastName, phone, email? }, recipientName?, recipientPhone?, recipientEmail?, message? (≤120 chars), paymentMethod (CASH\|BANK_TRANSFER\|CARD_CAPTURED) }` + `Idempotency-Key`. Purchaser is found-or-created the same way a booking's inline customer is. Always records a real payment for the sale; idempotent the same way an appointment payment is. |
| GET | `/gift-cards?q=` | OWNER, MANAGER | List, optionally matching code/purchaser name/phone. |
| GET | `/gift-cards/:id` | OWNER, MANAGER | One card, including its live-computed `expired` flag (never a stored status). |
| PATCH | `/gift-cards/:id/void` | OWNER, MANAGER | Body `{ reason }` (≥3 chars). Refuses only an already-void card; a partially-redeemed card can still be voided as a correction. |

A card's redemption history is `Payment` rows where `giftCardId` matches —
no separate endpoint; `GET /payments?...` already lists them.

### Service packages

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/service-packages` | OWNER, MANAGER | Issue a package. Body `{ serviceId, totalUses (≥2), purchasePriceCents, expiresAt, customer: { firstName, lastName, phone, email? }, paymentMethod (CASH\|BANK_TRANSFER\|CARD_CAPTURED) }` + `Idempotency-Key`. `serviceId`'s current name/price are snapshotted at issue time. `customer` is found-or-created the same way a booking's inline customer is. Always records a real payment for the sale; idempotent the same way an appointment payment is. |
| GET | `/service-packages?q=` | OWNER, MANAGER | List, optionally matching code/customer name/phone. |
| GET | `/service-packages/:id` | OWNER, MANAGER | One package, including its live-computed `expired` flag (never a stored status). |
| PATCH | `/service-packages/:id/void` | OWNER, MANAGER | Body `{ reason }` (≥3 chars). Refuses only an already-void package; a partially-used package can still be voided as a correction. |

A package's redemption history is `Payment` rows where `packageRedemptionId`
matches — `GET /payments?packageRedemptionId=...`, same as gift cards.

### Reports actions

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/reports/lapsed-customers/winback` | OWNER, MANAGER (`SEND_MARKETING_CAMPAIGN`, gated behind the Reports entitlement same as the panel it reads from) | Turns the "Worth a call" report's lapsed-customer list into a sent message. Body `{ customerIds[] (1–25), message (10–500 chars, `{firstName}`/`{salonName}` tokens substituted server-side per recipient), giftCardCode? }`. Every recipient is re-loaded from the database — never trusted from the request beyond their id. Skips (without erroring the batch) any customer with `marketingOptOut = true`, and any customer already sent a `WINBACK_OFFER` within the last 14 days. → `200 { sent: string[], skippedOptedOut: string[], skippedRecentlyContacted: string[] }`. Rate-limited to 5/min per IP — an accidental-repeat-send guard, not an everyday-use ceiling. |

### Settings & Config (tenant)

| Method | Path | Roles | Description |
|---|---|---|---|
| GET/PATCH | `/settings` | read all · write OWNER, MANAGER | `{ advanceRule, advanceValueCents?, cancellationPolicy, bookingWindowDays, sameDayLeadMinutes, noShowGraceMinutes, reminderOffsets }` |
| POST | `/tenant/me/logo` | OWNER, MANAGER | `multipart/form-data`, field `file`. PNG/JPEG/WebP only (checked by real content, not the client's claimed type), ≤1MB, 200–4000px per side, within a 2:1 aspect ratio — checked server-side in that order, before anything reaches Cloudinary. → the updated settings, `{ ..., logoUrl }`. Errors: `LOGO_FILE_TOO_LARGE`, `LOGO_INVALID_FILE_TYPE`, `LOGO_DIMENSIONS_OUT_OF_RANGE`, `LOGO_ASPECT_RATIO_INVALID`, `LOGO_UPLOAD_NOT_CONFIGURED` (503, no Cloudinary env vars), `LOGO_UPLOAD_FAILED` (502). |
| DELETE | `/tenant/me/logo` | OWNER, MANAGER | Clears `logoUrl`. No Cloudinary-side delete (DECISIONS.md §35.1). |

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

### Attendance

Two audiences share these routes: the front desk punching whoever walks in
with no login of their own, and a stylist punching themselves from their own
phone. Both call the same engine (DECISIONS.md §33.1); the service decides
what a caller may actually name — omitting `staffId` always means "me".

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/attendance/check-in` | RECORD_ATTENDANCE, RECORD_OWN_ATTENDANCE | `{ staffId? }` — server clock, never the client's. `409 ALREADY_CHECKED_IN` on a duplicate tap. |
| POST | `/attendance/check-out` | RECORD_ATTENDANCE, RECORD_OWN_ATTENDANCE | `{ staffId? }` — closes the most recent open check-in. `409 STALE_CHECK_IN` past 18 hours open, pointing at the correction flow instead. |
| GET | `/attendance/board?date` | RECORD_ATTENDANCE, VIEW_ATTENDANCE | One day, everyone — the front desk's board. Defaults to today. |
| GET | `/attendance?from&to&staffId` | VIEW_ATTENDANCE | A range, for one person or everyone — OWNER/MANAGER only. |
| GET | `/attendance/me?from&to` | VIEW_OWN_SCHEDULE, VIEW_ATTENDANCE | The caller's own history. |
| GET | `/attendance/staff/:staffId?from&to` | VIEW_ATTENDANCE | One person's history, for a manager drilling into a stylist's card. |
| POST | `/attendance/edit-requests` | RECORD_ATTENDANCE, RECORD_OWN_ATTENDANCE | File a correction: `{ staffId?, workDate, requestedCheckInAt?, requestedCheckOutAt?, reason }`. A reason is required — a correction with none is a guess. |
| GET | `/attendance/edit-requests?status&staffId` | APPROVE_ATTENDANCE_EDIT | The manager's queue. |
| GET | `/attendance/edit-requests/me` | RECORD_OWN_ATTENDANCE | The caller's own filed requests and their outcomes. |
| PATCH | `/attendance/edit-requests/:id` | APPROVE_ATTENDANCE_EDIT | `{ status: APPROVED\|REJECTED, note? }`. Approving creates the `AttendanceDay` if none existed, or updates it, recomputing lateness against the *current* rota. |
| DELETE | `/attendance/edit-requests/:id` | RECORD_OWN_ATTENDANCE | Withdraw a still-pending request. |

### Incentives

Configuring plans and running payouts is payroll — `MANAGE_INCENTIVES`,
OWNER/MANAGER only. A stylist reading their own figure is not, and always
resolves against their own linked `staff` row server-side; any `staffId` on a
`me` route is ignored (DECISIONS.md §33.9).

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/incentive-plans` | MANAGE_INCENTIVES | Every plan configured for this salon. |
| GET | `/incentive-plans/preview?from&to&staffId?` | MANAGE_INCENTIVES | The live, unsaved figure a payout would total right now. |
| GET | `/incentive-plans/me/preview?from&to` | VIEW_OWN_INCENTIVE_EARNINGS | The caller's own live estimate for the range, or `null` with no plan assigned. |
| GET | `/incentive-plans/:id` | MANAGE_INCENTIVES | One plan, with its service-rate overrides. |
| POST | `/incentive-plans` | MANAGE_INCENTIVES | `{ name, baseCommissionPercent?, perJobAmountCents?, monthlyTargetCents?, tierBonusPercent?, serviceRates? }`. At least one component required. |
| PUT | `/incentive-plans/:id` | MANAGE_INCENTIVES | Replaces the plan whole — a partial patch would invite states like "target set, bonus rate silently cleared" that the database's own pairing check would then have to catch. |
| GET | `/incentive-payouts?staffId&status` | MANAGE_INCENTIVES | Payout history, any staff member. |
| GET | `/incentive-payouts/me` | VIEW_OWN_INCENTIVE_EARNINGS | The caller's own payouts — FINALISED and PAID, never a voided correction. |
| GET | `/incentive-payouts/:id` | MANAGE_INCENTIVES | One payout, with its frozen `snapshot`. |
| POST | `/incentive-payouts` | MANAGE_INCENTIVES | `{ staffId, periodStart, periodEnd }`. Idempotent on the money (DECISIONS.md §33.8): unchanged figure returns the existing payout; a moved figure voids the old row and inserts a new one. |
| PATCH | `/incentive-payouts/:id/paid` | MANAGE_INCENTIVES | Stamps `paidAt`/`paidBy`. `409 PAYOUT_VOID` / `409 PAYOUT_ALREADY_PAID` guard invalid transitions. |
| PATCH | `/incentive-payouts/:id/void` | MANAGE_INCENTIVES | `{ reason }` — a manual correction, without reissuing. |

`staff.incentivePlanId` (nullable, `SET NULL` on plan deletion) assigns a plan
via `PATCH /staff/:id`, validated against the caller's own tenant.

### Ratings (public)

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/bookings/:reference/rating` | none (customer) | `{ score, comment? }` on a COMPLETED appointment. One per visit, enforced by a unique index. |

## 4. Super-Admin (platform)

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/super-admin/tenants` | SUPER_ADMIN | Provision tenant + owner user `{ salonName, slug, ownerName, ownerEmail, ownerPassword, tier? }` — `tier` defaults to `PRO` |
| POST | `/super-admin/tenants/:id/demo-seed` | SUPER_ADMIN | One-click demo seed: services, staff, staff–service, schedules, sample customers, sample appointments |
| GET | `/super-admin/tenants` | SUPER_ADMIN | List tenants — each row also carries `tier`, live `bookingsToday`, and `overBookingLimit` |
| GET | `/super-admin/tenants/:id/entitlements` | SUPER_ADMIN | This tenant's tier, raw overrides, and the resolved effective modules/report panels/limits |
| PATCH | `/super-admin/tenants/:id/entitlements` | SUPER_ADMIN | Whole-replace `{ tier, moduleOverrides?, reportPanelOverrides?, limitOverrides? }` — see DECISIONS.md §34 |
| PATCH | `/super-admin/tenants/:id/customer-visibility` | SUPER_ADMIN | Activate/deactivate a salon's customer-facing discovery/booking `{ customerBookingEnabled }` — never affects staff/admin login (that's `status` alone); see DECISIONS.md §48 |

Attendance, Incentives, Reports, the audit log and Invoices are each gated by
the calling tenant's entitlements (`@RequiresModule`) in addition to their
existing role permission below — a 403 `MODULE_NOT_ENABLED` means the salon's
plan doesn't include it, not that the caller lacks the role.

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
| Punch attendance | — | ✅ | ✅ | ✅ (record only) | own only |
| View attendance / decide corrections | — | ✅ | ✅ | — | own history only |
| Configure incentive plans / run payouts | — | ✅ | ✅ | — | — |
| View own incentive earnings | — | — | — | — | ✅ |

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