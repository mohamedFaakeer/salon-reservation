# PRD — Salon Reservation SaaS MVP

**Version:** 1.0 (MVP) · **Date:** 2026-08-08 · **Status:** Approved product decisions (see DECISIONS.md)

---

## 1. Product Vision

A multi-tenant SaaS reservation platform for unisex salons in Sri Lanka. Two primary user types:

- **Customer** — finds a salon, views services, books a genuinely available time with a qualified staff member (or "Any Available Staff"), pays an advance when required, receives confirmations/reminders, and manages (reschedule/cancel) their appointment — all **without phoning the salon**.
- **Salon team** — owner/manager/receptionist/staff understand today's schedule in seconds, create bookings for every channel (walk-in, phone, WhatsApp), check customers in, track service progression, and record payments.

### Core product principle — ONE AVAILABILITY ENGINE

Every booking source (online, receptionist, walk-in, phone, WhatsApp) uses the **same server-side availability engine** and produces the **same Appointment entity**. Availability is never computed on the frontend; it is always validated server-side inside database transactions.

---

## 2. Target Users & Core Jobs

| Persona | Job to be done | Success metric |
|---|---|---|
| Customer | Book a salon appointment in under a minute, without calling | Completes booking ≤ 60 s |
| Receptionist | Understand today's schedule immediately; create/change a booking in seconds | Creates a booking ≤ 15 s |
| Staff | See exactly who they are serving, for what service, and when they are free | Own schedule always accurate |
| Owner/Manager | Know what is happening in the salon without spreadsheets, notebooks, phone calls, and WhatsApp | Day-at-a-glance dashboard |

If a feature does not materially improve one of these jobs, it is **out of MVP scope** (see §5).

---

## 3. Functional Requirements

### 3.1 Customer Experience (mobile-first)

1. Browse/search salons.
2. View salon profile (address, hours, services, staff, cancellation policy, advance rules).
3. Select one or more services; system computes total duration + total price.
4. Select preferred staff member **or** "Any Available Staff".
5. Select a date (within booking window — default 30 days; same-day allowed with 2 h lead time).
6. See **only genuinely available time slots** (per staff, labelled with staff name; earliest slot highlighted for "Any Available Staff").
7. Booking summary: services, durations, staff, date/time, price, advance requirement, cancellation policy.
8. Provide name + phone (+ optional email) — **no account, no password, no OTP** (Decision Q2).
9. Confirm booking.
10. If an advance is required: slot is held (10 min) while payment is processed (record-only in MVP — Decision Q3).
11. Receive confirmation with a **booking reference code** (e.g. `ELN-7F3K2`).
12. Manage appointment later via phone + booking reference: view details, reschedule (within rules), cancel (within rules).

Customer actions that must be possible without registration: browse salons, view services/prices/durations, view availability.

### 3.2 Salon Staff Experience (desktop/tablet-first)

- **Today's schedule:** list view + calendar view; status colours; who/what/when at a glance.
- **Upcoming appointments** and **own schedule** for STAFF role.
- **Create booking** for walk-in / phone / WhatsApp / in-person (same engine as online).
- **Confirm / reschedule / cancel** appointments (with cancellation/refund calculation).
- **Check in**, mark **in service**, mark **completed**.
- See payment status; **record payment** (cash/bank/card-captured).
- **Customer management:** search by name/phone; warn on duplicate; view customer history.
- **Manage services** (name, duration, price, category, active) — price/duration changes never affect existing bookings (snapshots).
- **Manage staff** and **staff–service assignments** (qualifications).
- **Manage working hours, breaks, leave, closures.**
- **Configure advance-payment rules** (NONE / FIXED / PERCENTAGE / FULL) and **cancellation policy**.
- **Late arrival handling:** grace period (default 15 min), show "LATE — 20 minutes", allow continue / shorten / reschedule / cancel. Never auto-destroy the appointment.
- **Basic dashboard:** today's numbers, quick actions (new appointment, walk-in, check in, reschedule, cancel, record payment).

### 3.3 Availability Engine (THE critical module)

Inputs considered (all server-side):

1. Salon working hours
2. Staff working hours (per week-day) + breaks
3. Staff leave
4. Staff service qualifications (`StaffService`)
5. Existing appointments (confirmed/active states)
6. Temporary slot holds (10-min TTL)
7. Multiple services → summed duration
8. Salon closures/holidays
9. Booking window (30 days) + same-day lead time (2 h)
10. Cancellation/reschedule rules

**"Any Available Staff":** aggregate earliest valid slot across all staff qualified for the full service set. Auto-assign that staff at booking (Decision Q6).

**Double-booking prevention (concurrency):** enforced by PostgreSQL **GiST exclusion constraints** over time ranges per staff for both Appointments and SlotHolds, plus transactions. Two simultaneous bookings of the same staff/time can never both succeed. (Full detail in DATABASE.md.)

### 3.4 Appointment Model

Statuses: `PENDING_PAYMENT → CONFIRMED → CHECKED_IN → IN_SERVICE → COMPLETED`; terminal: `CANCELLED`, `NO_SHOW`, `EXPIRED`, `RESCHEDULED` (RESCHEDULED is a status applied to the superseded appointment; a new appointment is created for the new slot).

Sources: `ONLINE`, `RECEPTIONIST`, `WALK_IN`, `PHONE`, `WHATSAPP`.

Fields per spec §7, plus: `version` (optimistic lock), `holdExpiresAt`, `checkedInAt`, `lateMinutes`, `cancellationReason`, `rescheduleDate` metadata.

