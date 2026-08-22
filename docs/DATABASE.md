# DATABASE.md — Data Model & Migrations

**Engine:** PostgreSQL 17 (Neon free tier / Docker `postgres:17-alpine`) · **ORM:** TypeORM 1.1.0 · **Extension:** `btree_gist` (ships with Postgres contrib — free everywhere)

---

## 1. Principles

1. **Historical records are immutable.** `AppointmentService` rows snapshot service name/price/duration at booking. Never reconstruct history from current `Service` rows.
2. **Double-booking is prevented by the database** — GiST exclusion constraints on time ranges per staff, covering both appointments and temporary holds. No amount of app-level checking can override the DB.
3. **Tenant isolation at the data layer.** Every tenant-owned table carries `tenantId`; all queries are scoped by the tenant-scoping interceptor.
4. **Payments are idempotent** — unique `idempotencyKey` on every payment.
5. **No hard deletes on business records.** Statuses (`CANCELLED`, `NO_SHOW`, `EXPIRED`, `RESCHEDULED`, `REMOVED`) preserve history.

---

## 2. Entity Catalog

### 2.1 Platform / Identity

**tenant** — `id (uuid PK)`, `slug (unique, used in public URL)`, `name`, `status` (`ACTIVE|SUSPENDED|TRIAL`), `currency` (default `LKR`, always LKR in MVP), `timezone` (default `Asia/Colombo`), `settings` (JSONB: advance rule, cancellation policy, booking window days, same-day lead minutes, no-show grace minutes, reminder offsets), `entitlements` (JSONB: `tier` LITE/PRO plus per-module, per-report-panel and numeric-limit overrides — SUPER_ADMIN-only to write, deliberately a separate column from `settings`; see DECISIONS.md §34), `createdAt`, `updatedAt`.

**branch** — `id (uuid PK)`, `tenantId (FK, NOT NULL)`, `name`, `address`, `phone`, `active`. MVP uses a single default branch per tenant; present in schema to avoid later table surgery.

**user** — `id (uuid PK)`, `email (unique, NOT NULL)`, `passwordHash (NOT NULL)`, `name`, `status`, `lastLoginAt`, `createdAt`, `updatedAt`.

**user_tenant_role** — `userId (FK)`, `tenantId (FK)`, `role` (`OWNER|MANAGER|RECEPTIONIST|STAFF`), `branchId (FK, nullable)`; composite PK `(userId, tenantId)`. Supports one user belonging to multiple tenants in the future; MVP uses one tenant per user.

**refresh_session** — `id (uuid PK)`, `userId (FK → user, ON DELETE CASCADE)`, `tokenHash (varchar(64), UNIQUE — SHA-256 of the opaque refresh token; the raw token is never stored)`, `expiresAt (timestamptz)`, `revokedAt (timestamptz, nullable)`, `replacedBySessionId (varchar(64), nullable — session id (uuid-as-string) of the rotated-in session, set on rotation)`, `ipAddress (varchar(64), nullable)`, `userAgent (varchar(255), nullable)`, `createdAt (timestamptz)`. Indexes on `(userId)` and unique `(tokenHash)`. Rotation marks the old row `revokedAt` + `replacedBySessionId`; reuse of a revoked token revokes the whole token family via `UPDATE ... SET revokedAt = now() WHERE userId = ? AND revokedAt IS NULL` (session family cascade) — see DECISIONS.md §Token sessions. **Note:** `replacedBySessionId` is `varchar(64)` (not `uuid`) so the migration matches the `SessionService` rotation write path; the entity column in `apps/api/src/entities/refresh-session.entity.ts` reflects this.

**role** (seed data, not runtime-managed in MVP) — codes `OWNER`, `MANAGER`, `RECEPTIONIST`, `STAFF`, `SUPER_ADMIN`. Permission matrix seeded at migration; enforced by `RolesGuard`.

### 2.2 Salon Operations

