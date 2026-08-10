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
   npm install && npm run build
   ```
   (Root workspaces: Render inherits the monorepo via the root `package-lock.json` when the root directory is `apps/api` — for workspaces, set root directory to the repo root is not supported per-subfolder; the documented approach:
   - Set **Root Directory:** leave empty (repo root), then
   - **Build Command:** `npm ci && npm run build -w apps/api`
   - **Start Command:** `npm run start -w apps/api`.)
4. **Environment variables (API):**

   | Var | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `PORT` | `3000` (Render-injected) |
   | `DATABASE_URL` | Neon URL above (with `sslmode=require`) |
   | `JWT_SECRET` | `openssl rand -hex 32` |
   | `JWT_ACCESS_TTL` | `15m` |
   | `JWT_REFRESH_TTL` | `7d` |
   | `CORS_ORIGINS` | `https://<customer>.onrender.com,https://<admin>.onrender.com` |
   | `PAYMENTS_PROVIDER` | `manual` (MVP default) |
   | `PAYMENTS_PAYHERE_ENABLED` | `false` |
   | `NOTIFICATIONS_CHANNELS` | `console,email` |
   | `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | optional (may be blank in demo; console provider always works) |
   | `RATE_LIMIT_ENABLED` | `true` |
   | `LOG_LEVEL` | `info` |

5. **Migrations on deploy:** run once after service creation (or as a one-off Render "shell" / local):
   ```
   DATABASE_URL=<neon-url> npm run db:migrate:prod
   ```
   The migration creates `btree_gist` + all tables + constraints + seed roles + super-admin user (via env `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` or prompted seed).
6. **Health check:** `GET /health` → 200 (add as Render health check path).

---

## 5. Render: Create the Customer App (apps/web)

1. **New + → Web Service →** same repo.
2. **Name:** `salon-web` · Root Directory via workspaces — set **Root Directory** empty +:
   - **Build Command:** `npm ci && npm run build -w apps/web`
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
   - **Build:** `npm ci && npm run build -w apps/admin`
   - **Start:** `npm run start -w apps/admin`
2. **Env (admin):**

   | Var | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://<api>.onrender.com/api/v1` |
   | `AUTH_COOKIE_NAME` | `salon_session` (must match API cookie config) |

---

## 7. Demo Seeding (one-time, idempotent)

After the API is deployed with a `SUPER_ADMIN` account:

```
POST /api/v1/super-admin/login            → admin token
POST /api/v1/super-admin/tenants          → create salon (elegance-salon) + owner user
POST /api/v1/super-admin/tenants/:id/demo-seed  → services, staff, schedules, customers, sample appointments
```

The seed is **idempotent**: re-running is safe. Seeded data:
- Salon: **Elegance Salon** (Colombo) — teaser branding, adjustable.
- Services: Women's Haircut (45 min, LKR 2,500), Men's Haircut (30 min, 1,800), Beard Trim (15 min, 600), Hair Wash (15 min, 800), Hair Coloring (90 min, 4,500), Facial (60 min, 3,500), Manicure (45 min, 2,200), Pedicure (45 min, 2,500), Bridal Makeup (180 min, 12,000), Hair Styling (20 min, 1,000).
- Staff: Kasun, Nadeesha, Ishara, Tharushi — with staff-service qualifications and weekly schedules incl. one lunch break each.
- Sample customers (Ayesha, Mohamed, Sara, …) + a few sample appointments in various states (today + future).

---

## 8. Demo Warm-Up Script (do this ~1 min before showing a client)

```
curl -s -o /dev/null -w "%{http_code}" https://<api>.onrender.com/api/v1/salons
curl -s -o /dev/null -w "%{http_code}" https://<customer>.onrender.com
curl -s -o /dev/null -w "%{http_code}" https://<admin>.onrender.com/login
```

All three should return 200/3xx. First hit wakes the service (and Neon resumes). Follow with one real availability query for snappy slot rendering:

```
curl -X POST https://<api>.onrender.com/api/v1/salons/elegance-salon/availability \
  -H "Content-Type: application/json" \
  -d '{"serviceIds":["<men-haircut-id>"],"staffId":null,"date":"<tomorrow>"}'
```

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