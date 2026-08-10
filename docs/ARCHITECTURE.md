# ARCHITECTURE.md — System Architecture

**For:** Salon Reservation SaaS MVP · **Stack:** NestJS 11 + TypeORM 1.x + PostgreSQL · Next.js 16 (x2 apps) · Tailwind 4 · npm workspaces · Free-tier deploy (Render + Neon)

---

## 1. High-Level View

```
┌────────────────────────────┐      ┌────────────────────────────┐
│  apps/web (Next.js 16)     │      │  apps/admin (Next.js 16)   │
│  Customer — mobile-first   │      │  Salon — desktop/tablet    │
│  SSR public pages          │      │  Day calendar, bookings,   │
│  Booking flow (no login)   │      │  customers, payments, cfg   │
└─────────────┬──────────────┘      └─────────────┬──────────────┘
              │  REST (JSON, OpenAPI)             │  REST (JSON)
              ▼                                   ▼
┌─────────────────────────────────────────────────────────────┐
│            apps/api (NestJS 11) — REST API                 │
│                                                             │
│  Auth → TenantGuard → RoleGuard → Controller → Service →DB │
│                                                             │
│  Modules: auth, tenants, super-admin, customers, staff,     │
│  services, schedules, availability ◀── THE ENGINE,          │
│  appointments, payments, refunds, notifications, audit,     │
│  dashboard, closures                                        │
│                                                             │
│  Shared: tenant-scoping interceptor, audit interceptor,     │
│  exception filters, validation pipe, rate-limit guards      │
└───────────────────────┬─────────────────────────────────────┘
                        ▼
┌──────────────────────────────────────────────┐
│            PostgreSQL (Neon free / Docker)   │
│  GiST exclusion constraints (double-book),   │
│  unique idempotencyKey, tenant scoping,      │
│  btree_gist extension, migrations            │
└──────────────────────────────────────────────┘
```

**Principle:** All business-critical rules (availability, pricing, refunds, permissions, tenant scoping) execute in the NestJS service layer inside DB transactions. The Next.js apps are presentation only — they display server-computed data and send validated DTO requests.

---

## 2. Monorepo Structure (npm workspaces)

```
salon-reservation-cline/
├── package.json                # workspaces: ["apps/*", "packages/*"], engines, scripts
├── package-lock.json
├── .npmrc                      # consistent registry/workspace settings
├── tsconfig.base.json          # strict shared TS config
├── eslint.config.mjs           # shared lint config (flat config, ESLint 10)
├── prettier.config.mjs         # shared formatting
├── .gitignore                  # node_modules, .env, dist, .next, coverage
├── .env.example                # documented env template (root)
├── docker-compose.yml          # local PostgreSQL 17 + optional adminer
├── docs/                       # this documentation set
├── CLAUDE.md
├── packages/
│   └── shared/
│       ├── package.json
│       └── src/
│           ├── enums/          # AppointmentStatus, Source, PaymentState, Roles, …
│           ├── dto/            # zod/class-validator DTOs shared by API + apps
│           ├── types/          # TS types (strict, no any)
│           └── constants/      # hold TTL, defaults, booking window
└── apps/
    ├── api/
    │   ├── package.json
    │   ├── nest-cli.json
    │   ├── tsconfig.json
    │   ├── src/
    │   │   ├── main.ts
    │   │   ├── app.module.ts
    │   │   ├── database/       # datasource, migrations, entities, demo-seed
    │   │   ├── common/         # guards, interceptors, filters, decorators, utils
    │   │   └── modules/        # feature modules (see §3)
    │   └── test/               # e2e (availability, concurrency, payments, security)
    ├── web/                    # Next.js 16 customer app (App Router)
    │   ├── package.json
    │   ├── next.config.ts
    │   ├── src/app/            # routes: /, /salons, /salons/[slug], /book/…
    │   ├── src/components/     # booking wizard, slot picker, service picker
    │   └── src/lib/            # api client, utils
    └── admin/                  # Next.js 16 staff app (App Router)
        ├── package.json
        ├── next.config.ts
        ├── src/app/            # routes: /dashboard, /schedule/today, /appointments/…
        ├── src/components/     # day calendar, booking drawer, payment modal
        └── src/lib/            # api client (with auth), auth context
```

### Why npm workspaces (not pnpm)

pnpm is not installed on the demo machine; npm 12 workspaces are built-in. Zero extra global installs keeps the demo reproducible. (DECISIONS.md §2.)

---

## 3. Backend Module Map (apps/api)