**service** — `id (uuid PK)`, `tenantId (FK)`, `branchId (FK, nullable)`, `name`, `description`, `category`, `durationMin (int, >0)`, `priceCents (integer — LKR in cents, see §5)`, `active (bool)`, `tenantIndex`. **No `deletedAt`** — inactive instead.

**staff** — `id (uuid PK)`, `tenantId (FK)`, `branchId (FK, nullable)`, `userId (FK, nullable — staff may or may not have login)`, `name`, `phone`, `specialties` (text), `active (bool)`, `color` (calendar accent), `createdAt`, `updatedAt`.

**staff_service** — composite PK `(staffId, serviceId)`, `tenantId (FK mirror)`. Only staff with a row here can be matched to that service. `serviceId` FK → `service.id`.

**working_schedule** — `id (uuid PK)`, `staffId (FK)`, `tenantId (FK)`, `dayOfWeek (0=Mon..6=Sun)`, `startMin (int, minutes since midnight)`, `endMin (int)`, `breakStartMin (int, nullable)`, `breakEndMin (int, nullable)`. Weekly-recurring. A row's absence = day off. Unique `(staffId, dayOfWeek)`.

**staff_leave** — `id (uuid PK)`, `staffId (FK)`, `tenantId (FK)`, `startDate (date)`, `endDate (date)`, `reason`, `createdBy (FK user)`, `createdAt`. **Note:** leave affects future appointments; adding leave triggers the "N appointments affected" flow (§24, PRD §3.9). Overlapping leave rows are allowed but the availability engine treats any overlap as unavailable.

**closure** — `id (uuid PK)`, `tenantId (FK)`, `startDate (date)`, `endDate (date)`, `name` (e.g. "Poya day"), `createdAt`. Salon-wide closure.

### 2.3 Customers

**customer** — `id (uuid PK)`, `tenantId (FK)`, `firstName`, `lastName`, `phone (normalized, NOT NULL)`, `email (nullable)`, `notes`, `createdAt`, `updatedAt`. Unique index `(tenantId, phone)` AND `(tenantId, email)` (partial: `WHERE email IS NOT NULL`). Duplicate warning on create; no silent merges (spec §21).

### 2.4 Appointments (the heart)

**appointment** — `id (uuid PK)`, `tenantId (FK)`, `branchId (FK, nullable)`, `customerId (FK)`, `staffId (FK)`, `appointmentDate (date)`, `startTime (timestamptz)`, `endTime (timestamptz)`, `status` (`PENDING_PAYMENT|CONFIRMED|CHECKED_IN|IN_SERVICE|COMPLETED|CANCELLED|NO_SHOW|RESCHEDULED|EXPIRED`), `source` (`ONLINE|RECEPTIONIST|WALK_IN|PHONE|WHATSAPP`), `subtotalCents`, `discountCents`, `totalCents`, `advanceRequiredCents`, `advancePaidCents`, `balanceCents`, `notes`, `bookingReference (unique, e.g. ELN-7F3K2)`, `holdExpiresAt (nullable)`, `checkedInAt (nullable)`, `inServiceAt (nullable)`, `completedAt (nullable)`, `lateMinutes (int, default 0)`, `cancellationReason`, `cancelledAt`, `rescheduledFromId (FK self, nullable — new appointment created on reschedule)`, `version (int, optimistic lock)`, `createdAt`, `updatedAt`.

**appointment_service** — `id (uuid PK)`, `appointmentId (FK, CASCADE on appointment — but status removed, never hard-deleted)`, `serviceId (FK, nullable after delete — but services are never hard-deleted; kept for reference)`, `nameSnapshot (service name at booking)`, `durationMinSnapshot`, `priceCentsSnapshot`, `status` (`ACTIVE|REMOVED`), `removedById (FK user, nullable)`, `removedAt`, `removedReason`, `createdAt`. **Snapshot fields are the immutable history** (spec §38).

