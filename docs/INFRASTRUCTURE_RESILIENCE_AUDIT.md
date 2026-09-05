# Infrastructure & Third-Party Dependency Resilience Audit

**Scope:** every external service this product depends on, in production, across `apps/api`, `apps/admin`, `apps/web`, and `apps/marketing`. What happens today if each one fails, what it costs, what a mature SaaS typically does differently, and what's worth fixing first.

**Method:** read-only code and documentation review — no behavior was changed to produce this report. Every claim below cites the file (and, where useful, the line) it came from, so anything here can be re-verified directly against the source. Two health-check claims (`apps/api/src/app.controller.ts`, `docs/DEPLOYMENT.md` §9) were independently re-read and confirmed while writing this document.

**Date:** 2026-09-05

---

## 1. Executive Summary

The app depends on **14 external services**, not the 3 (Render, Neon, Cloudinary) most visibly named in the codebase. Four headline findings:

1. **The database has no health check and no timeout.** `GET /health` — the exact endpoint Render polls to decide whether to keep the API alive — never touches the database. If Neon is fully down, Render will report the API as healthy anyway. Separately, no query or connection timeout is configured anywhere, so a Neon outage that hangs rather than cleanly refuses a connection could stall requests indefinitely rather than failing fast.
2. **Nothing watches for a live outage and tells anyone.** An error log and a monitoring dashboard exist, but no alert fires on an elevated error rate or a dependency being down — the only two things that page a human today are notification-quota thresholds and HIGH/CRITICAL security events. A DB outage is invisible until someone opens the dashboard.
3. **Email/SMS is the one dependency class already built to a mature standard**, precisely because a real incident (an unbounded SMTP call hanging appointment creation) already forced a fix. It's worth treating as the template for hardening everything else, not just an example of what went wrong once.
4. **The financial exposure is small, real, and already partially managed.** Only Text.lk (SMS) is a genuine per-usage paid cost the platform absorbs directly — and quota enforcement already exists specifically because that was recognized as a risk. Render and Neon are free-tier, and the one thing worth knowing is that **what happens if you exceed either tier's ceiling is undocumented** — not "known to auto-bill," just genuinely unknown from anything written down.

Two smaller items surfaced along the way, already self-flagged by the project but not yet fixed: two DNS subdomains bypass Cloudflare's proxy (exposing the origin IP), and `apps/marketing/PRODUCT.md` still describes an old, incorrect deployment target.

---

## 2. Full Service Inventory

| # | Service | Used by | Purpose | Request-path behavior | Status |
|---|---|---|---|---|---|
| 1 | **Render** | api, web, admin | Hosting (3 free web services) | N/A — the host itself | Active |
| 2 | **Neon** | api | Postgres 17 database | Synchronous, blocking, on the critical path of every request | Active |
| 3 | **Cloudinary** | api | Logo / staff / customer / product image uploads | Synchronous, blocking — but only within the specific upload endpoint, never the booking/payment path | Active (clean 503 if unconfigured) |
| 4 | **Brevo** | api | Transactional email (confirmations, reminders, invoices, admin alerts) | Awaited but best-effort — never fails the request that triggered it | Active (falls back to console log) |
| 5 | **Text.lk** | api | SMS notifications + signup OTP | Awaited, best-effort for notifications; the OTP-send path does propagate a failure (sending the code is the whole point of that request) | Active — real, metered, paid |
| 6 | **WhatsApp Business API** | api | Notification channel (interface only) | N/A | Stub — every call throws `501`, never invoked |
| 7 | **PayHere** | api | Online payment gateway | N/A | Stub — throws `501` regardless of its own feature flag |
| 8 | **Google Analytics 4** | marketing | Web analytics | Client-side, non-blocking | Wired but inactive — no measurement ID set |
| 9 | **Google Search Console** | marketing | SEO indexing | — | Not present in code at all; appears to be a manual, off-repo step |
| 10 | **Calendly** | marketing | Demo-call booking (primary conversion path) | Client-side iframe, no server dependency | Active |
| 11 | **Web3Forms** | marketing | Contact form → email | Client-side `fetch` directly to Web3Forms' API | Active |
| 12 | **Cloudflare Pages** | marketing | Static hosting for the marketing site | N/A — the host itself | Active — separate from Render, undocumented in `DEPLOYMENT.md` |
| 13 | **Cloudflare DNS** | all (implicitly) | DNS for `zelyraone.lk` | N/A | Active — registrar itself is unnamed anywhere in the docs |
| 14 | **GitHub Actions** | all | CI / keep-alive | N/A | Only a keep-alive ping cron exists — no automated test/lint/build/`npm audit` gate |

