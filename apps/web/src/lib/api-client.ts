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

/** Display only — never used to filter or gate a booking. */
export type StaffGender = "MALE" | "FEMALE";

export interface SalonStaff {
  id: string;
  name: string;
  /** Present on the salon profile's team grid; absent on a booking's own staff reference (a different, older response shape). */
  imageUrl?: string | null;
  jobTitle?: string | null;
  gender?: StaffGender | null;
  specialties?: string | null;
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
  /** Powers the "Get Directions" button. Both null until the salon sets a location. */
  latitude: number | null;
  longitude: number | null;
  /** The salon's own uploaded logo, or null if they haven't set one — the page falls back to the ZelyraOne mark. */
  logoUrl: string | null;
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

export function confirmPayment(
  intentId: string,
  idempotencyKey: string,
  giftCardCode?: string,
  packageCode?: string,
): Promise<ConfirmResponse> {
  return request<ConfirmResponse>(`/payments/${intentId}/confirm`, {
    method: "POST",
    body: JSON.stringify({
      ...(giftCardCode ? { giftCardCode } : {}),
      ...(packageCode ? { packageCode } : {}),
    }),
    idempotencyKey,
  });
}

export interface GiftCardPreview {
  remainingBalanceCents: number;
  expiresAt: string;
}

/** A pure read — previews a gift card's balance before the customer commits to using it. */
export function previewGiftCard(intentId: string, code: string): Promise<GiftCardPreview> {
  return request<GiftCardPreview>(`/payments/${intentId}/gift-card-preview`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export interface PackagePreview {
  remainingUses: number;
  unitPriceCentsSnapshot: number;
  serviceId: string;
  serviceNameSnapshot: string;
  expiresAt: string;
}

/** A pure read — previews a package's remaining uses and eligible service before the customer commits to using it. */
export function previewPackage(intentId: string, code: string): Promise<PackagePreview> {
  return request<PackagePreview>(`/payments/${intentId}/package-preview`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export function cancelHold(intentId: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/payments/${intentId}/cancel`, { method: "POST" });
}

export function fetchBookingByReference(reference: string, phone: string): Promise<BookingDetail> {
  return request<BookingDetail>(`/bookings/${reference}?phone=${encodeURIComponent(phone)}`);
}

export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "CARD_CAPTURED" | "QR" | "ONLINE" | "GATEWAY" | "GIFT_CARD" | "PACKAGE_CREDIT";

/** What a "Share" link from the salon's till opens — no login, the id in the URL is the only credential. */
export interface RetailSaleReceiptView {
  id: string;
  createdAt: string;
  salon: { name: string; address: string | null; city: string | null; phone: string | null };
  customer: { name: string; phone: string; isWalkIn: boolean };
  soldByName: string | null;
  paymentMethod: PaymentMethod | null;
  lines: Array<{
    id: string;
    bundleId: string | null;
    nameSnapshot: string;
    skuSnapshot: string | null;
    quantity: number;
    lineTotalCents: number;
  }>;
  subtotalCents: number;
  totalCents: number;
}

export function fetchRetailSaleReceipt(id: string): Promise<RetailSaleReceiptView> {
  return request<RetailSaleReceiptView>(`/retail-sale-receipts/${id}`);
}

/** Backs `/unsubscribe/[customerId]` — the public, no-login opt-out link carried in marketing messages. */
export interface UnsubscribeInfo {
  customerFirstName: string;
  salonName: string;
  alreadyOptedOut: boolean;
}

export function fetchUnsubscribeInfo(customerId: string): Promise<UnsubscribeInfo> {
  return request<UnsubscribeInfo>(`/customers/${customerId}/unsubscribe`);
}

export function confirmUnsubscribe(customerId: string): Promise<{ customerFirstName: string; salonName: string }> {
  return request(`/customers/${customerId}/unsubscribe`, { method: "POST" });
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

/* ------------------------------------------------ customer accounts (DECISIONS.md §46) */
/**
 * Entirely optional, alongside guest booking (reference + phone) above,
 * which none of this touches. One account works at every salon — the
 * server, not this file, decides what that means; these are thin wrappers
 * over `/customer-auth/*`, same shape as every other function here.
 */

export interface CustomerAccountPublic {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  phoneVerified: boolean;
}

export interface CustomerAuthResult {
  accessToken: string;
  refreshToken: string;
  account: CustomerAccountPublic;
}

export function customerSignup(input: {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  password: string;
  termsAccepted: boolean;
}): Promise<{ account: CustomerAccountPublic }> {
  return request(`/customer-auth/signup`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function sendPhoneOtp(phone: string): Promise<{ ok: true }> {
  return request(`/customer-auth/otp/send`, {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

export function verifyPhoneOtp(phone: string, code: string): Promise<CustomerAuthResult> {
  return request(`/customer-auth/otp/verify`, {
    method: "POST",
    body: JSON.stringify({ phone, code }),
  });
}

export function customerLogin(phone: string, password: string): Promise<CustomerAuthResult> {
  return request(`/customer-auth/login`, {
    method: "POST",
    body: JSON.stringify({ phone, password }),
  });
}

export function customerRefresh(refreshToken: string): Promise<CustomerAuthResult> {
  return request(`/customer-auth/refresh`, {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
}

export function customerLogout(refreshToken?: string): Promise<{ ok: true }> {
  return request(`/customer-auth/logout`, {
    method: "POST",
    body: JSON.stringify(refreshToken ? { refreshToken } : {}),
  });
}