**slot_hold** — `id (uuid PK)`, `tenantId (FK)`, `staffId (FK)`, `startTime (timestamptz)`, `endTime (timestamptz)`, `status` (`HELD|CONSUMED|RELEASED|EXPIRED`), `expiresAt (timestamptz, = start − TTL if hold starts at booking)`, `sessionKey (idempotency token for the same customer retry)`, `createdAt`.

### 2.5 Payments & refunds

**payment** — `id (uuid PK)`, `tenantId (FK)`, `appointmentId (FK, nullable — filled on success)`, `customerId (FK)`, `amountCents`, `method` (`CASH|BANK_TRANSFER|CARD_CAPTURED|ONLINE|GATEWAY`), `state` (`PENDING|SUCCESS|FAILED|REFUNDED|PARTIALLY_REFUNDED|REQUIRES_RECONCILIATION`), `type` (`ADVANCE|FULL|BALANCE`), `idempotencyKey (uuid, UNIQUE NOT NULL)`, `provider` (`MANUAL|PAYHERE`), `providerPaymentRef (nullable)`, `recordedById (FK user)`, `recordedAt`, `createdAt`, `updatedAt`. **Unique `(idempotencyKey)`** enforces idempotency.

**payment_attempt** — `id (uuid PK)`, `paymentId (FK)`, `provider`, `providerEventHandler`, `providerEventId (unique per provider+event)`, `payload (JSONB)`, `status` (`RECEIVED|PROCESSED|FAILED`), `createdAt`. Unique `(provider, providerEventId)` absorbs duplicate callbacks.

**refund** — `id (uuid PK)`, `paymentId (FK)`, `amountCents`, `reason`, `state` (`PENDING|SUCCEEDED|FAILED`), `providerRef (nullable)`, `initiatedById (FK user)`, `createdAt`.

### 2.6 Notifications & audit

**notification** — `id (uuid PK)`, `tenantId (FK)`, `appointmentId (FK, nullable)`, `customerId (FK, nullable)`, `type` (`BOOKING_CONFIRMATION|PAYMENT_CONFIRMATION|REMINDER_24H|REMINDER_2H|CANCELLATION_CONFIRMATION|RESCHEDULE_CONFIRMATION|NO_SHOW|LATE_ARRIVAL`), `channel` (`CONSOLE|EMAIL|SMS|WHATSAPP`), `recipient`, `status` (`PENDING|SENT|FAILED`), `retryCount (int, 0)`, `nextRetryAt`, `lastError`, `providerMessageId (nullable)`, `createdAt`, `updatedAt`. Indexed `(status, nextRetryAt)` for the retry scheduler.

**audit_log** — `id (uuid PK)`, `tenantId (FK, nullable for platform-level)`, `actorUserId (FK, nullable)`, `action`, `entityType`, `entityId`, `metadata (JSONB)`, `ipAddress`, `userAgent`, `createdAt`.

### 2.7 Offers & discounts

**service_discount** — `id (uuid PK)`, `tenantId (FK)`, `serviceId (FK)`, `type`
(`FIXED|PERCENT`), `value` (cents when FIXED, whole percent when PERCENT),
`startDate (date)`, `endDate (date)`, `label (nullable)`, `active`, `createdAt`,
`updatedAt`. **Unique `(serviceId)`** — at most one standing offer per service;
overlapping offers would need precedence rules nobody asked for, and "which one
applied?" is not a question a receipt should answer ambiguously.
`CHK_service_discount_value` caps a percentage at 100;
`CHK_service_discount_dates` keeps the range the right way round.

**service_discount_window** — `id (uuid PK)`, `discountId (FK, CASCADE)`,
`dayOfWeek (0=Mon..6=Sun)`, `startMin`, `endMin`. No rows at all means "all day,
every day inside the date range" — the common case, and therefore the one that
needs no configuration. `endMin` is exclusive and may be 1440, unlike
`working_schedule`'s: "until midnight" is a real thing to say about an offer.

An offer is evaluated against the **appointment's start time**, never the moment
of booking (see `ServiceDiscountService`). Both halves of the check are made in
Colombo local time.