Notably **not** a dependency: authentication is fully self-built (argon2 + JWT) — Neon Auth was evaluated and explicitly rejected (`docs/DECISIONS.md`).

---

## 3. Per-Dependency Failure Analysis

### 3.1 Neon (Postgres) — the one that matters most

- **Configuration** (`apps/api/src/app.module.ts`): connection pool raised to `max: 20` from the `pg` default of 10 — a deliberate fix after a real concurrency deadlock found in a P17 soak test (`BookingService.reserveAndConfirm` holding one connection while awaiting a second). **No `connectionTimeoutMillis`, no `statement_timeout`, no retry/backoff override anywhere** — this is unhandled default behavior, not a decision.
- **Startup-time outage:** NestJS/TypeORM's default `retryAttempts: 10` / `retryDelay: 3000ms` applies unmodified (~30s of retries before giving up). `main.ts` calls `void bootstrap()` with no `.catch` — an unrecoverable startup failure becomes an unhandled promise rejection rather than an explicit, logged shutdown.
- **Mid-request outage:** a failing query throws; nothing catches it upstream, so it reaches `apps/api/src/common/filters/api-exception.filter.ts`, which maps anything that isn't a recognized `ApiError`/`HttpException` to a generic `500 INTERNAL_ERROR` — **provided the underlying call actually rejects**, which (per the point above) has no explicit time bound on a true network black hole.
- **Health check — confirmed directly against the source:**
  ```ts
  // apps/api/src/app.controller.ts
  @Public()
  @Get("health")
  health(): { status: string; timestamp: string } {
    return { status: "ok", timestamp: new Date().toISOString() };
  }
  ```
  This never queries the database. `docs/DEPLOYMENT.md` §5 documents this exact path as Render's configured health check. **Consequence: a total Neon outage does not cause Render to consider the API unhealthy.**
- **Autosuspend behavior:** Neon free tier autosuspends on inactivity and resumes on the next query ("~1–3s" per `docs/DEPLOYMENT.md` §9). What happens if a request arrives exactly during that resume window, or the resume takes longer than expected, is **not addressed anywhere** — the one related note in `docs/DECISIONS.md` mentions an `EXTENDED_QUERY_TIMEOUT` only as a hypothetical ("if needed"), never actually implemented.
- **Error logging is itself outage-aware, and this part is done well:** `ApiExceptionFilter.persistErrorLog()` writes the error to an `error_log` table but is explicitly **not awaited**, wrapped in its own `.catch` — so a DB outage (which would also break this very insert) can't crash the filter or delay the response the caller is waiting on.
- **Blast radius:** total. Every feature depends on the database.

### 3.2 Render (hosting)

