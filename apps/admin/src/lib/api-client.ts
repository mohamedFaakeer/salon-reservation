/**
 * Thin typed fetch wrappers over the NestJS API — no client-side business
 * logic (CLAUDE.md): every value here is exactly what the server returned.
 * Every authenticated call attaches `Authorization: Bearer`; a 401 calls the
 * registered `onUnauthorized` handler (wired by AuthContext) instead of
 * being handled ad hoc per call site.
 */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  tenantId: string | null;
  roles: string[];
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface TenantMe {
  tenant: { id: string; slug: string; name: string; status: string; currency: string; timezone: string };
}

export interface TenantSettingsView {
  noShowGraceMinutes: number;
  [key: string]: unknown;
}

export interface StaffMember {
  id: string;
  name: string;
  active: boolean;
  color: string | null;
}

export interface ServiceItem {
  id: string;
  name: string;
  category: string | null;
  durationMin: number;
  priceCents: number;
  active: boolean;
}

export interface CustomerRecord {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
}

export interface AvailabilitySlot {
  staffId: string;
  staffName: string;
  start: string;
  end: string;
}

export interface AppointmentServiceLineView {
  id: string;
  serviceId: string | null;
  nameSnapshot: string;
  durationMinSnapshot: number;
  priceCentsSnapshot: number;
  status: "ACTIVE" | "REMOVED";
}

export interface AppointmentRecord {
  id: string;
  status: string;
  source: string;
  startTime: string;
  endTime: string;
  staffId: string;
  customerId: string;
  /** Present on list responses (joined server-side for search) — absent elsewhere. */
  customer?: { firstName: string; lastName: string };
  subtotalCents: number;
  totalCents: number;
  advanceRequiredCents: number;
  advancePaidCents: number;
  balanceCents: number;
  bookingReference: string;
  checkedInAt: string | null;
  inServiceAt: string | null;
  completedAt: string | null;
  lateMinutes: number;
  notes: string | null;
  cancellationReason: string | null;
  cancelledAt: string | null;
}

export interface AppointmentDetail extends AppointmentRecord {
  customer: CustomerRecord;
  staff: StaffMember;
  lines: AppointmentServiceLineView[];
}

export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "CARD_CAPTURED" | "ONLINE" | "GATEWAY";
export type PaymentType = "ADVANCE" | "FULL" | "BALANCE";

export interface PaymentRecord {
  id: string;
  amountCents: number;
  method: PaymentMethod;
  state: string;
  type: PaymentType;
  recordedAt: string | null;
  createdAt: string;
}

export interface DashboardToday {
  countsByStatus: Record<string, number>;
  expectedRevenueCents: number;
  outstandingCents: number;
  checkedInNow: number;
  inServiceNow: number;
  waitingLate: number;
  cancellations: number;
  noShows: number;
}

export interface NotificationRecord {
  id: string;
  appointmentId: string | null;
  type: string;
  channel: string;
  recipient: string;
  status: string;
  retryCount: number;
  lastError: string | null;
  createdAt: string;
}