The desk's own discount lives on the appointment rather than in its own table:
`billDiscountType`, `billDiscountValue`, `billDiscountCents`,
`billDiscountReason`. `appointment.discountCents` is the sum of the service
offers and this. `CHK_appointment_bill_discount` caps it at the subtotal and
forbids a recorded type without its amount (half a discount is not a state
anything can render); `CHK_appointment_total_not_negative` is the backstop that
stops any combination producing a bill that owes the customer money.

### 2.8 Inquiries

**inquiry** — `id (uuid PK)`, `tenantId (FK)`, `customerId (FK)`, `source`
(`WALK_IN|PHONE|WHATSAPP`), `status` (`OPEN|CONVERTED|CLOSED`), `notes`,
`appointmentId (FK, nullable, ON DELETE SET NULL)`, `createdByUserId (FK,
nullable)`, `createdAt`, `updatedAt`.

Deliberately **not** an appointment. `appointment` requires `staffId`,
`appointmentDate`, `startTime` and `endTime` NOT NULL and carries the GiST
exclusion constraint; an inquiry has none of those four, so storing it there
would mean relaxing the constraint's own columns for rows that never occupy a
slot. `CHK_inquiry_converted_has_appointment` enforces that CONVERTED carries a
booking and nothing else does.

**inquiry_service** — `id (uuid PK)`, `inquiryId (FK, CASCADE)`, `serviceId (FK,
nullable, SET NULL)`, `nameSnapshot`. Optional: "do you do balayage?" is a real
question about a service the salon may not even offer.

### 2.9 Ratings

**rating** — `id (uuid PK)`, `tenantId (FK)`, `appointmentId (FK)`, `customerId
(FK)`, `staffId (FK, nullable)`, `score (smallint)`, `comment (nullable)`,
`createdAt`. **Unique `(appointmentId)`** — one rating per visit, decided by the
index rather than a check-then-insert, so two taps on a slow connection cannot
produce two rows. `CHK_rating_score` enforces 1–5 in the database.

### 2.10 Invoices

**invoice** — `id (uuid PK)`, `tenantId (FK)`, `appointmentId (FK)`, `customerId
(FK)`, `number (varchar 40)`, `version`, `supersedesInvoiceId (FK, nullable, SET
NULL)`, `status` (`ISSUED|SUPERSEDED`), `subtotalCents`, `serviceDiscountCents`,
`billDiscountCents`, `totalCents`, `paidCents`, `balanceCents`, `currency`,
`snapshot (JSONB)`, `lastSentAt`, `lastSentTo`, `issuedAt`.

A document, not a view. The frozen `snapshot` holds both parties, every line
with its list price and what came off it, the desk discount and its reason, and
the payments received — so a year-old invoice resent today reproduces exactly
what was sent then. The money columns are duplicated out of the snapshot because
those are what a report filters on.

- **Unique `(tenantId, number)`** — numbers read `EAGL-2026-0001` and are
  serialised by locking the tenant row; the index is what makes that a
  guarantee rather than an assumption.
- **Partial unique `(appointmentId) WHERE status = 'ISSUED'`** — one live
  invoice per appointment. Corrections supersede rather than accumulate.
- `CHK_invoice_amounts` requires the arithmetic to hold:
  `totalCents = subtotalCents - serviceDiscountCents - billDiscountCents`.

### 2.11 Attendance

**attendance_day** — `id (uuid PK)`, `tenantId (FK)`, `staffId (FK)`,
`workDate (date)`, `checkInAt (timestamptz, NOT NULL)`, `checkOutAt
(timestamptz, nullable)`, `checkInBy`/`checkOutBy (FK user, nullable, SET
NULL — who pressed it, not necessarily who it was for)`, `expectedStartMin`/
`expectedEndMin (int, nullable — the rostered shift as it stood that day,
snapshotted, never looked up live)`, `graceMinutes`/`earlyGraceMinutes (int —
the tenant's grace settings as they stood that day)`, `lateMinutes`/
`earlyMinutes (int, derived but stored so a report can sum a month in SQL)`,
`workedMinutes (int, nullable until check-out)`, `createdAt`, `updatedAt`.