- Free-tier web services sleep after ~15 minutes idle (30–60s cold start on the next request) — `docs/DEPLOYMENT.md` §9, mitigated today by a keep-alive GitHub Actions cron (`.github/workflows/keep-alive.yml`) that pings all three services on a business-hours schedule, explicitly labeled in-repo as a stop-gap "delete once real clients exist."
- No `render.yaml` or Blueprint file exists anywhere in the repo — **the live Render service configuration (build command, start command, env vars, health-check path) exists only in the Render dashboard, unversioned.** Nothing in git records what's actually deployed.
- Pushing to `main` triggers an automatic redeploy with no approval gate documented (`docs/DEPLOYMENT.md` §9) — a bad push goes straight to production.
- **Blast radius:** total for whichever of the 3 services goes down (api/web/admin are independent Render services, so one going down doesn't take the others with it — but the admin/customer apps both depend on the api service being up).

### 3.3 Cloudinary

- Fails cleanly and predictably: unconfigured → `503 LOGO_UPLOAD_NOT_CONFIGURED` (etc.) before the SDK is ever called; upload failure → caught and rethrown as a `502` with a user-facing message. This is a genuinely well-designed degrade — the rest of the app works fine with Cloudinary fully absent.
- **Gap:** no explicit timeout is set on the Cloudinary SDK call itself (`apps/api/src/cloudinary/cloudinary.service.ts`) — unlike the SMTP fix in §3.4, if Cloudinary accepts a connection but never responds, the promise's resolution depends entirely on the SDK/Node defaults, not on anything this codebase controls.
- Known, accepted, low-severity gap: replacing a logo/photo never deletes the old Cloudinary asset (`docs/DECISIONS.md`) — storage usage only grows, with no numeric quota documented anywhere to know when that becomes a problem.
- **Blast radius:** limited to the specific upload endpoint being called. Never blocks booking, payment, or login.

### 3.4 Email (Brevo) & SMS (Text.lk) — the template to copy elsewhere

- `NotificationService.fire()` is architected to **never throw** — every provider call is wrapped in try/catch, and a failure only updates the notification row's status and schedules a retry (fixed backoff: 1, 5, 15, 60 minutes, via a once-a-minute cron). `BookingService.fireBestEffort()` adds a second layer of the same guarantee at the call site, with the comment: *"Notification failure must never surface as an error to the caller."*
- Notification sends happen **after** the appointment's own DB transaction has already committed — a notification failure of any kind can never roll back or block the booking itself.
- **A real incident already happened here and was fixed at the code level** (unlike the migration incidents below, which were process-only fixes): appointment creation used to await an SMTP send inline with no timeout; once real SMTP pointed at a real host, a blocked connection stalled the whole booking request. The fix, still in place: explicit 10-second connect/greeting/socket timeouts (`smtp-transport-options.ts`), and production defaults to Brevo's HTTP API instead of SMTP (Render's free tier has no fixed outbound IP to allow-list against Brevo's SMTP relay).
- A guaranteed-offline channel (console logging) always fires alongside real channels, exempt from quota — so notification delivery is never *fully* silent even if every real provider is down.
- **Blast radius:** none. This is the one dependency class where a full outage of the provider changes nothing the customer or staff member experiences in the moment — they just get the notification later, or not, without the booking itself ever being affected.

### 3.5 Payments (ManualProvider / PayHere)

- No real exposure exists today: `ManualProvider` (the actual default, confirmed in `resolve-payment-provider.ts`) makes no external network call whatsoever — it's a database write recording that staff took cash/card/bank payment manually. `PayHereProvider` throws `501 NOT_IMPLEMENTED` unconditionally, regardless of its own `PAYMENTS_PAYHERE_ENABLED` flag's value — there is no live code path that can even attempt a real payment-gateway call today.
- **Blast radius:** none — this dependency isn't actually live.

---

## 4. Billing / Cost-Exposure Analysis

| Service | Tier | Documented limits | What happens at the ceiling | Silent-billing risk |
|---|---|---|---|---|
| Render | Free | 512MB RAM · sleeps after 15 min idle · 750 instance-hrs/mo | **Undocumented** — the docs don't say whether exceeding 750 hours throttles, stops the service, or bills | None documented, but this gap means it can't be ruled out either |
| Neon | Free | 0.5GB storage · autosuspend | Compute-hour and connection limits are **not documented anywhere in this repo** | Same — undocumented, not confirmed safe |
| Cloudinary | Free | No numeric quota documented | Not documented | Not documented |
| Brevo | Free/paid-capable | No specific quota documented | Not documented | Not documented, but email volume at this scale is unlikely to matter soon |
| **Text.lk (SMS)** | **Paid, metered** | Per-tenant monthly quota is enforced in-app specifically because this is a real cost | Once a tenant's quota is hit, further sends are marked `FAILED` immediately — **no silent overspend possible**, this is the one dependency actively engineered against surprise cost | **Low** — already mitigated by design (`docs/DECISIONS.md`, quota enforcement built specifically for this reason) |
| Google Maps | — | N/A | — | **Explicitly avoided** — `docs/DECISIONS.md` records this as a deliberate decision not to add a paid dependency |
| Calendly, Web3Forms, GA4, Cloudflare Pages | Free | Standard free-tier limits, not expected to bind at this scale | — | None documented |

**Bottom line:** there is no scenario found where an outage *causes* a charge. The one real, live financial exposure (SMS) is already the best-defended dependency in the whole system. The genuine unknowns are Render's and Neon's free-tier ceilings — not because anything suggests they're dangerous, but because the documentation is simply silent on what happens there, and "silent" is worth closing before it matters.

---

## 5. How Mature SaaS Systems Typically Handle This

A short, honest comparison — not a checklist to complete all at once, just what the gap actually is in each area:

| Practice | What it means | This app today |
|---|---|---|
| **Dependency-aware health checks** | `/health` (or a separate `/health/ready`) actually pings the database and any critical external service, so the platform's own uptime monitoring reflects reality | Liveness only — no dependency check at all |
| **Timeouts on every external call** | Every network call to something you don't control gets an explicit, short timeout, so a hang becomes a fast, clean error instead of an indefinite stall | Done for SMTP (after an incident). Not done for the DB pool or the Cloudinary SDK call |
| **Retry with backoff (and ideally jitter)** | Transient failures get retried automatically, spaced out so a recovering service isn't immediately hammered again | Done well for notifications (fixed 1/5/15/60 min backoff). Not applicable to DB (no retry logic exists for a mid-request failure) |
| **Circuit breakers** | After repeated failures, stop calling a dependency for a cooldown period instead of letting every request pay the same timeout cost | Not present anywhere — at this traffic scale, likely not yet worth the complexity |
| **Graceful degradation** | The product keeps working, minus the broken feature, rather than failing everything | Already true for Cloudinary (rest of the app works with it absent) and notifications (booking succeeds regardless). Not true for the database, which is a hard dependency for nearly everything by nature |
| **Alerting on error rate / dependency health**, not just fixed business thresholds | A human gets paged when something is actually broken, not only when a quota is crossed | `PlatformAlertService` exists and works, but is wired to exactly two triggers (notification quota, HIGH/CRITICAL security events) — nothing watches general error rate or DB connectivity |
| **Infrastructure as code** | The deployed configuration is versioned and reproducible, not "whatever is currently clicked into a dashboard" | No `render.yaml` — Render config is dashboard-only |
| **CI gate before deploy** | Tests, typecheck, lint, and a dependency-vulnerability scan run automatically before code can reach production | `docs/SECURITY.md` describes this as if it exists; in reality, the only GitHub Actions workflow is a keep-alive ping — `npm audit` and the test suite are manual, human steps today |
| **A public or internal status page** | Customers/staff have somewhere to check "is it just me" during an incident, instead of guessing | Doesn't exist — not unreasonable at current scale, but worth naming as the eventual next step past internal alerting |

The honest read: **this app already does the hard part well in exactly one place (notifications)**, because a real incident forced it. Everything above is really "apply that same discipline to the database and Cloudinary," plus closing the two structural gaps (health check, deploy-time CI) that don't require an incident to justify fixing.

---

## 6. Prioritized Recommendations

Recommendations only — nothing here has been built or changed. Each would need its own explicit go-ahead, same as every other change this project makes.

### Tier 1 — near-free, do first
- **Make `/health` check the database.** A single lightweight query (e.g. `SELECT 1`) with a short timeout, returning `503` if it fails. This alone fixes the biggest single gap in this report — Render would actually notice a DB outage.
- **Add a timeout to the Cloudinary SDK call**, mirroring the SMTP fix that already exists for exactly this class of problem.
- **Fix the two unproxied Cloudflare CNAMEs** (`book.zelyraone.lk`, `business.zelyraone.lk`) — the team already found and documented this themselves; it's a small DNS dashboard change.
- **Correct the stale line in `apps/marketing/PRODUCT.md`** claiming a 4th Render service — already flagged as doc drift in `docs/MARKETING_SEO_NEXT_STEPS.md`, just never actioned.

### Tier 2 — moderate effort, real value
- **Add a DB-outage / elevated-error-rate alert**, reusing `PlatformAlertService` (which already exists and already emails `SUPER_ADMIN_EMAIL` for two other trigger types) rather than building new alerting infrastructure from scratch.
- **Add a query/connection timeout to the TypeORM DataSource config**, so a Neon outage fails fast and cleanly instead of potentially hanging a request indefinitely.
- **Write a `render.yaml` Blueprint** so the actual deployed configuration is versioned in git, not just remembered in a dashboard.
- **Build the CI workflow `docs/SECURITY.md` already claims exists** — typecheck, lint, test, and `npm audit`, gating merges to `main` rather than running only as a manual pre-demo step.

### Tier 3 — bigger calls, likely paid-tier
- **Neon point-in-time restore** — currently only available on a paid Neon tier; worth revisiting once real customer data exists and a `pg_dump`-before-changes habit stops being sufficient.
- **A real (even minimal) status page** — worth it once there are outside users who'd otherwise have no way to know "is it just us."
- **Revisit Render/Neon free-tier ceilings** proactively once real usage approaches them, rather than discovering the undocumented behavior live.

---

## 7. Appendix — Sources

| Claim | Source |
|---|---|
| Full service inventory | `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`, `.env.example` (all apps), `apps/api/src/notification/**`, `apps/api/src/payment/providers/**`, `apps/api/src/cloudinary/**`, `apps/marketing/wrangler.jsonc`, `apps/marketing/next.config.ts`, `docs/DECISIONS.md` (#10, #35, #38, #55, #61) |
| DB pool config, no timeout | `apps/api/src/app.module.ts` |
| Health check has no DB check | `apps/api/src/app.controller.ts` (re-read directly for this report) |
| Health-check path documented for Render | `docs/DEPLOYMENT.md` §5 |
| Free-tier limits table | `docs/DEPLOYMENT.md` §9 (re-read directly for this report) |
| Error filter / `error_log` behavior | `apps/api/src/common/filters/api-exception.filter.ts` |
| Notification retry architecture, `fireBestEffort` | `apps/api/src/notification/notification.service.ts`, `apps/api/src/booking/booking.service.ts` |
| SMTP-hang incident and fix | `apps/api/src/notification/providers/smtp-transport-options.ts`, commit `f9da05b` |
| Payment provider resolution | `apps/api/src/payment/providers/resolve-payment-provider.ts`, `manual.provider.ts`, `payhere.provider.ts` |
| Monitoring dashboard, `PlatformAlertService` triggers | `apps/api/src/monitoring/**`, `apps/api/src/alerting/platform-alert.service.ts` |
| Migration-incident history (process-only fix) | `CLAUDE.md` §4 rule 9, commit `ee06e98` |
| SMS/WhatsApp/PayHere as stubs vs. real | `docs/DECISIONS.md` #36, #38, #41 |
| Google Maps avoided as a paid dependency | `docs/DECISIONS.md` #55 |
| Cloudflare Pages hosting for marketing | `apps/marketing/wrangler.jsonc`, `docs/DECISIONS.md` #61 |
| Unproxied CNAME / doc-drift findings | `docs/MARKETING_SEO_NEXT_STEPS.md` |
| CI workflow inventory | `.github/workflows/keep-alive.yml` (the only workflow found) |
