# DEVELOPMENT_PLAN.md — MVP Build Plan (Vertical Slices)

**Rule (spec §45):** do not start the next major phase until the previous phase is stable. "Stable" = typecheck, lint, tests, build all green + Definition of Done checklist (§4) satisfied for in-scope features.

---

## 1. Build Order (19 Phases)

| Phase | Scope | Key deliverables | Exit criteria |
|---|---|---|---|
| **P1 Foundation** | Monorepo, tooling, CI | npm workspaces, tsconfig.base (strict), ESLint 10 flat config, Prettier, Vitest setup, `.env.example`, docker-compose (Postgres 17), root scripts (`dev`, `test`, `lint`, `build`, `db:migrate`, `db:seed`) | `npm run lint && npm run typecheck && npm test (empty smoke) && npm run build` green |
| **P2 Auth** | Self-hosted auth | argon2id, JWT access (15 min), rotating refresh (httpOnly cookie), login/logout/refresh, rate limiting, CSRF tokens | Auth e2e + S10/S11 security tests green |
| **P3 Tenant** | Multi-tenancy foundation | Tenant entity + settings JSONB, TenantGuard + tenant scoping interceptor, SUPER_ADMIN provisioning endpoint | Cross-tenant isolation tests S1–S3 green |
| **P4 Roles & permissions** | RBAC | Roles seed, `@Permissions` + RolesGuard, permission matrix (API.md §5) | S5, S6 green |
| **P5 Salon setup** | Tenant profile/wizard | Salon profile fields, branch (default row), closure entity, settings defaults (advance rule, cancellation policy, window, grace) | CRUD + validation tests |
| **P6 Services** | Service CRUD | Service entity, category, active; audit on price/duration changes; snapshots unaffected | Unit tests incl. audit |
| **P7 Staff** | Staff + qualifications | Staff CRUD, staff-service assignment, user link optional | Staff-service validation tests |
| **P8 Schedules & leave** | Working time model | WorkingSchedule (weekday + breaks), StaffLeave (+ affected-appointments query), Closure; leave/schedule write = OWNER/MANAGER only | "N appointments affected" unit tests, leave overlaps |
| **P9 Availability engine** | THE ENGINE | `findSlots` + `canBook` pure functions; busy interval reads (appointments + holds); breaks/leave/closures/qualifications/window/lead-time applied | **Full availability test matrix §2.1** green |
| **P10 Appointment creation** | All sources, one engine | `reserve` (hold) + `confirm` (hold→appointment, same txn); sources ONLINE/RECEPTIONIST/WALK_IN/PHONE/WHATSAPP; snapshots; optimistic lock | **Concurrency matrix §2.2** green |
| **P11 Customer booking UX** | apps/web | Salon list/profile, service/staff/date/slot pickers, summary, payment step (manual provider), success w/ booking reference, manage-by-reference (cancel/reschedule) | Customer flow e2e; slot-taken error path |
| **P12 Receptionist booking** | apps/admin | Booking drawer (customer search w/ dup warn, services, staff, engine slots, source), today calendar, detail drawer | Receptionist flow e2e (walk-in/phone) |
| **P13 Payments & advances** | Record payment + abstraction | ManualProvider, Payment/Attempt tables, idempotency keys, advance rule evaluation, record payment, pay more later, outstanding balance | **Payment matrix §2.3** green |
| **P14 Cancellation / rescheduling** | Policy engine | RefundCalculator per policy, cancel (staff+self-service), reschedule (swap, original untouched), no-show converter ≤ grace, late arrival flow | Policy/edge e2e green |
| **P15 Notifications** | Delivery + retry | Notification entity, Console+Email providers, events (confirmation/payment/reminders/cancel/reschedule), retry scheduler, per-channel status | Notification states + retry tests; failure never cancels |
| **P16 Dashboard / calendar** | Day operations | Today dashboard (counts, revenue, outstanding, check-ins), day calendar w/ status colors, quick actions, staff view | Dashboard e2e; calendar renders |
| **P17 Testing** | Full sweep | Run all unit + e2e suites; fix gaps; concurrency soak | All green |
| **P18 Security review** | Hardening | Security e2e matrix §2.4, OWASP checklist (SECURITY.md §12–13), `npm audit` clean of high/critical | Pre-demo checklist complete |
| **P18.5 UI quality & a11y** | Frontend audit | Impeccable audit of `apps/admin` + `apps/web`; accessible status palette, modal dialog semantics, announced errors, touch targets, humanised enums; motion & loading system (shape-matched skeletons, busy spinners, route-level `loading.tsx`, drawer entrance) | Audit score improves; typecheck/lint/build green |
| **P19 Production readiness** | Deploy | Render (api/web/admin) + Neon; migrations on deploy; demo seed idempotent; cold-start warm-up documented; smoke demo script | Live demo URL works end-to-end |

---

## 2. Test Matrix (spec §44)

### 2.1 Availability (unit + integration)

1. Normal booking within working hours → slot offered.
2. Staff unavailable that weekday (no WorkingSchedule row) → no slots.
3. Staff on break → break window not offered.
4. Staff on leave → no slots across leave dates.
5. Existing appointment blocks same window (starter/overlap).
6. Multiple services → summed duration respected (65-min case from spec §9).
7. "Any Available Staff" → earliest qualified shown + auto-assigned.
8. Exact boundary: slot ending exactly at break start allowed; slot crossing break rejected.
9. Overlapping appointment starts before/ends inside/fully covers candidate → rejected.
10. Same-day lead time (2h) → slots < now+2h rejected.
11. Booking window (30 days out) → beyond rejected.
12. Salon closure → whole day rejected.
13. Staff not qualified for a service → their slots hidden for that service set.
14. Held slot (active SlotHold) hides that window from other queries.

