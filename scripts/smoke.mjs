#!/usr/bin/env node
/**
 * Pre-demo smoke test (DEPLOYMENT.md §8), in Node so it runs anywhere.
 *
 * The bash version needs `bash` on PATH, which is not true from PowerShell or
 * cmd on Windows — so `npm run smoke` failed for the one person most likely to
 * type it. This is the same five checks with no shell dependency.
 *
 * Wakes the three Render free-tier services (they sleep after ~15 min idle,
 * costing 30-60 s on the first hit) and proves the customer-critical path
 * actually works — not merely that the processes are up.
 *
 * Usage:
 *   npm run smoke                       # the deployed stack
 *   npm run smoke:local                 # localhost defaults
 *   node scripts/smoke.mjs <api> <web> <admin> [slug]
 *
 * Exits non-zero if any check fails, so it is safe in CI.
 */

const [api, web, admin, slug] = [
  process.argv[2] ?? process.env.API_URL ?? "http://localhost:3000",
  process.argv[3] ?? process.env.WEB_URL ?? "http://localhost:3001",
  process.argv[4] ?? process.env.ADMIN_URL ?? "http://localhost:3002",
  process.argv[5] ?? process.env.DEMO_SLUG ?? "elegance",
].map((v) => v.replace(/\/+$/, ""));

// Render cold starts can take a full minute; don't fail on a slow wake-up.
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 90_000);

const colour = process.stdout.isTTY;
const g = (s) => (colour ? `\x1b[32m${s}\x1b[0m` : s);
const r = (s) => (colour ? `\x1b[31m${s}\x1b[0m` : s);
const dim = (s) => (colour ? `\x1b[2m${s}\x1b[0m` : s);
const bold = (s) => (colour ? `\x1b[1m${s}\x1b[0m` : s);

let passed = 0;
let failed = 0;
const ok = (msg) => { console.log(`  ${g("PASS")}  ${msg}`); passed += 1; };
const bad = (msg, hint) => {
  console.log(`  ${r("FAIL")}  ${msg}`);
  if (hint) console.log(`        ${dim(hint)}`);
  failed += 1;
};

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function checkStatus(label, url, accept) {
  const res = await fetchWithTimeout(url);
  const code = res?.status;
  if (code !== undefined && accept(code)) {
    ok(`${label} ${dim(`(${code})`)}`);
  } else {
    bad(`${label} — got ${code ?? "no response"}`, url);
  }
}

/** YYYY-MM-DD, n days from today. */
function dateIn(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

console.log(`\n${bold("Salon reservation — pre-demo smoke test")}`);
console.log(dim(`        api=${api}  web=${web}  admin=${admin}  slug=${slug}`));

console.log(`\n${bold("Waking services")}`);
await checkStatus("API health", `${api}/api/v1/health`, (c) => c === 200);
await checkStatus("Customer app", web, (c) => c === 200 || (c >= 300 && c < 400));
await checkStatus("Admin app login", `${admin}/login`, (c) => c === 200 || (c >= 300 && c < 400));

console.log(`\n${bold("Customer-critical path")}`);

// The salon must be publicly resolvable by slug, with services attached.
const salonRes = await fetchWithTimeout(`${api}/api/v1/salons/${encodeURIComponent(slug)}`);
const salon = salonRes?.ok ? await salonRes.json().catch(() => null) : null;
const serviceId = salon?.services?.[0]?.id;

if (serviceId) {
  ok(`Salon '${slug}' resolves and exposes services`);
} else {
  bad(
    `Salon '${slug}' returned no services — has it been demo-seeded?`,
    "Add demo data from /platform, or POST /api/v1/super-admin/tenants/<id>/demo-seed",
  );
}

// One real availability query: the cheapest end-to-end proof that the API, the
// database and the availability engine are healthy together. A day with no
// slots is legitimate (closed, fully booked), so scan a week before failing.
if (serviceId) {
  let found = null;
  for (let offset = 1; offset <= 7 && !found; offset += 1) {
    const date = dateIn(offset);
    const res = await fetchWithTimeout(`${api}/api/v1/salons/${encodeURIComponent(slug)}/availability`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceIds: [serviceId], date }),
    });
    const body = res?.ok ? await res.json().catch(() => null) : null;
    const slots = Array.isArray(body) ? body : (body?.slots ?? body?.data);
    if (Array.isArray(slots) && slots.length > 0) {
      found = date;
    }
  }

  if (found) {
    ok(`Availability returns bookable slots ${dim(`(${found})`)}`);
  } else {
    bad("No bookable slots in the next 7 days", "Staff schedules missing, or every day is closed/full.");
  }
}

console.log("");
if (failed === 0) {
  console.log(`${g(`All ${passed} checks passed — ready to demo.`)}\n`);
} else {
  console.log(`${r(`${failed} of ${passed + failed} checks failed.`)}\n`);
  process.exitCode = 1;
}
