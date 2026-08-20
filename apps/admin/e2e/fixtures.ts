import type { APIRequestContext } from "@playwright/test";

export const apiUrl = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:3000/api/v1";

/**
 * Every row this suite creates carries this marker, so `global-setup.ts` can
 * find and remove them without touching demo data.
 *
 * Nothing is deleted by the app itself (CLAUDE.md §1.8 — no hard deletes on
 * business records), and there is deliberately no endpoint that would. The
 * cleanup is test infrastructure reaching into a development database to
 * remove its own fixtures, which is why it is scoped by this marker and
 * refuses to run against anything but a local database.
 */
export const E2E_MARKER = "E2E";

/** A unique, prunable name for anything a spec creates. */
export function e2eName(label: string): string {
  return `${E2E_MARKER} ${label} ${Date.now().toString().slice(-6)}`;
}

const COLOMBO_OFFSET_MINUTES = 330;

/** Colombo-local "today" — mirrors apps/api's time.util.ts `colomboNow` (fixed +05:30, no DST). */
export function todayLocalDate(): string {
  return new Date(Date.now() + COLOMBO_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

/** A date comfortably inside the default 30-day booking window, not "today". */
export function inWindowDate(daysAhead: number): string {
  const d = new Date(`${todayLocalDate()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

/** Mon=0..Sun=6 — matches apps/api's WorkingSchedule.dayOfWeek convention. */
export function dayOfWeekOf(date: string): number {
  const jsDay = new Date(`${date}T00:00:00Z`).getUTCDay();
  return (jsDay + 6) % 7;
}

export interface ApiSession {
  accessToken: string;
  user: { id: string; email: string; name: string; tenantId: string | null; roles: string[] };
}

/**
 * One sign-in per account for the lifetime of the worker.
 *
 * Sign-in is deliberately expensive (argon2id) and deliberately rate-limited
 * per account (SECURITY.md §2). A run that signs in for every test and every
 * fixture competes with a safeguard that is doing its job, and the later tests
 * are the ones told 429.
 */
const sessions = new Map<string, ApiSession>();

export async function signInApi(
  request: APIRequestContext,
  email: string,
  password = "demo1234",
): Promise<ApiSession> {
  const cached = sessions.get(email);
  if (cached) {
    return cached;
  }
  const res = await request.post(`${apiUrl}/auth/login`, { data: { email, password } });
  if (!res.ok()) {
    throw new Error(`Could not sign in as ${email}: ${res.status()} ${await res.text()}`);
  }
  const session = (await res.json()) as ApiSession;
  sessions.set(email, session);
  return session;
}

export async function login(request: APIRequestContext, email: string, password: string): Promise<string> {
  const session = await signInApi(request, email, password);
  return session.accessToken;
}

export async function createStaff(request: APIRequestContext, token: string, name: string): Promise<string> {
  const res = await request.post(`${apiUrl}/staff`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name },
  });
  const body = await res.json();
  return body.id as string;
}

export async function createService(
  request: APIRequestContext,
  token: string,
  name: string,
  durationMin: number,
  priceCents = 250000,
): Promise<string> {
  const res = await request.post(`${apiUrl}/services`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name, durationMin, priceCents },
  });
  const body = await res.json();
  return body.id as string;
}

export async function assignServices(
  request: APIRequestContext,
  token: string,
  staffId: string,
  serviceIds: string[],
): Promise<void> {
  await request.put(`${apiUrl}/staff/${staffId}/services`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { serviceIds },
  });
}

/** Tolerates the demo-seeded staff row already having a schedule for today (persistent dev DB). */
export async function createScheduleForToday(
  request: APIRequestContext,
  token: string,
  staffId: string,
): Promise<void> {
  const dayOfWeek = dayOfWeekOf(todayLocalDate());
  const existing = await request.get(`${apiUrl}/schedules?staffId=${staffId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const rows = (await existing.json()) as Array<{ staffId: string; dayOfWeek: number }>;
  if (rows.some((r) => r.staffId === staffId && r.dayOfWeek === dayOfWeek)) {
    return;
  }
  await request.post(`${apiUrl}/schedules`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { staffId, dayOfWeek, startMin: 0, endMin: 1439 },
  });
}

/** Creates a fresh staff+service+schedule combo, open all day today, so a booking always succeeds regardless of test run time. */
export async function bookableFixture(
  request: APIRequestContext,
  namePrefix: string,
): Promise<{ staffId: string; serviceId: string; serviceName: string }> {
  const token = await login(request, "owner@demo.salon", "demo1234");
  const unique = e2eName(namePrefix);
  const staffId = await createStaff(request, token, `${unique} Staff`);
  const serviceName = `${unique} Service`;
  const serviceId = await createService(request, token, serviceName, 30);
  await assignServices(request, token, staffId, [serviceId]);
  await createScheduleForToday(request, token, staffId);
  return { staffId, serviceId, serviceName };
}