**Immutability rule:** `AppointmentService` rows snapshot service name/price/duration at booking. Service price or duration changes never alter existing appointments. Adding services during an appointment appends a new snapshot with actor audit; removing marks `REMOVED` with who/when/why — never hard-deleted.

### 3.5 Payments & Advances

**Advance configuration (per tenant):** `NO_ADVANCE | FIXED_AMOUNT | PERCENTAGE | FULL_PAYMENT`.

**Record-only (Decision Q3):** staff records advance received (method: CASH / BANK_TRANSFER / CARD_CAPTURED) or full payment. A `PaymentProvider` abstraction exists with a `ManualProvider` (demo default) and a `PayHereProvider` adapter stub behind a feature flag.

**State machines:**

- Payment: `PENDING → SUCCESS | FAILED | REQUIRES_RECONCILIATION`; refunds: `REFUNDED | PARTIALLY_REFUNDED`.
- Appointment payment status is a separate field/derivation from appointment status.

**Idempotency:** every payment carries a unique `idempotencyKey` (DB-unique). Duplicate callbacks/retries can never create duplicate payments.

**Edge cases that must be handled (spec §15):** success-after-create-failure, delayed callback, browser close mid-payment, duplicated payment, duplicate callback, payment expiry, slot expiry while processing, success after slot expired, refund initiated, refund failure — all implemented and covered by tests against the simulated provider.

### 3.6 Temporary Slot Hold

- On checkout start: create `SlotHold` (status `HELD`, TTL 10 min).
- Payment success → atomic swap to `CONFIRMED` Appointment (re-validating the exclusion constraint).
- Payment fail/expire → release hold.
- Expired holds are released by a scheduled job; abandoned slots never remain blocked forever.

### 3.7 Cancellation & Rescheduling

Defaults (per-tenant configurable): self-service cutoff **2 h before start**; refund **100% ≥24 h**, **0% <24 h**, **0% no-show**. Reschedule re-runs availability for the new slot in a transaction; on failure the **original appointment is unchanged**.

### 3.8 Walk-in / Phone / WhatsApp Booking

Receptionist: new guest → search/create customer (duplicate warning) → pick services → pick qualified staff → pick time (engine) → create appointment (`source = WALK_IN | PHONE | WHATSAPP`) → check in if appropriate. Identical appearance in the calendar.

### 3.9 Staff Leave Impact

Adding leave finds affected future appointments ("7 appointments affected"), presents them for reassign / reschedule / cancel, and triggers customer notifications. **Nothing moves silently.**

### 3.10 Notifications (Decision Q4)

Channels: `console/log` + `email` active in MVP; `sms`/`whatsapp` interfaces defined for real adapters later. Events: booking confirmation (includes booking reference), payment confirmation, reminder (24 h before, optional 2 h), cancellation confirmation, reschedule confirmation.

- Notification failure **never** cancels or alters an appointment.
- Per-appointment, per-channel delivery record: `SENT / FAILED / PENDING`, `retryCount`, `nextRetryAt`, manual retry supported.

### 3.11 Audit Log

Auditable actions (spec §36): appointment created/cancelled/rescheduled; payment recorded; refund initiated; service price changed; staff schedule changed; staff leave created; customer made; etc. Record: user, action, entity, entityId, timestamp, metadata JSON.

### 3.12 Roles & Permissions

- `SUPER_ADMIN` — platform provisioning (creates tenants + demo seeds; Decision Q7).
- `OWNER` — full access within tenant.
- `MANAGER` — operational management; leave/schedule management (Decision Q8).
- `RECEPTIONIST` — appointments, customers, payments.
- `STAFF` — own appointments/schedule + relevant customer info.

Backend enforces permissions; frontend hiding is never the security boundary.

---

## 4. Non-Functional Requirements

- **Multi-tenancy:** row-level tenant scoping; tenant derived from session/JWT; cross-tenant access impossible (tests enforce).
- **Concurrency:** race conditions (double book, simultaneous reschedule, duplicate callbacks/retries) are first-class scenarios with DB-level guarantees.
- **Security:** secure auth, server-side authorization, validation, rate limiting on auth/booking/payment, no secrets client-side, env-only secrets.
- **Quality:** TypeScript strict; no `any` without justification; single source of truth for availability, pricing, and refund logic; lint/format/test/build all green per feature.
- **Performance:** availability queries indexed (staffId + tstzrange, tenantId + date).
- **UX:** customer mobile-first; staff desktop/tablet-first; consistent components; empty/loading/error states; confirmation dialogs for destructive actions; no unnecessary animations.

---

## 5. Out of Scope (MVP Hard Boundary)

Payroll · full accounting · inventory · purchasing · advanced CRM · marketing automation · loyalty · complex memberships · gift cards · AI recommendations · advanced analytics · multi-country tax · complex equipment scheduling · marketplace commissions · staff payroll · full POS · full ERP · native mobile apps · real payment gateway (stub only) · real SMS/WhatsApp delivery · self-serve salon signup · staff self-service leave requests.

---

## 6. Success Criteria

1. A customer can book a real available slot in under a minute without calling.
2. Two concurrent bookings for the same slot can never both succeed (test-proven).
3. A receptionist can create/change a booking in seconds.
4. Historical appointments are unaffected by later price/duration changes.
5. Every salon (tenant) is fully isolated.
6. Everything runs on free tiers (Render + Neon) for client demos.