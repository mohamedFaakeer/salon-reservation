# DEPLOYMENT.md — Free-Tier Deployment (Render + Neon)

**Goal:** run the full MVP live for client demos at zero cost: next customer app, admin app, NestJS API on Render free web services + PostgreSQL on Neon free tier.

---

## 1. Architecture (Deployed)

```
Browser (any device)
   │
   ├─ https://<customer>.onrender.com   → apps/web   (Next.js 16, SSR)
   ├─ https://<admin>.onrender.com      → apps/admin (Next.js 16, SSR)
   └─ https://<api>.onrender.com        → apps/api   (NestJS 11, REST + OpenAPI)
                     │
                     └─ postgresql://…@<project>.neon.tech  (Postgres 17 free)
```

- Free Web Service RAM: 512 MB each — sufficient for the MVP.
- Free services spin down after ~15 minutes idle → cold start 30–60 s. **Warm all three before a demo.**
- Neon free tier: 0.5 GB storage, autosuspend after inactivity (resume on first query, ~1–3 s). Suitable; MVP dataset is small.

---

## 2. Prerequisites

- Accounts: [render.com](https://render.com), [neon.tech](https://neon.tech).
- Node 24.18.0, npm 12 (local); git repo pushed to GitHub/GitLab (Render deploys from the repo).
- Local Docker (for the same flow locally via `docker-compose.yml` — optional but recommended for dev parity).

---

## 3. Neon: Create Database

1. New project → name `salon-reservation` → region **Singapore** (nearest free/low-latency for Sri Lanka).
2. Create database `salon` (or accept default `neondb`; set env accordingly).
3. Copy the connection string:
   ```
   postgresql://<user>:<password>@<host>.neon.tech/salon?sslmode=require
   ```
4. Note: Neon free supports `btree_gist` (standard Postgres contrib) — our migration runs `CREATE EXTENSION btree_gist` automatically.

---

## 4. Render: Create the API Service

1. **New + → Web Service →** connect the repo → branch `main`.
2. **Name:** `salon-api` → **Root Directory:** `apps/api` → **Runtime:** Node.
3. **Build Command:**
   ```
   npm ci --include=dev && npm run build -w apps/api
   ```
   (Root workspaces: Render inherits the monorepo via the root `package-lock.json` when the root directory is `apps/api` — for workspaces, set root directory to the repo root is not supported per-subfolder; the documented approach:
   - Set **Root Directory:** leave empty (repo root), then
   - **Build Command:** `npm ci --include=dev && npm run build -w apps/api`
   - **Start Command:** `npm run start -w apps/api`.)
   > **`--include=dev` is required, not optional.** Render sets
   > `NODE_ENV=production`, which makes `npm ci` omit devDependencies — and every
   > build tool in this repo is one: `@nestjs/cli`, `typescript`, `ts-node`,
   > `tailwindcss`, `@tailwindcss/postcss`. A plain `npm ci` drops 370 packages
   > and the build dies with `sh: 1: nest: not found` (or, for the frontends,
   > a Tailwind/TypeScript failure). They are build-time only; the running
   > service still starts from `dist/` and the Next build output.

4. **Environment variables (API):**

   **Required** — the API will not work correctly without these:

   | Var | Value |
   |---|---|
   | `NODE_ENV` | `production` (also switches Postgres SSL on) |
   | `PORT` | `3000` (Render-injected) |
   | `DATABASE_URL` | Neon URL above (with `sslmode=require`) |
   | `JWT_SECRET` | `openssl rand -base64 48` — **must be ≥ 32 chars and must not be the value in `.env.example`**; the API refuses to boot otherwise |
   | `SUPER_ADMIN_PASSWORD` | The platform administrator's password. The migration **fails** rather than seeding the development default |
   | `CORS_ORIGINS` | `https://<customer>.onrender.com,https://<admin>.onrender.com` |

   > **The API will not start in production with a secret from this
   > repository.** `assertProductionSecrets` runs before Nest builds anything
   > and lists every problem at once. This exists because the committed
   > development `JWT_SECRET` is 38 characters, so it satisfied the old length
   > check while remaining readable by anyone with the repo — a deploy that
   > copied `.env.example` into Render would have been signing tokens with a
   > public key.

   **Optional** — every one of these has a working default; set them only to override:

   | Var | Default | Purpose |
   |---|---|---|
   | `JWT_ACCESS_TTL` | `15m` | Access-token lifetime |
   | `JWT_REFRESH_TTL` | `7d` | Refresh-token lifetime |
   | `RATE_LIMIT_MAX` | `100` | Requests per window, per IP |
   | `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window |
   | `ARGON2_MEMORY_KB` | see `password.service.ts` | Password-hash cost — lower only if Render's 512 MB tier struggles |
   | `ARGON2_TIME_COST` | see `password.service.ts` | Password-hash iterations |
   | `PAYMENTS_PAYHERE_ENABLED` | `false` | Keep `false` for MVP; `ManualProvider` is the default |
   | `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | unset | Email notifications; blank is fine for a demo — the console provider always works |
   | `SUPER_ADMIN_EMAIL` | `super.admin@salon.local` | Address for the seeded platform administrator |
   | `DEMO_OWNER_PASSWORD` | unset | Set it to also seed the `elegance` demo salon and its four staff logins. Left unset in production, those accounts are **not created** — they are known addresses on a public URL |
   | `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | unset | Salon logo uploads. Unset means `POST /tenant/me/logo` returns `503 LOGO_UPLOAD_NOT_CONFIGURED` — an honest failure, not a silent no-op — everything else in the app works fine without them |

   > **Verified against the code (P19).** Earlier revisions of this table listed
   > `PAYMENTS_PROVIDER`, `NOTIFICATIONS_CHANNELS`, `RATE_LIMIT_ENABLED` and
   > `LOG_LEVEL`. None of them is read anywhere in `apps/api/src` — setting them
   > does nothing, and `RATE_LIMIT_ENABLED=false` in particular would give a
   > false sense of having disabled throttling. They have been removed rather
   > than implemented, since each has a working hard-coded MVP behaviour.

5. **Migrations on deploy:** run once after service creation (or as a one-off Render "shell" / local):
   ```
   DATABASE_URL=<neon-url> npm run db:migrate:prod
   ```
   The migration creates `btree_gist`, all tables and constraints, the seed
   roles, and the platform administrator from `SUPER_ADMIN_EMAIL` /
   `SUPER_ADMIN_PASSWORD`. With `NODE_ENV=production` and no
   `SUPER_ADMIN_PASSWORD` the migration **fails loudly** instead of creating an
   account whose password is in this repository.

   The demo salon (`elegance`, plus `owner@`/`manager@`/`receptionist@`/`staff@demo.salon`)
   is **not** created in production unless `DEMO_OWNER_PASSWORD` is set. On a
   live deployment, create the first real salon from the platform screen at
   `/platform` instead — that is what it is for.

   **Rotating a password later.** Migrations only decide what a *fresh*
   database gets, so use the rotation command for anything already running. It
   also revokes that user's active sessions, which a password change that left
   them valid would not:
   ```
   DATABASE_URL=<neon-url> npm run user:set-password -w apps/api -- --email you@salon.io --generate
   ```
6. **Health check:** `GET /api/v1/health` → 200. Set this as Render's health
   check path. It is **not** `/health` — the app sets a global `api/v1` prefix,
   so a bare `/health` returns 404 and Render would restart the service in a
   loop while the API itself was working fine.

---

## 5. Render: Create the Customer App (apps/web)

1. **New + → Web Service →** same repo.
2. **Name:** `salon-web` · Root Directory via workspaces — set **Root Directory** empty +:
   - **Build Command:** `npm ci --include=dev && npm run build -w apps/web`
   - **Start Command:** `npm run start -w apps/web`
3. **Env (web):**

   | Var | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://<api>.onrender.com/api/v1` |
   | `PORT` | `3000` (Render-injected; Next uses 3000 default but Render overrides) |

   No secrets in `NEXT_PUBLIC_*`. All server-side fetches on the customer app use the API URL from env (`API_SERVER_URL` for SSR, non-public).

---

## 6. Render: Create the Admin App (apps/admin)

1. Same as web:
   - **Build:** `npm ci --include=dev && npm run build -w apps/admin`
   - **Start:** `npm run start -w apps/admin`
2. **Env (admin):**

   | Var | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://<api>.onrender.com/api/v1` |
   | `AUTH_COOKIE_NAME` | `salon_session` (must match API cookie config) |
   | `NEXT_PUBLIC_CUSTOMER_APP_URL` | `https://<customer>.onrender.com` — where a retail-sale "Share" link points |

---

## 7. Demo Seeding (one-time, idempotent)

Migrations already create the platform super-admin, the `elegance` tenant and
its owner. Seeding adds the *business* data on top.

```
POST /api/v1/auth/login                         → super-admin token
POST /api/v1/super-admin/tenants                → (only for an ADDITIONAL salon)
POST /api/v1/super-admin/tenants/:id/demo-seed  → services, staff, schedules, customers, sample appointments
```

Locally the same thing is one command — it finds the migrated tenant and seeds it:

```
npm run db:seed:demo
```

Both paths call the same `DemoSeedService`, so local and deployed demo data
cannot drift apart. Sample appointments are booked through the real availability
engine rather than inserted directly (CLAUDE.md rule §1), which means a
successful seed is also a live proof that booking works on the fresh deploy.

The seed is **idempotent**: re-running is safe. Seeded data:
- Salon: **Elegance Salon** (Colombo) — teaser branding, adjustable.
- Services: Women's Haircut (45 min, LKR 2,500), Men's Haircut (30 min, 1,800), Beard Trim (15 min, 600), Hair Wash (15 min, 800), Hair Coloring (90 min, 4,500), Facial (60 min, 3,500), Manicure (45 min, 2,200), Pedicure (45 min, 2,500), Bridal Makeup (180 min, 12,000), Hair Styling (20 min, 1,000).
- Staff: Kasun, Nadeesha, Ishara, Tharushi — with staff-service qualifications and weekly schedules incl. one lunch break each.
- Sample customers (Ayesha, Mohamed, Sara, …) + a few sample appointments in various states (today + future).

---

## 8. Demo Warm-Up Script (do this ~1 min before showing a client)

One command does all of it:

```
scripts/smoke-demo.sh https://<api>.onrender.com https://<customer>.onrender.com https://<admin>.onrender.com
```

With no arguments it targets local dev (`:3000` / `:3001` / `:3002`). Override
the salon with `DEMO_SLUG=…`.

It wakes all three services (first hit costs 30–60 s on Render free, and resumes
Neon), then runs a **real availability query** against the demo salon, scanning
forward up to 7 days because an empty day is legitimate — Sunday is closed and a
popular day may be fully booked. Exit code is 0 only if every check passes:

```
Waking services
  PASS  API health (200)
  PASS  Customer app (200)
  PASS  Admin app login (200)

Customer-critical path
  PASS  Salon 'elegance' resolves and exposes services
  PASS  Availability returns bookable slots (2026-08-24)
```

A liveness-only check would pass against an empty database or a broken
availability engine, which is precisely the state this script exists to catch.

---

## 9. Free-Tier Limits & Risk Notes

| Limit | Impact | Mitigation |
|---|---|---|
| Render free: 512 MB RAM | Fine for NestJS/Next MVP | — |
| Render free: sleeps after 15 min idle | Cold start 30–60 s | Warm-up script before demo |
| Render free: 750 instance-hours/mo | Enough for demos + dev | Monitor dashboard |
| Neon free: 0.5 GB storage | MVP well under | Keep migrations lean; no media uploads |
| Neon free: autosuspend | First query after idle resumes ~1–3 s | Warm-up covered by above |
| Free SMTP deliverability | Emails may land in spam/delay | Console provider + Email provider; SMS/WhatsApp not in MVP |
| Render deploys from git | Pushing to main triggers redeploy | Use a `main` deployment branch; test locally first |

---

## 10. Local Development (Parity)

Same env shape in the repo root `.env` (gitignored; `.env.example` committed):

```
docker compose up -d db      # Postgres 17 on localhost:5432
npm ci
npm run db:migrate
npm run db:seed:demo
npm run dev                  # api :3000, web :3001, admin :3002 (all local)
```

Local CORS allow-list: `http://localhost:3001,http://localhost:3002`.

---

## 11. Rollback & Data Safety

- Migrations forward-only in prod; rollback via a new down-migration only in dev.
- Neon point-in-time restore is available on paid tiers; for MVP, export `pg_dump` before big demo changes.
- Rotating `JWT_SECRET` invalidates all sessions — keep a record of when it was changed.

---

## 12. Go-Live Checklist (Beyond Demo, still free)

- [ ] Render services healthy (200 health checks)
- [ ] Migrations applied (tables + constraints + seed roles)
- [ ] CORS origins = actual frontend domains
- [ ] `JWT_SECRET` rotated from default
- [ ] SSL enforced on Render (default HTTPS)
- [ ] Rate limits verified
- [ ] `npm audit` no high/critical
- [ ] Idempotent demo seed verified (run twice, same state)
- [ ] Demo warm-up script runs green