A row exists only once somebody has punched — absence is worked out at read
time against the rota, never written by a nightly job (DECISIONS.md §33.2).
**Unique `(staffId, workDate)`** — one shift per person per day.
`CHK_attendance_out_after_in` requires `checkOutAt > checkInAt` when set;
`CHK_attendance_minutes` keeps both derived minute columns non-negative.

**attendance_edit_request** — `id (uuid PK)`, `tenantId (FK)`, `staffId (FK)`,
`attendanceId (FK, nullable, SET NULL — null means "no row exists yet", the
commoner case)`, `workDate (date)`, `previousCheckInAt`/`previousCheckOutAt
(timestamptz, nullable — frozen at filing, not inferred later)`,
`requestedCheckInAt`/`requestedCheckOutAt (timestamptz, nullable — missing
means "leave this end alone")`, `reason (varchar 500, NOT NULL)`, `status`
(`PENDING|APPROVED|REJECTED|WITHDRAWN`), `requestedBy (FK user)`, `decidedBy
(FK user, nullable, SET NULL)`, `decidedAt (timestamptz, nullable)`,
`decisionNote (varchar 500, nullable)`, `createdAt`.

**Partial unique `(staffId, workDate) WHERE status = 'PENDING'`** — at most
one open request per person per day; file a second only after the first is
decided. `CHK_attendance_edit_has_request` requires at least one of the two
requested timestamps to be set. `CHK_attendance_edit_requested_order` requires
`requestedCheckOutAt > requestedCheckInAt` when both are given.
`CHK_attendance_edit_decided` requires `decidedBy`/`decidedAt` exactly when
status is `APPROVED`/`REJECTED`, and exactly absent otherwise — a decision
cannot be half-made.

### 2.12 Incentives

**incentive_plan** — `id (uuid PK)`, `tenantId (FK)`, `name (varchar 80)`,
`baseCommissionPercent (int, nullable, 0-100)`, `perJobAmountCents (int,
nullable)`, `monthlyTargetCents (int, nullable)`, `tierBonusPercent (int,
nullable, 0-100)`, `active (bool, default true)`, `createdAt`, `updatedAt`.
Three components, each independently optional, that compose rather than
replace one another (DECISIONS.md §33.6). `CHK_incentive_plan_has_component`
refuses a plan with none of the three set; `CHK_incentive_plan_tier_paired`
requires the target and its bonus rate together or neither.

**incentive_plan_service_rate** — `id (uuid PK)`, `planId (FK, CASCADE)`,
`serviceId (FK, CASCADE)`, `ratePercent (int, 0-100)`. Replaces the plan's
base commission for one named service — a richer rate on colouring than on a
trim. **Unique `(planId, serviceId)`** — a service names at most one rate per
plan.

**incentive_payout** — `id (uuid PK)`, `tenantId (FK)`, `staffId (FK)`,
`planId (FK, nullable, SET NULL — kept for reference; the deletable plan must
never be able to erase what it once paid)`, `periodStart`/`periodEnd (date)`,
`status` (`FINALISED|PAID|VOID`), `revenueCents`, `commissionCents`,
`jobsCompleted`, `perJobCents`, `tierBonusCents`, `totalCents`, `snapshot
(jsonb — the plan's components as applied and every contributing line)`,
`supersedesPayoutId (uuid, nullable)`, `finalisedBy (FK user)`, `paidAt`/
`paidBy (nullable)`, `voidedAt`/`voidedBy`/`voidReason (nullable)`,
`createdAt`.

Frozen the same way an invoice is frozen (DECISIONS.md §31, §33.8): the live
preview can move as later data changes, but the moment someone finalises it
this row stops moving. **Partial unique `(staffId, periodStart, periodEnd)
WHERE status <> 'VOID'`** — one live payout per person per period;
corrections void the old row and insert a new one rather than editing in
place, and this index is what makes room for the replacement rather than an
implementation detail. `CHK_incentive_payout_total` requires
`totalCents = commissionCents + perJobCents + tierBonusCents`.
`CHK_incentive_payout_paid_has_timestamp` and
`CHK_incentive_payout_void_has_reason` require their respective actor +
timestamp (+ reason, for void) columns exactly when the status says so.

