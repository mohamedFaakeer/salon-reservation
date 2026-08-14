/**
 * Thin typed fetch wrappers over the NestJS API — no client-side business
 * logic (CLAUDE.md): every value here is exactly what the server returned.
 */

export interface SalonListItem {
  slug: string;
  name: string;
  address: string | null;
  servicesCount: number;
}

export interface SalonService {
  id: string;
  name: string;
  category: string | null;
  durationMin: number;
  priceCents: number;
}

export interface SalonStaff {
  id: string;
  name: string;
}

export interface SalonHoursEntry {
  dayOfWeek: number;
  startMin: number;
  endMin: number;
}

export interface SalonClosure {
  name: string;
  startDate: string;
  endDate: string;
}

export interface SalonProfile {
  slug: string;
  name: string;
  address: string | null;
  phone: string | null;
  services: SalonService[];
  staff: SalonStaff[];
  hours: Array<SalonHoursEntry | null>;
  advanceRuleLabel: string;
  cancellationPolicySummary: string;
  closures: SalonClosure[];
}

export interface AvailabilitySlot {
  staffId: string;
  staffName: string;
  start: string;
  end: string;
}

export interface CustomerDetailsInput {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
}

export interface ReserveResponse {
  bookingReference: string;
  holdExpiresAt: string;
  paymentIntent: { id: string; amountCents: number; status: string };
}

export interface AppointmentServiceLineView {
  id: string;
  serviceId: string | null;
  nameSnapshot: string;
  durationMinSnapshot: number;
  priceCentsSnapshot: number;
}

export interface BookingDetail {
  id: string;
  status: string;
  startTime: string;
  endTime: string;
  subtotalCents: number;
  totalCents: number;
  notes: string | null;
  bookingReference: string;
  staff: SalonStaff;
  lines: AppointmentServiceLineView[];
}

export interface ConfirmResponse {
  appointment: BookingDetail;
  bookingReference: string;
}

/** Thrown for any non-2xx response; carries the server's actionable message (API.md §7). */
export class ApiRequestError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

/** SSR (Server Components) uses the private API_SERVER_URL; the browser uses NEXT_PUBLIC_API_URL. */
function apiBaseUrl(): string {
  if (typeof window === "undefined") {
    return process.env.API_SERVER_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";
  }
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";
}

async function request<T>(
  path: string,
  init?: RequestInit & { idempotencyKey?: string },
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init?.idempotencyKey) {
    headers["Idempotency-Key"] = init.idempotencyKey;
  }
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
    cache: "no-store",
  });

  if (!res.ok) {
    let body: { code?: string; message?: string } = {};
    try {
      body = await res.json();
    } catch {
      // Non-JSON error body — fall through to the generic message below.
    }
    throw new ApiRequestError(
      res.status,
      body.code ?? "UNKNOWN_ERROR",
      body.message ?? "Something went wrong. Please try again.",
    );
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export function fetchSalons(): Promise<SalonListItem[]> {
  return request<SalonListItem[]>("/salons");
}

export function fetchSalonProfile(slug: string): Promise<SalonProfile> {
  return request<SalonProfile>(`/salons/${slug}`);
}

export function fetchAvailability(
  slug: string,
  input: { serviceIds: string[]; staffId: string | null; date: string },
): Promise<{ slots: AvailabilitySlot[] }> {
  return request<{ slots: AvailabilitySlot[] }>(`/salons/${slug}/availability`, {
    method: "POST",
    body: JSON.stringify({ serviceIds: input.serviceIds, staffId: input.staffId, date: input.date }),
  });
}

export function createBooking(
  slug: string,
  input: {
    serviceIds: string[];
    staffId: string;
    start: string;
    customer: CustomerDetailsInput;
    notes?: string;
  },
  idempotencyKey: string,
): Promise<ReserveResponse> {
  return request<ReserveResponse>(`/salons/${slug}/bookings`, {
    method: "POST",
    body: JSON.stringify(input),
    idempotencyKey,
  });
}

export function confirmPayment(intentId: string, idempotencyKey: string): Promise<ConfirmResponse> {
  return request<ConfirmResponse>(`/payments/${intentId}/confirm`, {
    method: "POST",
    body: JSON.stringify({}),
    idempotencyKey,
  });
}

export function cancelHold(intentId: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/payments/${intentId}/cancel`, { method: "POST" });
}

export function fetchBookingByReference(reference: string, phone: string): Promise<BookingDetail> {
  return request<BookingDetail>(`/bookings/${reference}?phone=${encodeURIComponent(phone)}`);
}