export class ApiRequestError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(statusCode: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiRequestError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function apiBaseUrl(): string {
  if (typeof window === "undefined") {
    return process.env.API_SERVER_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";
  }
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";
}

let unauthorizedHandler: (() => void) | null = null;
/** Wired once by AuthContext on mount. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

let currentToken: string | null = null;
export function setAuthToken(token: string | null): void {
  currentToken = token;
}

async function request<T>(
  path: string,
  init?: RequestInit & { idempotencyKey?: string; skipAuthRedirect?: boolean },
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (currentToken) {
    headers.Authorization = `Bearer ${currentToken}`;
  }
  if (init?.idempotencyKey) {
    headers["Idempotency-Key"] = init.idempotencyKey;
  }

  const res = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
    cache: "no-store",
  });

  if (res.status === 401 && !init?.skipAuthRedirect) {
    unauthorizedHandler?.();
  }

  if (!res.ok) {
    let body: { code?: string; message?: string; details?: Record<string, unknown> } = {};
    try {
      body = await res.json();
    } catch {
      // Non-JSON error body — fall through to the generic message below.
    }
    throw new ApiRequestError(
      res.status,
      body.code ?? "UNKNOWN_ERROR",
      body.message ?? "Something went wrong. Please try again.",
      body.details,
    );
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    skipAuthRedirect: true,
  });
}

export function logout(): Promise<{ ok: true }> {
  return request<{ ok: true }>("/auth/logout", { method: "POST", body: JSON.stringify({}) });
}

export function fetchTenantMe(): Promise<TenantMe> {
  return request<TenantMe>("/tenant/me");
}

export function fetchTenantSettings(): Promise<TenantSettingsView> {
  return request<TenantSettingsView>("/tenant/me/settings");
}

export function fetchStaff(): Promise<StaffMember[]> {
  return request<StaffMember[]>("/staff");
}

export function fetchServices(): Promise<ServiceItem[]> {
  return request<ServiceItem[]>("/services");
}

export function searchCustomers(q: string): Promise<CustomerRecord[]> {
  return request<CustomerRecord[]>(`/customers?q=${encodeURIComponent(q)}`);
}

export function createCustomer(input: {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
}): Promise<CustomerRecord> {
  return request<CustomerRecord>("/customers", { method: "POST", body: JSON.stringify(input) });
}

export function fetchAvailability(
  slug: string,
  input: { serviceIds: string[]; staffId: string | null; date: string },
): Promise<{ slots: AvailabilitySlot[] }> {
  return request<{ slots: AvailabilitySlot[] }>(`/salons/${slug}/availability`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function fetchAppointments(date: string): Promise<{ data: AppointmentRecord[] }> {
  return request<{ data: AppointmentRecord[] }>(`/appointments?date=${date}&limit=100`);
}

export function fetchAppointment(id: string): Promise<AppointmentDetail> {
  return request<AppointmentDetail>(`/appointments/${id}`);
}

export function createAppointment(
  input: {
    customerId?: string;
    newCustomer?: { firstName: string; lastName: string; phone: string; email?: string };
    serviceIds: string[];
    staffId: string;
    start: string;
    source: "WALK_IN" | "PHONE" | "WHATSAPP";
    notes?: string;
    checkInNow?: boolean;
  },
  idempotencyKey: string,
): Promise<AppointmentRecord> {
  return request<AppointmentRecord>("/appointments", {
    method: "POST",
    body: JSON.stringify(input),
    idempotencyKey,
  });
}

export function checkIn(id: string): Promise<AppointmentRecord> {
  return request<AppointmentRecord>(`/appointments/${id}/check-in`, { method: "POST" });
}

export function inService(id: string): Promise<AppointmentRecord> {
  return request<AppointmentRecord>(`/appointments/${id}/in-service`, { method: "POST" });
}

export function complete(id: string): Promise<AppointmentRecord> {
  return request<AppointmentRecord>(`/appointments/${id}/complete`, { method: "POST" });
}

export function cancelAppointment(id: string, reason: string): Promise<AppointmentRecord> {
  return request<AppointmentRecord>(`/appointments/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function rescheduleAppointment(
  id: string,
  input: { newStart: string; newStaffId?: string },
): Promise<AppointmentRecord> {
  return request<AppointmentRecord>(`/appointments/${id}/reschedule`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function markNoShow(id: string): Promise<AppointmentRecord> {
  return request<AppointmentRecord>(`/appointments/${id}/no-show`, { method: "POST" });
}

export function addAppointmentService(appointmentId: string, serviceIds: string[]): Promise<unknown> {
  return request<unknown>(`/appointments/${appointmentId}/services`, {
    method: "POST",
    body: JSON.stringify({ serviceIds }),
  });
}

export function removeAppointmentService(appointmentId: string, lineId: string, reason: string): Promise<unknown> {
  return request<unknown>(`/appointments/${appointmentId}/services/${lineId}`, {
    method: "DELETE",
    body: JSON.stringify({ reason }),
  });
}

export function fetchPayments(appointmentId: string): Promise<{ data: PaymentRecord[] }> {
  return request<{ data: PaymentRecord[] }>(`/payments?appointmentId=${appointmentId}`);
}

export function recordPayment(
  appointmentId: string,
  input: { amountCents: number; method: PaymentMethod; type: PaymentType },
  idempotencyKey: string,
): Promise<PaymentRecord> {
  return request<PaymentRecord>(`/appointments/${appointmentId}/payments`, {
    method: "POST",
    body: JSON.stringify(input),
    idempotencyKey,
  });
}

export function refundPayment(paymentId: string, input: { amountCents: number; reason: string }): Promise<unknown> {
  return request<unknown>(`/payments/${paymentId}/refund`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function fetchDashboardToday(): Promise<DashboardToday> {
  return request<DashboardToday>("/dashboard/today");
}

export function fetchNotifications(status?: string): Promise<{ data: NotificationRecord[] }> {
  return request<{ data: NotificationRecord[] }>(`/notifications${status ? `?status=${status}` : ""}`);
}

export function retryNotification(id: string): Promise<NotificationRecord> {
  return request<NotificationRecord>(`/notifications/${id}/retry`, { method: "POST" });
}