| Module | Responsibility | Key entities |
|---|---|---|
| `auth` | Login (super-admin + salon users), refresh tokens, roles in JWT, guards | User, UserTenantRole |
| `tenants` | Tenant CRUD (super-admin), settings (advance rule, cancellation policy, booking window, grace) | Tenant |
| `super-admin` | Provision salon + admin user; one-click demo seed | — |
| `customers` | Search by phone/name, create with duplicate warning, history | Customer |
| `staff` | Staff CRUD, staff–service assignments | Staff, StaffService |
| `services` | Service CRUD, category; price/duration changes snapshot-safe | Service |
| `schedules` | Weekly working schedules, breaks, closures | WorkingSchedule, Closure |
| `availability` | **THE engine** — pure slot computation + transactional `reserve` | (uses Appointment, SlotHold) |
| `appointments` | Create (all sources), status transitions, add/remove services, late arrival, no-show | Appointment, AppointmentService |
| `payments` | Record manual advance/full payments; idempotency; provider abstraction | Payment, PaymentAttempt |
| `refunds` | Refund calculation per cancellation policy; manual/external refund record | Refund |
| `notifications` | Notification records, channel providers (console/email), retry scheduler | Notification |
| `audit` | Write-audit interceptor + audit query | AuditLog |
| `dashboard` | Today overview: counts, revenue, outstanding balances, quick actions | (queries) |

### Cross-cutting concerns

- `TenantGuard` — resolves tenant from authenticated JWT; rejects anything caller claims to be tenantId.
- **Tenant scoping interceptor** — wraps every TypeORM repository query to inject `AND "tenantId" = :tenantId`. Defense in depth.
- `RolesGuard` + `@Permissions(...)` decorator — permission matrix enforced in backend.
- `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` — global DTO validation.
- `AuditInterceptor` — declaratively records audited actions.
- `ExceptionFilter` — maps domain errors to friendly, actionable HTTP responses ("That slot was just booked by another customer.").
- `RateLimitGuard` — per-IP/per-user throttling on auth, booking, payment endpoints.
- `SchedulerRegistry` (@nestjs/schedule) — expiry hold sweeper, reminder scheduler, no-show converter.

---

## 4. The Availability Engine (Detailed)

### 4.1 Pure functions (`availability.domain`)

```
findSlots(params) → Array<{ staffId, staffName, start, end }>
canBook(slot, appointmentInput) → ValidationResult
```

`findSlots` inputs: tenantId, branchId, date(s), serviceDurations (summed), staffId? (preferred or null = ANY), now (clock injection for tests).

Algorithm per staff:
1. Filter staff qualified for **all** selected services (via StaffService).
2. Load weekly schedule for the weekday; skip if day off / on leave (StaffLeave overlapping date) / salon closed (Closure overlapping date).
3. Load busy intervals = existing appointments (status ∈ active set) + active SlotHolds, within the day.
4. Generate candidate start times by walking the working window, skipping breaks, requiring slot start ≥ now + leadTime (same-day rule) and end ≤ working end.
5. Candidate must not overlap any busy interval (SQL-driven interval overlap via range operators at query time when possible; in-app validation otherwise).

### 4.2 Transactional reserve (`availability.service.reserve`)

```
Transaction (REPEATABLE READ or SERIALIZABLE as needed):
  1. Validate slot again inside txn (re-read schedules/leave/holds — never trust the earlier fetch).
  2. INSERT SlotHold (HELD, 10-min expiry).
       → on unique/exclusion violation: throw "just booked by another customer"
  3. Return hold + payment_intent (manual/simulated provider).
Commit. // hold visible to engine; blocks the same staff/time for others
```

```
Transaction confirmPayment(idempotencyKey):
  1. UPDATE Payment attempt → SUCCESS (idempotent by unique key).
  2. INSERT Appointment (CONFIRMED)  + AppointmentService snapshots.
       → INSERT ... SELECT FROM SlotHold: atomic within the SAME txn so the hold
         and appointment never coexist duplicated; exclusion constraint re-validates.
  3. Mark hold CONSUMED (or delete).
Commit.
```

Failure paths: reverse hold (RELEASED), payment FAILED/REQUIRES_RECONCILIATION, appointment never created. All idempotent; retries safe.

### 4.3 Concurrency guarantees

1. **Exclusion constraint** `EXCLUDE USING gist (staffId WITH =, tstzrange(startTime, endTime) WITH &&)` on **both** `appointments` (active states) and `slot_holds` (HELD). A violation aborts the INSERT — the DB, not the app, prevents overlap.
2. `INSERT ... SELECT FROM slot_hold` converts hold → appointment atomically, so the same window cannot be double-converted.
3. Optimistic lock `version` on Appointment for status transitions.
4. Refusal to `SELECT-then-INSERT` without a write lock on slot-scoped rows (advisory lock on `hash(staffId, day)` used for reschedule/cancel paths that mutate multiple rows).

