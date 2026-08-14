import type { APIRequestContext } from "@playwright/test";

export const apiUrl = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:3000/api/v1";

/** A date comfortably inside the default 30-day booking window, not "today". */
export function inWindowDate(daysAhead: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

/** Mon=0..Sun=6 — matches apps/api's WorkingSchedule.dayOfWeek convention. */
export function dayOfWeekOf(date: string): number {
  const jsDay = new Date(`${date}T00:00:00Z`).getUTCDay();
  return (jsDay + 6) % 7;
}

export async function login(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${apiUrl}/auth/login`, { data: { email, password } });
  const body = await res.json();
  return body.accessToken as string;
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

export async function createSchedule(
  request: APIRequestContext,
  token: string,
  staffId: string,
  dayOfWeek: number,
): Promise<void> {
  await request.post(`${apiUrl}/schedules`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { staffId, dayOfWeek, startMin: 540, endMin: 1020 },
  });
}

/** Creates a fresh staff+service+schedule combo so parallel spec files never collide on the same slot. */
export async function bookableFixture(
  request: APIRequestContext,
  namePrefix: string,
): Promise<{ staffId: string; serviceId: string; serviceName: string; date: string }> {
  const token = await login(request, "owner@demo.salon", "demo1234");
  const unique = `${namePrefix} ${Date.now()}`;
  const staffId = await createStaff(request, token, `${unique} Staff`);
  const serviceName = `${unique} Service`;
  const serviceId = await createService(request, token, serviceName, 30);
  await assignServices(request, token, staffId, [serviceId]);
  const date = inWindowDate(2);
  await createSchedule(request, token, staffId, dayOfWeekOf(date));
  return { staffId, serviceId, serviceName, date };
}
