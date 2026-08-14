/**
 * Thin fetch wrappers for public (no-auth) customer-facing endpoints.
 * Server re-validates DTOs per API.md §6 — client-side pre-validation is cosmetic only.
 * All URLs are relative; base is inferred from window.location.origin (Vite/Next dev proxy) or
 * rendered by Next.js server-side in `src/app/layout.tsx` via Next.js rewrites.
 */

import { BookingSource } from "../constants/booking-sources";
export { BookingSource };

export interface SalonBrief {
  slug: string;
  name: string;
  city?: string;
  address?: string;
  servicesSummary?: string;
}

export interface SalonProfile {
  slug: string;
  name: string;
  address?: string;
  hours: { day: string; open: string; close: string }[];
  services: SalonService[];
  staff: StaffBrief[];
  advanceRule: string;
  cancellationPolicy: string;
  closureNotices: string[];
  bookingWindowDays: number;
  sameDayLeadMinutes: number;
}

export interface SalonService {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
}

export interface StaffBrief {
  id: string;
  name: string;
  roles: string[];
}

export interface AvailabilitySlot {
  staffId: string;
  staffName: string;
  start: string; // ISO 8601
  end: string; // ISO 8601
}

export interface CreateBookingDto {
  serviceIds: string[];
  staffId: string;
  start: string; // ISO 8601 instant
  customer: {
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
  };
  notes?: string;
  source?: BookingSource;
}

export interface BookingResponse {
  bookingReference: string;
  holdExpiresAt: string; // ISO 8601
  paymentIntent: {
    id: string;
    amountCents: number;
    status: "PENDING" | "SUCCEEDED" | "FAILED";
  };
}

export interface FindBookingResponse {
  id: string;
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
  };
  serviceIds: string[];
  staffId: string | null;
  start: string; // ISO 8601
  end: string; // ISO 8601
  status: "PENDING_PAYMENT" | "CONFIRMED" | "CHECKED_IN" | "IN_SERVICE" | "COMPLETED" | "CANCELLED" | "NO_SHOW" | "EXPIRED";
  source: BookingSource;
  notes?: string;
  payment?: {
    id: string;
    amountCents: number;
    status: "PENDING" | "SUCCEEDED" | "FAILED";
    createdAt: string;
  };
  audit?: Array<{ action: string; by: string; at: string; reason?: string }>;
}

/**
 * Fetch: GET /salons
 */
export async function fetchSalons(): Promise<SalonBrief[]> {
  const res = await fetch("/api/v1/salons", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch salons");
  return res.json();
}

/**
 * Fetch: GET /salons/:slug
 */
export async function fetchSalonProfile(slug: string): Promise<SalonProfile> {
  const res = await fetch(`/api/v1/salons/${slug}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch salon profile");
  return res.json();
}

/**
 * Fetch: POST /salons/:slug/availability
 * Body: { serviceIds: string[], staffId?: string, date: string } (date: YYYY-MM-DD)
 * Returns: { slots: AvailabilitySlot[] }
 */
export async function checkAvailability(
  slug: string,
  { serviceIds, staffId, date }: { serviceIds: string[]; staffId?: string; date: string }
): Promise<AvailabilitySlot[]> {
  const body = {
    serviceIds,
    ...(staffId && { staffId }),
    date,
  };
  const res = await fetch(`/api/v1/salons/${slug}/availability`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Availability query failed: ${res.status} ${txt}`);
  }
  return res.json();
}

/**
 * Fetch: POST /salons/:slug/bookings
 * Body: CreateBookingDto + Idempotency-Key header (UUID)
 * Returns: { bookingReference, holdExpiresAt, paymentIntent: { id, amountCents, status } }
 */
export async function createBooking(
  slug: string,
  dto: CreateBookingDto,
  idempotencyKey: string
): Promise<BookingResponse> {
  const res = await fetch(`/api/v1/salons/${slug}/bookings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(dto),
    credentials: "include",
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Booking create failed: ${res.status} ${txt}`);
  }
  return res.json();
}

/**
 * Fetch: GET /bookings/:reference?phone=...
 */
export async function fetchBookingByReference(
  reference: string,
  phone: string
): Promise<FindBookingResponse> {
  const res = await fetch(`/api/v1/bookings/${reference}?phone=${encodeURIComponent(phone)}`, {
    credentials: "include",
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Fetch booking failed: ${res.status} ${txt}`);
  }
  return res.json();
}

/**
 * Fetch: POST /payments/:intentId/confirm
 * Body: { providerData?: { note } } + Idempotency-Key header (same as booking)
 * Returns: { appointment, bookingReference }
 */
export async function confirmPayment(
  intentId: string,
  { providerData }: { providerData?: { note?: string } },
  idempotencyKey: string
): Promise<{ appointment: FindBookingResponse; bookingReference: string }> {
  const res = await fetch(`/api/v1/payments/${intentId}/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ providerData }),
    credentials: "include",
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Payment confirm failed: ${res.status} ${txt}`);
  }
  return res.json();
}

/**
 * Fetch: POST /bookings/:reference/cancel
 * Body: { phone, reason }
 */
export async function cancelBooking(
  reference: string,
  { phone, reason }: { phone: string; reason?: string }
): Promise<{ ok: boolean; refundCents?: number }> {
  const res = await fetch(`/api/v1/bookings/${reference}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, reason }),
    credentials: "include",
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Booking cancel failed: ${res.status} ${txt}`);
  }
  return res.json();
}

/**
 * Fetch: POST /bookings/:reference/reschedule
 * Body: { phone, newStaffId?, newStart }
 */
export async function rescheduleBooking(
  reference: string,
  { phone, newStaffId, newStart }: { phone: string; newStaffId?: string; newStart: string }
): Promise<{ ok: boolean; appointment: FindBookingResponse }> {
  const res = await fetch(`/api/v1/bookings/${reference}/reschedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, newStaffId, newStart }),
    credentials: "include",
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Booking reschedule failed: ${res.status} ${txt}`);
  }
  return res.json();
}