---

## 5. Payment Architecture

```
PaymentProvider (interface)
├── ManualProvider      — MVP default (record cash/bank/card; simulated webhook = staff confirms)
└── PayHereProvider     — stub behind PAYMENTS_PAYHERE_ENABLED flag (createIntent, verifyWebhook, refund)

PricingService         — single place: subtotal, discount, advance calc, balance.
RefundCalculator       — single place: cancellation policy → refund amount.
```

- Every `Payment` row has unique `idempotencyKey`; every provider notification is logged in `PaymentAttempt` with the provider's own ID — duplicate callbacks are absorbed.
- Edge cases from spec §15 are explicit test scenarios (see TESTING in DEVELOPMENT_PLAN.md).

---

## 6. Multi-Tenancy Strategy

1. **Session-derived tenant:** JWT carries `tenantId`; controllers never accept a client-provided tenantId.
2. **Schema:** shared tables with `tenantId` column (`TenantScoped` base entity).
3. **Enforcement (2 layers):** `TenantGuard` (route) + TypeORM global query scoping interceptor (data).
4. **SUPER_ADMIN** operates across tenants explicitly; every cross-tenant op is audited.
5. Tests: cross-tenant read/write attempts must 403/404 (indistinguishable to callers).

---

## 7. Data & Service Flow Examples

### 7.1 Online booking (customer)

```
apps/web → POST /api/v1/salons/:slug/availability (serviceIds[], staffId|null, date, tz)
        → GET slots (engine) → list rendered
        → POST /api/v1/bookings (createRequest + idempotencyKey)
             → engine.reserve() → SlotHold + payment intent (manual placeholder)
             → 201 { bookingReference, holdExpiresAt, paymentIntent }
        → (iframe/no-op) payment "succeeds" via ManualProvider
        → POST /api/v1/payments/:intentId/confirm { idempotencyKey, providerData }
             → confirmPayment() → Appointment CONFIRMED (+ snapshots)
        → notification events fired (console/email)
        → response contains bookingReference `ELN-7F3K2`
```

### 7.2 Receptionist booking (walk-in/phone)

```
apps/admin → POST /api/v1/appointments  (source=WALK_IN|PHONE|WHATSAPP, services, staffId, start, customer{id|new})
          → same engine.reserve() → immediate CONFIRMED (no hold needed; or hold+confirm atomically)
          → appointment appears on day calendar.
```

### 7.3 Reschedule (customer)

```
GET availability for new slot → POST /api/v1/appointments/:id/reschedule { newStart, newStaffId }
  → txn: verify original appointment state + owner (reference match)
  → reserve new slot (same exclusion constraint)
  → on success: original → RESCHEDULED (+ reason), new Appointment created (same services snapshot, source = ONLINE)
  → on failure: original untouched; 409 with detail.
```

### 7.4 Cancel + refund

```
POST /api/v1/appointments/:id/cancel { reason }
  → RefundCalculator: cutoff windows → refundAmount (0 or 100%)
  → CancellationPolicy config from tenant
  → Payment → REFUNDED (record + optional external refund note)
  → status CANCELLED; audit + notification.
```

---

## 8. Deployment Topology (Free Tier)

```
Browser (any device)
   │
   ├─ https://<customer>.onrender.com   → apps/web (Next.js SSR)
   ├─ https://<admin>.onrender.com      → apps/admin (Next.js SSR, auth)
   └─ https://<api>.onrender.com        → apps/api (NestJS REST)
                     │
                     └─ postgresql://…@<neon>.neon.tech  (Neon free Postgres 17)
```

- All three Render services are free-tier web services; the DB is Neon free.
- TypeORM migrations run via a one-off job (Render "shell" / local `npm run db:migrate` against the Neon URL).
- Env vars (JWT secret, DB URL, feature flags, SMTP) live in Render dashboard / `.env`, never committed.
- Cold starts: warm all three services ~60 s before a demo.

---

## 9. Auditing & Observability

- `AuditLog` written for: appointment created/cancelled/rescheduled, payment recorded, refund initiated, service price changed, schedule changed, leave created, customer created, tenant provisioning.
- Structured logging through NestJS logger; request IDs; errors mapped to actionable messages.

---

## 10. Rules That Keep the Architecture Clean

1. Controllers = thin HTTP layer. Services = business logic. Domains = pure functions. Repositories = data access.
2. Availability, pricing, refunds each live in **exactly one place** (spec §43).
3. No `any` without justification; strict TS everywhere.
4. Any new dependency must be justified and recorded in DECISIONS.md (spec §46).
5. Feature completeness requires §48 Definition of Done (tests, typecheck, lint, build, docs).