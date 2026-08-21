/**
 * Thin typed fetch wrappers over the NestJS API — no client-side business
 * logic (CLAUDE.md): every value here is exactly what the server returned.
 */

export interface SalonListItem {
  slug: string;
  name: string;
  address: string | null;
  city: string | null;
  servicesCount: number;
  /** Cheapest active service; null when the salon lists none yet. */
  priceFromCents: number | null;
  topServices: string[];
}

/** 0=Mon..6=Sun. `endMin` is exclusive. */
export interface OfferWindow {
  dayOfWeek: number;
  startMin: number;
  endMin: number;
}

/**
 * A standing offer, as the salon page can describe it.
 *
 * Conditional by nature: `priceCents` stays the list price and this says what
 * the offer would make it and when it runs. No time has been chosen on the
 * salon page, so quoting a single lower figure there would be a promise the
 * booking might not keep.
 */
export interface ServiceOffer {
  label: string;
  discountedPriceCents: number;
  startDate: string;
  endDate: string;
  /** Empty means all day, every day inside the dates. */
  windows: OfferWindow[];
}

export interface SalonService {
  id: string;
  name: string;
  category: string | null;
  durationMin: number;
  priceCents: number;
  discount?: ServiceOffer | null;
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
  city: string | null;
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
  paymentIntent: {
    id: string;
    amountCents: number;
    advanceRequiredCents: number;
    balanceCents: number;
    status: string;
  };
}

export interface AppointmentServiceLineView {
  id: string;
  serviceId: string | null;
  nameSnapshot: string;
  durationMinSnapshot: number;
  /** The list price at booking. What was charged is this less the discount. */
  priceCentsSnapshot: number;
  /** Frozen at booking, so a later change to the offer never rewrites it. */
  discountCentsSnapshot?: number;
  discountLabelSnapshot?: string | null;
}

export interface BookingDetail {
  id: string;
  status: string;
  startTime: string;
  endTime: string;
  subtotalCents: number;
  totalCents: number;
  advanceRequiredCents: number;
  advancePaidCents: number;
  balanceCents: number;
  notes: string | null;
  bookingReference: string;
  staff: SalonStaff;
  lines: AppointmentServiceLineView[];
  salonSlug: string;
  /** Present once the customer has rated this visit. Null until then. */
  rating?: RatingView | null;
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
    return (
      process.env.API_SERVER_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      "http://localhost:3000/api/v1"
    );
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

export function fetchSalons(q?: string): Promise<SalonListItem[]> {
  const term = q?.trim();
  return request<SalonListItem[]>(term ? `/salons?q=${encodeURIComponent(term)}` : "/salons");
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
    body: JSON.stringify({
      serviceIds: input.serviceIds,
      staffId: input.staffId,
      date: input.date,
    }),
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

export function cancelBooking(
  reference: string,
  phone: string,
  reason: string,
): Promise<BookingDetail> {
  return request<BookingDetail>(`/bookings/${reference}/cancel`, {
    method: "POST",
    body: JSON.stringify({ phone, reason }),
  });
}

export function rescheduleBooking(
  reference: string,
  input: { phone: string; newStart: string; newStaffId?: string },
): Promise<BookingDetail> {
  return request<BookingDetail>(`/bookings/${reference}/reschedule`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface RatingView {
  id: string;
  score: number;
  comment: string | null;
  createdAt: string;
  appointmentId: string;
}

/**
 * Rate a completed visit. Authenticated by the same reference-plus-phone the
 * rest of the manage-booking flow uses — there is no account to sign into.
 */
export function submitRating(
  reference: string,
  input: { phone: string; score: number; comment?: string },
): Promise<RatingView> {
  return request<RatingView>(`/bookings/${reference}/rating`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