---

## 3. Concurrency Model — Double-Booking Protection

### 3.1 Extension & exclusion constraints

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Appointments that occupy staff time in an active state
ALTER TABLE appointment
  ADD CONSTRAINT uq_appointment_no_overlap_active
  EXCLUDE USING gist (
    staff_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  )
  WHERE (status IN ('PENDING_PAYMENT','CONFIRMED','CHECKED_IN','IN_SERVICE'));
```

> **Critical detail:** The `WHERE` clause on an exclusion constraint makes the "active status" scoping **atomic at the row level** — a `CANCELLED` appointment does not block future bookings, and changing an appointment's status re-evaluates the constraint (which is exactly why we don't need to hold the full table lock for this).

```sql
-- Held slots (during payment) occupy staff time too
ALTER TABLE slot_hold
  ADD CONSTRAINT uq_slot_hold_no_overlap_held
  EXCLUDE USING gist (
    staff_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  )
  WHERE (status = 'HELD');
```

- Two customers simultaneously requesting the same staff+time: each `INSERT` tries to satisfy the exclusion constraint; **the second one fails with a unique/exclusion violation** aborted transaction — no lost update, no double book.
- A hold and a confirmed appointment for the same window **also conflict** — the hold `INSERT` or appointment `INSERT` fails correctly.
- `ON CONFLICT DO NOTHING` + explicit conflict check in the service yields the user-friendly "That slot was just booked by another customer."

> **PostgreSQL note:** Exclusion constraints operate on the **same table**. To prevent an appointment and a hold from conflicting *across* the two tables with a single constraint, we accept a minor limitation in MVP: appointment vs. hold conflicts are caught by the app inserting into `slot_hold` and then converting (both inside one transaction — see §3.2). A cross-table trigger-based constraint is a known enhancement if true cross-table adversarial concurrency is ever required; MVP's single-transaction conversion already makes the window safe.

### 3.2 Hold → Appointment conversion (same transaction)

```
BEGIN;
  INSERT INTO slot_hold (...) VALUES (... 'HELD' ...);          -- may fail: already taken
  -- ... payment intent ...
COMMIT;
-- (hold now visible to others)

BEGIN;
  -- payment confirmed:
  UPDATE payment SET state='SUCCESS' WHERE idempotency_key = $1 AND state='PENDING';
  INSERT INTO appointment (staff_id, start_time, end_time, ...)
    SELECT h.staff_id, h.start_time, h.end_time, ...
    FROM slot_hold h
    WHERE h.id = $hold AND h.status = 'HELD';                  -- atomic source
  UPDATE slot_hold SET status='CONSUMED' WHERE id = $hold;