### 2.2 Concurrency (e2e, parallel)

1. Two simultaneous **identical** bookings (same staff+time) → exactly one succeeds (exclusion constraint).
2. Receptionist + customer reserve same window → one succeeds.
3. Two receptionists create overlapping bookings → one fails.
4. Reschedule into slot that becomes unavailable mid-flight → original appointment unchanged.
5. Duplicate payment callback with same event ID → processed once.
6. Multiple API retries of booking with same `Idempotency-Key` → one booking, same response.

### 2.3 Payment edge cases (spec §15)

| # | Scenario | Expected |
|---|---|---|
| P1 | Payment succeeds but appointment creation fails (simulated mid-txn failure) | No orphan payment/booking; statuses reconciled |
| P2 | Appointment created but callback delayed | Appointment PENDING_PAYMENT; later callback completes it (no dup) |
| P3 | Browser closed mid-payment | Hold expires (10 min); slot released; appointment → EXPIRED |
| P4 | Payment duplicated (two intents same booking) | Second rejected; one Payment row |
| P5 | Callback received twice | `payment_attempt` unique absorbs duplicate |
| P6 | Payment expires | State FAILED/EXPIRED; hold released |
| P7 | Slot expires while processing | Hold expiry wins; confirm → 409 HOLD_EXPIRED |
| P8 | Payment succeeds after slot expired | Provider refund recorded; appointment NOT created (or EXPIRED + refund) |
| P9 | Refund initiated | Refund row PENDING → SUCCEEDED; payment state updated |
| P10 | Refund fails | Refund row FAILED, retryable; payment state stays |

### 2.4 Appointment lifecycle

Cancellation (with/without refund per policy), reschedule (success/failure), no-show conversion, late arrival banner + actions (continue/shorten/reschedule/cancel), walk-in, receptionist booking, add service during appointment (totals recompute + audit), remove service (REMOVED + audit).

### 2.5 Security (e2e) — see SECURITY.md §11 (S1–S12)

Cross-tenant read/write, manipulated tenantId/price/ownership, role abuse, duplicate callbacks, tampered JWT, expired token + refresh, DTO rejection.

---

## 3. Definition of Done Checklist (spec §48)

For every feature:

- [ ] Business logic implemented
- [ ] Database implemented (migration + entity + constraints)
- [ ] Validation implemented (DTO + server-side)
- [ ] Authorization implemented (roles enforced)
- [ ] Tenant isolation verified (tests)
- [ ] UI implemented (if applicable)
- [ ] Loading states implemented
- [ ] Empty states implemented
- [ ] Error states implemented (actionable messages)
- [ ] Responsive behavior implemented
- [ ] Tests implemented
- [ ] Type checking passes
- [ ] Lint passes
- [ ] Build passes
- [ ] Documentation updated

A feature is **not** done until every box is checked and CI is green.

---

## 4. Feature Implementation Process (spec §47)

For each feature:
1. Explain what will be implemented.
2. Identify affected files.
3. Identify database changes (migration).
4. Identify API changes (OpenAPI).
5. Identify UI changes.
6. Identify security implications.
7. Implement.
8. Run type checking.
9. Run lint.
10. Run tests.
11. Run build.
12. Review for regressions.
13. Summarize changes.

---

## 5. Tooling & Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Run API + both Next.js apps (concurrently) |
| `npm run build` | Build all workspaces |
| `npm run typecheck` | `tsc --noEmit` across workspaces |
| `npm run lint` | ESLint (flat config) |
| `npm run format` / `format:check` | Prettier |
| `npm run test` / `test:e2e` | Vitest unit / e2e suites |
| `npm run db:up` | `docker compose up -d db` (local Postgres 17) |
| `npm run db:migrate` | Apply TypeORM migrations (local) |
| `npm run db:migrate:prod` | Apply migrations to Neon URL (env) |
| `npm run db:seed:demo` | Idempotent demo seed |
| `npm run db:rollback` | Dev-only rollback |

---

## 6. Milestones

- **M1 (P1–P8):** Backend foundation — auth, tenants, RBAC, services, staff, schedules; DB constraints live. No UI.
- **M2 (P9–P10):** THE availability engine + appointment creation — the heart of the product; all concurrency tests green.
- **M3 (P11–P12):** Both UIs usable — customer can book; receptionist can manage a day.
- **M4 (P13–P16):** Payments, cancellation/rescheduling, notifications, dashboard/calendar — full MVP loop.
- **M5 (P17–P19):** Test sweep, security review, live deploy on free tier — demo ready.

---

## 7. Risks & Mitigations (Carried from Plan)

| Risk | Mitigation |
|---|---|
| Exclusion-constraint edge cases on status partial-index | Cover status transitions in tests; partial WHERE on constraint re-evaluates atomically (DATABASE.md §3 note) |
| Neon free-tier limits | Sized migrations; autosuspend doc; `<1 GB` expected for MVP |
| Render cold starts | Warm-up step before demo (~60 s) |
| Free SMTP deliverability | Console/Email provider; demo doesn't depend on delivery |
| Scope creep | §5 "do not build" list is a hard boundary |

---

## 8. Definition of Done for the MVP itself

- [ ] Phases P1–P19 completed in order
- [ ] All test matrices (§2.1–2.5) green
- [ ] Availability engine is the single path for every booking source (verified by tests)
- [ ] No double-booking possible (exclusion constraints + tests)
- [ ] Payments idempotent; §15 edge cases tested
- [ ] Tenant isolation verified (S1–S3)
- [ ] Live demo on Render + Neon: customer books <60 s; receptionist manages day
- [ ] All docs current
- [ ] Pre-deployment security checklist (SECURITY.md §13) done