COMMIT;
```

- The `INSERT ... SELECT` is **one statement** — the window can't be double-converted.
- On payment failure/expiry: `UPDATE slot_hold SET status='RELEASED'`.

### 3.3 Optimistic locking

`appointment.version INTEGER NOT NULL DEFAULT 1`; status transitions use `UPDATE ... WHERE id=$1 AND version=$2`; on rowcount 0 → conflict → re-read → re-apply or 409. Prevents lost updates during concurrent check-in / cancel / add-service.

### 3.4 Advisory locks for multi-row mutations

Reschedule and cancel touch multiple rows (original appointment + new appointment). To serialize two operations on the same logical slot, take `pg_advisory_xact_lock(hashtextextended(tenant_id::text || ':' || staff_id::text || ':' || appointment_date::text, 0))` at the start of the transaction.

---

## 4. Key Indexes

| Table | Index | Purpose |
|---|---|---|
| `appointment` | `(tenant_id, appointment_date, status)` | day calendar + dashboard |
| `appointment` | `(staff_id, appointment_date)` | per-staff schedule |
| `appointment` | `(customer_id)` | customer history |
| `appointment` | `(booking_reference)` unique | lookup by customer reference |
| `slot_hold` | `(status, expires_at)` | expiry sweeper |
| `notification` | `(status, next_retry_at)` | retry scheduler |
| `customer` | `(tenant_id, phone)` unique | duplicate prevention |
| `customer` | `(tenant_id, email)` partial unique | dedupe |
| `payment` | `(idempotency_key)` unique | idempotency |
| `payment_attempt` | `(provider, provider_event_id)` unique | callback dedupe |
| `audit_log` | `(tenant_id, created_at)` | audit queries |
| `working_schedule` | `(staff_id, day_of_week)` unique | availability |
| `attendance_day` | `(staff_id, work_date)` unique | one shift per person per day |
| `attendance_day` | `(tenant_id, work_date)` | the day board, and the staff-report late-arrivals query |
| `attendance_edit_request` | `(staff_id, work_date)` partial unique `WHERE status='PENDING'` | at most one open request per day |
| `incentive_plan_service_rate` | `(plan_id, service_id)` unique | one rate per service per plan |
| `incentive_payout` | `(staff_id, period_start, period_end)` partial unique `WHERE status<>'VOID'` | one live payout per period |

---

## 5. Money & Time Rules

- **Money:** store `cents` as `INTEGER` (or `BIGINT` for future scale). No floats. LKR is an integer currency; cents modeling = `amount` in LKR exactly (e.g. `priceCents` = `price * 100`). Display divides by 100.
- **Times:** all timestamps `TIMESTAMPTZ`; date selection uses `appointmentDate` (date) + `startTime (timestamptz)`; timezone `Asia/Colombo` enforced at the app layer for slot generation; DB stores UTC.
- **Slot boundaries:** generated from service durations (no fixed 30/60 grid); must not cross `endMin`; break windows are excluded.

---

## 6. Migrations

- TypeORM migrations in `apps/api/src/infrastructure/database/migrations/` (`<epoch>-<Name>.ts`).
- Initial migration: `CREATE EXTENSION btree_gist` + all tables + constraints + indexes + seed roles + super-admin user + `INSERT` of one demo tenant (demo seed is a separate idempotent script, run on demand).
- `npm run db:migrate` (local) against Docker Postgres; `npm run db:migrate:prod` against Neon URL with `SSL` required.
- Migration policy: **never edit an applied migration**; new changes = new migration file. Rollback allowed only in dev.

---

## 7. Integrity Rules (enforced in code + where possible in DB)

1. `endTime > startTime` (CHECK).
2. `endTime <= staff working end on that day` (service-layer; DB can't easily enforce since it depends on WorkingSchedule).
3. `advancePaidCents <= totalCents` (service-layer).
4. `appointment.totalCents = subtotalCents − discountCents` (service-layer pricing; single PricingService).
5. Unique `bookingReference` — generated `ELN-XXXXXX` from tenant slug prefix + random base32.
6. No hard deletes on `appointment`, `appointment_service`, `payment`, `service`, `staff` (soft/inactive statuses only).
7. `attendance_day.checkOutAt > checkInAt` when set (CHECK); the rostered shift and grace minutes are snapshotted onto the row at check-in, never looked up live against a rota that may have since changed.
8. `incentive_plan` requires at least one of its three components set, and the monthly target + its bonus rate together or neither (CHECK, DECISIONS.md §33.6).
9. `incentive_payout` is idempotent on the money and supersedes rather than edits: an unchanged figure is returned as-is; a moved one voids the old row (partial unique index excludes `VOID`) and inserts a new one pointing back at it via `supersedesPayoutId`.
10. No hard deletes on `attendance_day`, `attendance_edit_request`, `incentive_plan`, `incentive_payout` — statuses (`WITHDRAWN`, `VOID`) and nullable `SET NULL` foreign keys preserve history the same way rule 6 does for the appointment lifecycle.