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

export type ModuleKey = "attendance" | "incentives" | "reports" | "auditLog" | "invoices";
export type ReportPanelKey =
  | "takings"
  | "staff"
  | "services"
  | "busyHours"
  | "lapsedCustomers"
  | "customerSpend"
  | "funnelLosses";

export interface TenantMe {
  tenant: {
    id: string;
    slug: string;
    name: string;
    status: string;
    currency: string;
    timezone: string;
    logoUrl: string | null;
  };
  /** The caller's resolved Lite/Pro entitlements for this tenant — same object `TenantGuard` attaches server-side. */
  context: {
    modules: Record<ModuleKey, boolean>;
    reportPanels: Record<ReportPanelKey, boolean>;
  };
}

export type AdvanceRuleValue = "NO_ADVANCE" | "FIXED_AMOUNT" | "PERCENTAGE" | "FULL_PAYMENT";

export interface CancellationPolicyView {
  selfServiceCutoffHours: number;
  refundPercentBeforeCutoff: number;
  refundPercentAfterCutoff: number;
  noShowRefundPercent: number;
}

/**
 * `GET /tenant/me/settings` — the stored settings plus the tenant's currency
 * and timezone, which are read-only here (no DTO field accepts them).
 *
 * `advanceValueCents` and `advancePercent` are not interchangeable: the server
 * prices FIXED_AMOUNT from the first and PERCENTAGE from the second, and the
 * unused one stays null.
 */
export interface TenantSettingsView {
  currency: string;
  timezone: string;
  advanceRule: AdvanceRuleValue;
  /**
   * Absent, not merely null, on tenant rows written before the field existed —
   * `tenant.settings` is a jsonb blob with no migration backfilling it, so
   * treat missing and null as the same "not set".
   */
  advanceValueCents?: number | null;
  advancePercent?: number | null;
  cancellationPolicy: CancellationPolicyView;
  bookingWindowDays: number;
  sameDayLeadMinutes: number;
  noShowGraceMinutes: number;
  reminderOffsets: number[];
  /** Whole percent a receptionist may discount unaided. 0 = owner/manager only. */
  discountCapPercent?: number;
  /** Set via POST/DELETE /tenant/me/logo, not this PATCH — read-only here. */
  logoUrl?: string | null;
}

export interface TenantSettingsPatch {
  advanceRule?: AdvanceRuleValue;
  advanceValueCents?: number | null;
  advancePercent?: number | null;
  cancellationPolicy?: Partial<CancellationPolicyView>;
  bookingWindowDays?: number;
  sameDayLeadMinutes?: number;
  noShowGraceMinutes?: number;
  reminderOffsets?: number[];
  discountCapPercent?: number;
}

export interface BranchRecord {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
}

export interface StaffMember {
  id: string;
  name: string;
  active: boolean;
  color: string | null;
  phone: string | null;
  specialties: string | null;
  /** The commission/incentive plan this stylist earns under. Null = unassigned. */
  incentivePlanId: string | null;
}

export interface ServiceItem {
  id: string;
  name: string;
  category: string | null;
  durationMin: number;
  priceCents: number;
  active: boolean;
  /** The standing offer, if one is set. Null is "no offer", not "not asked". */
  discount?: ServiceDiscountView | null;
}

export interface CustomerRecord {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  /** Present on every customer response — the API returns whole rows. */
  createdAt: string;
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
  /** List price at booking. Charged is this less the discount. */
  priceCentsSnapshot: number;
  /** Frozen at booking — changing the offer later never rewrites it. */
  discountCentsSnapshot?: number;
  discountLabelSnapshot?: string | null;
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
  /** Everything that came off: service offers plus the desk's own. */
  discountCents: number;
  /** The desk's own share of it, kept separate so it can be edited. */
  billDiscountCents: number;
  billDiscountType: "FIXED" | "PERCENT" | null;
  billDiscountValue: number | null;
  billDiscountReason: string | null;
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

export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "CARD_CAPTURED" | "ONLINE" | "GATEWAY" | "GIFT_CARD";
export type PaymentType = "ADVANCE" | "FULL" | "BALANCE";

export interface PaymentRecord {
  id: string;
  amountCents: number;
  method: PaymentMethod;
  state: string;
  type: PaymentType;
  recordedAt: string | null;
  createdAt: string;
  /** Loaded by the list endpoint so a row can name who paid, and for what. */
  customer?: { id: string; firstName: string; lastName: string; phone: string } | null;
  appointment?: { id: string; bookingReference: string; startTime: string } | null;
}

export interface DashboardToday {
  countsByStatus: Record<string, number>;
  appointments: number;
  expectedRevenueCents: number;
  outstandingCents: number;
  checkedInNow: number;
  inServiceNow: number;
  waitingLate: number;
  cancellations: number;
  noShows: number;
}

/** Counts that describe *this moment* — only meaningful if the range covers today. */
export interface DashboardLive {
  checkedInNow: number;
  inServiceNow: number;
  waitingLate: number;
}

export interface DashboardSummary {
  range: { from: string; to: string };
  countsByStatus: Record<string, number>;
  appointments: number;
  expectedRevenueCents: number;
  outstandingCents: number;
  cancellations: number;
  noShows: number;
  /** Null when the range does not include today. */
  live: DashboardLive | null;
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

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

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

/** PATCH semantics — send only what changed. `cancellationPolicy` merges field-wise server-side. */
export function updateTenantSettings(patch: TenantSettingsPatch): Promise<TenantSettingsView> {
  return request<TenantSettingsView>("/tenant/me/settings", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/**
 * Registered by AppLayout, which renders the salon name in the sidebar from a
 * fetch it only makes on mount. Without this, renaming the salon leaves the
 * old name on screen until the next full page load — the same reason
 * `setUnauthorizedHandler` exists rather than each call site handling a 401.
 */
let tenantProfileListener: ((tenant: Partial<TenantMe["tenant"]>) => void) | null = null;
export function setTenantProfileListener(
  handler: ((tenant: Partial<TenantMe["tenant"]>) => void) | null,
): void {
  tenantProfileListener = handler;
}

/** Name only — slug, currency and timezone are fixed at provisioning. */
export async function updateTenantProfile(patch: { name: string }): Promise<TenantMe["tenant"]> {
  const tenant = await request<TenantMe["tenant"]>("/tenant/me", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  tenantProfileListener?.(tenant);
  return tenant;
}

/**
 * Multipart upload — deliberately bypasses `request()`, which always sets
 * `Content-Type: application/json`. The browser must set its own
 * `multipart/form-data` boundary, so no Content-Type header is set here at
 * all. Reuses `tenantProfileListener` so the sidebar's logo updates without
 * a full reload, same mechanism a name change already uses.
 */
export async function uploadTenantLogo(file: File): Promise<TenantSettingsView> {
  const form = new FormData();
  form.append("file", file);

  const headers: Record<string, string> = {};
  if (currentToken) {
    headers.Authorization = `Bearer ${currentToken}`;
  }
  const res = await fetch(`${apiBaseUrl()}/tenant/me/logo`, { method: "POST", headers, body: form, cache: "no-store" });
  if (res.status === 401) {
    unauthorizedHandler?.();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { code?: string; message?: string });
    throw new ApiRequestError(res.status, body.code ?? "UNKNOWN_ERROR", body.message ?? "Something went wrong. Please try again.");
  }
  const settings = (await res.json()) as TenantSettingsView;
  tenantProfileListener?.({ logoUrl: settings.logoUrl ?? null });
  return settings;
}

export async function removeTenantLogo(): Promise<TenantSettingsView> {
  const settings = await request<TenantSettingsView>("/tenant/me/logo", { method: "DELETE" });
  tenantProfileListener?.({ logoUrl: settings.logoUrl ?? null });
  return settings;
}

export function fetchBranch(): Promise<BranchRecord> {
  return request<BranchRecord>("/tenant/me/branch");
}

export function updateBranch(patch: {
  name?: string;
  address?: string;
  city?: string;
  phone?: string;
}): Promise<BranchRecord> {
  return request<BranchRecord>("/tenant/me/branch", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function fetchStaff(): Promise<StaffMember[]> {
  return request<StaffMember[]>("/staff");
}

export interface StaffInput {
  name: string;
  phone?: string;
  specialties?: string;
  color?: string;
}

export function createStaff(input: StaffInput): Promise<StaffMember> {
  return request<StaffMember>("/staff", { method: "POST", body: JSON.stringify(input) });
}

export function updateStaff(
  id: string,
  patch: Partial<StaffInput> & { active?: boolean; incentivePlanId?: string | null },
): Promise<StaffMember> {
  return request<StaffMember>(`/staff/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

/* ----------------------------------------------------- availability (FE3) */

export interface WorkingSchedule {
  id: string;
  staffId: string;
  /** 0 = Monday … 6 = Sunday. */
  dayOfWeek: number;
  /** Minutes from midnight; the UI shows real clock times. */
  startMin: number;
  endMin: number;
  breakStartMin: number | null;
  breakEndMin: number | null;
}

export interface ScheduleInput {
  staffId: string;
  dayOfWeek: number;
  startMin: number;
  endMin: number;
  breakStartMin?: number | null;
  breakEndMin?: number | null;
}

export function fetchSchedules(staffId?: string): Promise<WorkingSchedule[]> {
  const qs = staffId ? `?staffId=${encodeURIComponent(staffId)}` : "";
  return request<WorkingSchedule[]>(`/schedules${qs}`);
}

export function createSchedule(input: ScheduleInput): Promise<WorkingSchedule> {
  return request<WorkingSchedule>("/schedules", { method: "POST", body: JSON.stringify(input) });
}

export function updateSchedule(
  id: string,
  patch: Partial<Omit<ScheduleInput, "staffId" | "dayOfWeek">>,
): Promise<WorkingSchedule> {
  return request<WorkingSchedule>(`/schedules/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteSchedule(id: string): Promise<void> {
  return request<void>(`/schedules/${id}`, { method: "DELETE" });
}

export interface StaffLeaveRecord {
  id: string;
  staffId: string;
  startDate: string;
  endDate: string;
  reason: string | null;
}

export interface AffectedAppointment {
  id: string;
  appointmentDate: string;
  startTime: string;
  bookingReference: string;
  customerName: string | null;
}

export interface CreateLeaveResult {
  leave: StaffLeaveRecord;
  affectedAppointments: number;
  affected: AffectedAppointment[];
}

export function fetchLeave(staffId: string): Promise<StaffLeaveRecord[]> {
  return request<StaffLeaveRecord[]>(`/staff/${staffId}/leave`);
}

/** What a leave over this range would strand — queried before creating it. */
export function fetchAffectedByLeave(
  staffId: string,
  startDate: string,
  endDate: string,
): Promise<AffectedAppointment[]> {
  return request<AffectedAppointment[]>(
    `/staff/${staffId}/leave/affected?startDate=${startDate}&endDate=${endDate}`,
  );
}

/** Tenant-wide leave, for the availability board's overlay. */
export function fetchAllLeave(): Promise<Array<StaffLeaveRecord & { staffId: string }>> {
  return request<Array<StaffLeaveRecord & { staffId: string }>>("/leave");
}

export function createLeave(
  staffId: string,
  input: { startDate: string; endDate: string; reason?: string },
): Promise<CreateLeaveResult> {
  return request<CreateLeaveResult>(`/staff/${staffId}/leave`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteLeave(staffId: string, leaveId: string): Promise<void> {
  return request<void>(`/staff/${staffId}/leave/${leaveId}`, { method: "DELETE" });
}

export interface ClosureRecord {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export function fetchClosures(): Promise<ClosureRecord[]> {
  return request<ClosureRecord[]>("/closures");
}

export function createClosure(input: {
  name: string;
  startDate: string;
  endDate: string;
}): Promise<ClosureRecord> {
  return request<ClosureRecord>("/closures", { method: "POST", body: JSON.stringify(input) });
}

export function deleteClosure(id: string): Promise<void> {
  return request<void>(`/closures/${id}`, { method: "DELETE" });
}

export interface StaffServiceAssignment {
  staffId: string;
  serviceIds: string[];
}

/**
 * Every stylist's assignments in one request. The skills matrix needs all of
 * them at once, and asking per stylist made the cost of opening it grow with
 * the size of the team.
 */
export function fetchStaffServiceAssignments(): Promise<StaffServiceAssignment[]> {
  return request<StaffServiceAssignment[]>("/staff/services");
}

export function fetchStaffServices(staffId: string): Promise<ServiceItem[]> {
  return request<ServiceItem[]>(`/staff/${staffId}/services`);
}

/** PUT replaces the whole assignment set — always send the complete list. */
export function setStaffServices(staffId: string, serviceIds: string[]): Promise<ServiceItem[]> {
  return request<ServiceItem[]>(`/staff/${staffId}/services`, {
    method: "PUT",
    body: JSON.stringify({ serviceIds }),
  });
}

export function fetchServices(): Promise<ServiceItem[]> {
  return request<ServiceItem[]>("/services");
}

export interface ServiceInput {
  name: string;
  category?: string;
  description?: string;
  durationMin: number;
  priceCents: number;
}

export function createService(input: ServiceInput): Promise<ServiceItem> {
  return request<ServiceItem>("/services", { method: "POST", body: JSON.stringify(input) });
}

/** PATCH semantics — send only what changed. `active` toggles retirement. */
export function updateService(
  id: string,
  patch: Partial<ServiceInput> & { active?: boolean },
): Promise<ServiceItem> {
  return request<ServiceItem>(`/services/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export interface ListMeta {
  total: number;
  limit: number;
  offset: number;
}

export interface CustomerDetail extends CustomerRecord {
  notes: string | null;
  createdAt: string;
}

/**
 * `GET /customers` — the same envelope every other list endpoint returns.
 * `meta.total` is the unpaged count, which is what the pager reads.
 */
export function fetchCustomers(params: {
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: CustomerRecord[]; meta: ListMeta }> {
  const qs = new URLSearchParams();
  if (params.q?.trim()) {
    qs.set("q", params.q.trim());
  }
  qs.set("limit", String(params.limit ?? 25));
  qs.set("offset", String(params.offset ?? 0));
  return request<{ data: CustomerRecord[]; meta: ListMeta }>(`/customers?${qs.toString()}`);
}

export interface CustomerStats {
  totalBookings: number;
  visits: number;
  cancellations: number;
  noShows: number;
  /** On the books but not yet happened — how "never been in" is told apart from "coming Thursday". */
  upcoming: number;
  /** Percent of concluded appointments missed. Null when there is nothing to judge. */
  noShowRate: number | null;
  totalSpentCents: number;
  firstVisitDate: string | null;
  lastVisitDate: string | null;
  services: Array<{ name: string; count: number }>;
  /** Mean of the ratings they have left. Null when they have left none. */
  averageRating: number | null;
  ratingCount: number;
}

/** Aggregated in the database — never tally these from a page of results. */
export function fetchCustomerStats(id: string): Promise<CustomerStats> {
  return request<CustomerStats>(`/customers/${id}/stats`);
}

export function fetchCustomer(id: string): Promise<CustomerDetail> {
  return request<CustomerDetail>(`/customers/${id}`);
}

/** The typeahead only ever shows a handful, so it asks for a handful. */
export function searchCustomers(q: string): Promise<CustomerRecord[]> {
  return fetchCustomers({ q, limit: 10 }).then((res) => res.data);
}

/**
 * A customer's bookings, newest first. This is the same appointment list every
 * other screen reads, filtered server-side — no separate history query, so
 * STAFF stay scoped to their own appointments here exactly as elsewhere.
 */
export function fetchCustomerAppointments(
  customerId: string,
  params: { status?: string; limit?: number; offset?: number } = {},
): Promise<{ data: AppointmentRecord[]; meta: ListMeta }> {
  const qs = new URLSearchParams({ customerId });
  if (params.status) {
    qs.set("status", params.status);
  }
  qs.set("limit", String(params.limit ?? 20));
  qs.set("offset", String(params.offset ?? 0));
  return request<{ data: AppointmentRecord[]; meta: ListMeta }>(`/appointments?${qs.toString()}`);
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

export interface AppointmentQuery {
  date?: string;
  status?: string;
  staffId?: string;
  customerId?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export function fetchAppointments(
  params: AppointmentQuery = {},
): Promise<{ data: AppointmentRecord[]; meta: ListMeta }> {
  const qs = new URLSearchParams();
  if (params.date) {
    qs.set("date", params.date);
  }
  if (params.status) {
    qs.set("status", params.status);
  }
  if (params.staffId) {
    qs.set("staffId", params.staffId);
  }
  if (params.customerId) {
    qs.set("customerId", params.customerId);
  }
  if (params.q?.trim()) {
    qs.set("q", params.q.trim());
  }
  qs.set("limit", String(params.limit ?? 100));
  qs.set("offset", String(params.offset ?? 0));
  return request<{ data: AppointmentRecord[]; meta: ListMeta }>(`/appointments?${qs.toString()}`);
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

export function addAppointmentService(
  appointmentId: string,
  serviceIds: string[],
): Promise<unknown> {
  return request<unknown>(`/appointments/${appointmentId}/services`, {
    method: "POST",
    body: JSON.stringify({ serviceIds }),
  });
}

export function removeAppointmentService(
  appointmentId: string,
  lineId: string,
  reason: string,
): Promise<unknown> {
  return request<unknown>(`/appointments/${appointmentId}/services/${lineId}`, {
    method: "DELETE",
    body: JSON.stringify({ reason }),
  });
}

export function fetchPayments(appointmentId: string): Promise<{ data: PaymentRecord[] }> {
  return request<{ data: PaymentRecord[] }>(`/payments?appointmentId=${appointmentId}`);
}

export interface PaymentQuery {
  appointmentId?: string;
  customerId?: string;
  state?: string;
  /** A gift card's full redemption history — every payment it was drawn against. */
  giftCardId?: string;
  limit?: number;
  offset?: number;
}

export function fetchPaymentsList(
  params: PaymentQuery = {},
): Promise<{ data: PaymentRecord[]; meta: ListMeta }> {
  const qs = new URLSearchParams();
  if (params.appointmentId) {
    qs.set("appointmentId", params.appointmentId);
  }
  if (params.customerId) {
    qs.set("customerId", params.customerId);
  }
  if (params.state) {
    qs.set("state", params.state);
  }
  if (params.giftCardId) {
    qs.set("giftCardId", params.giftCardId);
  }
  qs.set("limit", String(params.limit ?? 25));
  qs.set("offset", String(params.offset ?? 0));
  return request<{ data: PaymentRecord[]; meta: ListMeta }>(`/payments?${qs.toString()}`);
}

export interface AuditRecord {
  id: string;
  tenantId: string;
  /** Null for entries the system wrote itself, e.g. an expired hold. */
  actorUserId: string | null;
  actorUser: { id: string; name: string; email: string } | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditQuery {
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export function fetchAudit(
  params: AuditQuery = {},
): Promise<{ data: AuditRecord[]; meta: ListMeta }> {
  const qs = new URLSearchParams();
  if (params.entityType) {
    qs.set("entityType", params.entityType);
  }
  if (params.entityId) {
    qs.set("entityId", params.entityId);
  }
  if (params.from) {
    qs.set("from", params.from);
  }
  if (params.to) {
    qs.set("to", params.to);
  }
  qs.set("limit", String(params.limit ?? 25));
  qs.set("offset", String(params.offset ?? 0));
  return request<{ data: AuditRecord[]; meta: ListMeta }>(`/audit?${qs.toString()}`);
}

export function recordPayment(
  appointmentId: string,
  input: { amountCents: number; method: PaymentMethod; type: PaymentType; giftCardCode?: string },
  idempotencyKey: string,
): Promise<PaymentRecord> {
  return request<PaymentRecord>(`/appointments/${appointmentId}/payments`, {
    method: "POST",
    body: JSON.stringify(input),
    idempotencyKey,
  });
}

export function refundPayment(
  paymentId: string,
  input: { amountCents: number; reason: string },
): Promise<unknown> {
  return request<unknown>(`/payments/${paymentId}/refund`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Totals for a date range. Omitting both bounds means today. */
export function fetchDashboard(params: { from?: string; to?: string } = {}): Promise<DashboardSummary> {
  const qs = new URLSearchParams();
  if (params.from) {
    qs.set("from", params.from);
  }
  if (params.to) {
    qs.set("to", params.to);
  }
  const query = qs.toString();
  return request<DashboardSummary>(`/dashboard${query ? `?${query}` : ""}`);
}

export function fetchDashboardToday(): Promise<DashboardToday> {
  return request<DashboardToday>("/dashboard/today");
}

export function fetchNotifications(status?: string): Promise<{ data: NotificationRecord[] }> {
  return request<{ data: NotificationRecord[] }>(
    `/notifications${status ? `?status=${status}` : ""}`,
  );
}

export function retryNotification(id: string): Promise<NotificationRecord> {
  return request<NotificationRecord>(`/notifications/${id}/retry`, { method: "POST" });
}

export type PlanTier = "LITE" | "PRO";

export interface PlatformTenant {
  id: string;
  slug: string;
  name: string;
  status: string;
  currency: string;
  timezone: string;
  createdAt: string;
  tier: PlanTier;
  /** Real appointments today, computed live — not a stored flag. */
  bookingsToday: number;
  /** Past the plan's own daily limit, inside the grace buffer that still lets a booking through. */
  overBookingLimit: boolean;
}

export interface ProvisionTenantResult {
  tenant: { id: string; slug: string; name: string; status: string };
  owner: { id: string; email: string; name: string };
}

export interface DemoSeedResult {
  /** false when the tenant already had demo data — the call was a safe no-op. */
  seeded: boolean;
  counts: { services: number; staff: number; customers: number; appointments: number };
}

export function fetchTenants(params: { limit?: number; offset?: number } = {}): Promise<{
  data: PlatformTenant[];
  meta: ListMeta;
}> {
  const qs = new URLSearchParams({
    limit: String(params.limit ?? 25),
    offset: String(params.offset ?? 0),
  });
  return request<{ data: PlatformTenant[]; meta: ListMeta }>(`/super-admin/tenants?${qs}`);
}

export function provisionTenant(input: {
  salonName: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  tier?: PlanTier;
}): Promise<ProvisionTenantResult> {
  return request<ProvisionTenantResult>("/super-admin/tenants", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Idempotent server-side: a second call reports `seeded: false` and changes nothing. */
export function demoSeedTenant(tenantId: string): Promise<DemoSeedResult> {
  return request<DemoSeedResult>(`/super-admin/tenants/${tenantId}/demo-seed`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/* ------------------------------------------------------- tenant entitlements */

export interface ModuleOverridesInput {
  attendance?: boolean;
  incentives?: boolean;
  reports?: boolean;
  auditLog?: boolean;
  invoices?: boolean;
}

export interface ReportPanelOverridesInput {
  takings?: boolean;
  staff?: boolean;
  services?: boolean;
  busyHours?: boolean;
  lapsedCustomers?: boolean;
  customerSpend?: boolean;
  funnelLosses?: boolean;
}

export interface LimitOverridesInput {
  maxManagers?: number | null;
  maxReceptionists?: number | null;
  maxStaff?: number | null;
  maxServices?: number | null;
  maxIncentivePlans?: number | null;
  maxBookingsPerDay?: number | null;
  maxBookingWindowDays?: number | null;
  maxReminderOffsets?: number | null;
  maxDiscountCapPercent?: number | null;
}

export interface TenantEntitlementsView {
  tier: PlanTier;
  moduleOverrides: ModuleOverridesInput;
  reportPanelOverrides: ReportPanelOverridesInput;
  limitOverrides: LimitOverridesInput;
  modules: Record<ModuleKey, boolean>;
  reportPanels: Record<ReportPanelKey, boolean>;
  limits: Required<LimitOverridesInput>;
}

export function fetchTenantEntitlements(tenantId: string): Promise<TenantEntitlementsView> {
  return request<TenantEntitlementsView>(`/super-admin/tenants/${tenantId}/entitlements`);
}

export function updateTenantEntitlements(
  tenantId: string,
  input: {
    tier: PlanTier;
    moduleOverrides?: ModuleOverridesInput;
    reportPanelOverrides?: ReportPanelOverridesInput;
    limitOverrides?: LimitOverridesInput;
  },
): Promise<TenantEntitlementsView> {
  return request<TenantEntitlementsView>(`/super-admin/tenants/${tenantId}/entitlements`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export type AssignableRole = "MANAGER" | "RECEPTIONIST" | "STAFF";

export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  role: string;
  status: "ACTIVE" | "DISABLED";
  staffId: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export function fetchTeam(): Promise<TeamMember[]> {
  return request<TeamMember[]>("/team");
}

export function createTeamMember(input: {
  name: string;
  email: string;
  password: string;
  role: AssignableRole;
}): Promise<TeamMember> {
  return request<TeamMember>("/team", { method: "POST", body: JSON.stringify(input) });
}

export function updateTeamMember(
  userId: string,
  patch: { role?: AssignableRole; status?: "ACTIVE" | "DISABLED" },
): Promise<TeamMember> {
  return request<TeamMember>(`/team/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/* ------------------------------------------------------------------ *
 * Inquiries
 *
 * A question somebody asked, holding no slot. Deliberately a separate
 * resource from appointments — see DECISIONS.md for why it is not just an
 * appointment status.
 * ------------------------------------------------------------------ */

export type InquiryStatusValue = "OPEN" | "CONVERTED" | "CLOSED";

export interface InquiryRecord {
  id: string;
  customerId: string;
  /** Whole, not a joined display name — converting pre-fills the booking drawer. */
  customer: { id: string; firstName: string; lastName: string; phone: string } | null;
  source: "WALK_IN" | "PHONE" | "WHATSAPP";
  status: InquiryStatusValue;
  notes: string | null;
  services: Array<{ serviceId: string | null; name: string }>;
  appointmentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function fetchInquiries(
  params: { status?: InquiryStatusValue; customerId?: string; limit?: number; offset?: number } = {},
): Promise<{ data: InquiryRecord[]; meta: ListMeta }> {
  const qs = new URLSearchParams();
  if (params.status) {
    qs.set("status", params.status);
  }
  if (params.customerId) {
    qs.set("customerId", params.customerId);
  }
  qs.set("limit", String(params.limit ?? 25));
  qs.set("offset", String(params.offset ?? 0));
  return request<{ data: InquiryRecord[]; meta: ListMeta }>(`/inquiries?${qs.toString()}`);
}

/** No staff, date or time — an inquiry reserves nothing. */
export function createInquiry(input: {
  customerId?: string;
  newCustomer?: { firstName: string; lastName: string; phone: string; email?: string };
  serviceIds?: string[];
  source: "WALK_IN" | "PHONE" | "WHATSAPP";
  notes?: string;
}): Promise<InquiryRecord> {
  return request<InquiryRecord>("/inquiries", { method: "POST", body: JSON.stringify(input) });
}

/**
 * Close, reopen, or record that it became a booking.
 *
 * Conversion is two steps on purpose: the booking is created through the
 * ordinary availability engine first, and only then linked here. There is no
 * second booking path.
 */
export function updateInquiry(
  id: string,
  patch: { status: InquiryStatusValue; appointmentId?: string },
): Promise<InquiryRecord> {
  return request<InquiryRecord>(`/inquiries/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/* ------------------------------------------------------------------ *
 * Reports
 *
 * One request returns every panel, so all of them describe the same
 * period. Owner and manager only — the server enforces it.
 * ------------------------------------------------------------------ */

export interface StaffReportRow {
  staffId: string;
  name: string;
  completed: number;
  bookedMinutes: number;
  rosteredMinutes: number;
  /** Null when they were not rostered at all — not 0%, which reads as idle. */
  utilisationPercent: number | null;
  averageRating: number | null;
  ratingCount: number;
  /** Days in the range they checked in later than their grace period allowed. */
  lateArrivals: number;
}

export interface ServiceCount {
  name: string;
  count: number;
  revenueCents: number;
}

export interface CollectionReport {
  totalCents: number;
  byMethod: Array<{ method: PaymentMethod; amountCents: number; count: number }>;
  refundedCents: number;
  netCents: number;
}

export interface CustomerSpendRow {
  customerId: string;
  name: string;
  phone: string;
  totalCents: number;
  visits: number;
}

export interface LapsedCustomerRow {
  customerId: string;
  name: string;
  phone: string;
  lastVisitDate: string;
  daysSince: number;
  usualServices: string[];
}

/** `dayOfWeek` is Mon=0..Sun=6, matching the rota's own numbering. */
export interface BusyHourCell {
  dayOfWeek: number;
  hour: number;
  count: number;
}

export interface FunnelReport {
  bookingsCreated: number;
  inquiriesLogged: number;
  inquiriesConverted: number;
  inquiriesClosed: number;
  inquiriesOpen: number;
  conversionPercent: number | null;
  medianDaysToResolve: number | null;
}

export interface DepositBucket {
  concluded: number;
  noShows: number;
  noShowPercent: number | null;
}

export interface LossReport {
  noShows: number;
  cancellations: number;
  lostRevenueCents: number;
  byStaff: Array<{
    staffId: string;
    name: string;
    noShows: number;
    cancellations: number;
    lostCents: number;
  }>;
  byHour: Array<{ hour: number; noShows: number; cancellations: number }>;
  depositEffect: { withDeposit: DepositBucket; withoutDeposit: DepositBucket };
}

export interface TakingsLossSummary {
  noShows: number;
  cancellations: number;
  lostRevenueCents: number;
}

/**
 * Each field is one of the seven report panels, and `null` means it's locked
 * on this salon's plan — never "empty this period". The server never sends
 * real numbers for a locked panel in the first place (see `ReportsService`).
 */
export interface ReportsSummary {
  range: { from: string; to: string; days: number };
  takings: { collection: CollectionReport; losses: TakingsLossSummary } | null;
  staff: StaffReportRow[] | null;
  services: { popular: ServiceCount[]; byRevenue: ServiceCount[] } | null;
  busyHours: BusyHourCell[] | null;
  lapsedCustomers: LapsedCustomerRow[] | null;
  customerSpend: { topSpenders: CustomerSpendRow[]; frequent: CustomerSpendRow[] } | null;
  funnelLosses: { funnel: FunnelReport; losses: LossReport } | null;
}

export function fetchReports(range: { from: string; to: string }): Promise<ReportsSummary> {
  const qs = new URLSearchParams({ from: range.from, to: range.to });
  return request<ReportsSummary>(`/reports?${qs.toString()}`);
}

/* ------------------------------------------------------------------ *
 * Service offers
 *
 * One standing offer per service. Priced by the appointment's slot, not
 * the moment of booking — so what a customer is quoted depends on when
 * they are coming in, not when they tapped Book.
 * ------------------------------------------------------------------ */

export type DiscountTypeValue = "FIXED" | "PERCENT";

/** 0=Mon..6=Sun, matching the rota. `endMin` is exclusive and may be 1440. */
export interface DiscountWindow {
  dayOfWeek: number;
  startMin: number;
  endMin: number;
}

export interface ServiceDiscountView {
  id: string;
  type: DiscountTypeValue;
  /** Cents when FIXED, whole percent when PERCENT. */
  value: number;
  startDate: string;
  endDate: string;
  label: string | null;
  active: boolean;
  /** Empty means all day, every day inside the date range. */
  windows: DiscountWindow[];
}

export interface SetServiceDiscountInput {
  type: DiscountTypeValue;
  value: number;
  startDate: string;
  endDate: string;
  label?: string;
  windows?: DiscountWindow[];
}

/** PUT, not PATCH: an offer is replaced whole. Half of one means nothing. */
export function setServiceDiscount(
  serviceId: string,
  input: SetServiceDiscountInput,
): Promise<ServiceItem> {
  return request<ServiceItem>(`/services/${serviceId}/discount`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function removeServiceDiscount(serviceId: string): Promise<ServiceItem> {
  return request<ServiceItem>(`/services/${serviceId}/discount`, { method: "DELETE" });
}

/**
 * A discount on the bill, applied at the desk.
 *
 * Distinct from a service offer: that is configuration the salon publishes,
 * this is a judgement about one customer, so it carries a reason. Send
 * `value: 0` to remove it. The cap is enforced server-side — a 403 with
 * `DISCOUNT_CAP_EXCEEDED` means it needs an owner or manager.
 */
export function setAppointmentDiscount(
  appointmentId: string,
  input: { type: DiscountTypeValue; value: number; reason?: string },
): Promise<AppointmentDetail> {
  return request<AppointmentDetail>(`/appointments/${appointmentId}/discount`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/* ------------------------------------------------------------------ *
 * Invoices
 *
 * Frozen documents. A correction issues a new version rather than
 * editing the old one, so an appointment can have several and exactly
 * one of them is live.
 * ------------------------------------------------------------------ */

export interface InvoiceSnapshotLine {
  name: string;
  durationMin: number;
  listPriceCents: number;
  discountCents: number;
  discountLabel: string | null;
  chargedCents: number;
}

export interface InvoiceSnapshot {
  salon: {
    name: string;
    address: string | null;
    city: string | null;
    phone: string | null;
    businessRegNo: string | null;
    logoUrl: string | null;
  };
  customer: { name: string; phone: string; email: string | null };
  appointment: { bookingReference: string; startTime: string; staffName: string };
  lines: InvoiceSnapshotLine[];
  billDiscount: { type: string; value: number; cents: number; reason: string | null } | null;
  payments: Array<{ method: string; amountCents: number; recordedAt: string | null }>;
}

export interface InvoiceRecord {
  id: string;
  number: string;
  version: number;
  supersedesInvoiceId: string | null;
  status: "ISSUED" | "SUPERSEDED";
  subtotalCents: number;
  serviceDiscountCents: number;
  billDiscountCents: number;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  currency: string;
  snapshot: InvoiceSnapshot;
  lastSentAt: string | null;
  lastSentTo: string | null;
  issuedAt: string;
}

/** Newest version first. */
export function fetchInvoices(appointmentId: string): Promise<InvoiceRecord[]> {
  return request<InvoiceRecord[]>(`/appointments/${appointmentId}/invoices`);
}

/** Issues, or supersedes the live one if the bill has moved since. */
export function issueInvoice(appointmentId: string): Promise<InvoiceRecord> {
  return request<InvoiceRecord>(`/appointments/${appointmentId}/invoices`, { method: "POST" });
}

export function sendInvoice(invoiceId: string, email: string): Promise<InvoiceRecord> {
  return request<InvoiceRecord>(`/invoices/${invoiceId}/send`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

/* ------------------------------------------------------------ attendance */

export type AttendanceDayStatus =
  | "PRESENT"
  | "MISSING_CHECK_OUT"
  | "CLOSED"
  | "ON_LEAVE"
  | "DAY_OFF"
  | "EXPECTED"
  | "ABSENT";

export interface AttendanceDayView {
  id: string | null;
  staffId: string;
  staffName: string;
  workDate: string;
  status: AttendanceDayStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  expectedStartMin: number | null;
  expectedEndMin: number | null;
  lateMinutes: number;
  earlyMinutes: number;
  workedMinutes: number | null;
  selfRecorded: boolean;
  recordedByName: string | null;
}

export interface AttendanceStaffSummary {
  staffId: string;
  staffName: string;
  presentDays: number;
  lateDays: number;
  lateMinutes: number;
  earlyDays: number;
  earlyMinutes: number;
  absentDays: number;
  missingCheckOutDays: number;
  leaveDays: number;
  workedMinutes: number;
  rosteredDays: number;
}

export interface AttendanceReport {
  range: { from: string; to: string; days: number };
  summary: AttendanceStaffSummary[];
  days: AttendanceDayView[];
}

/** Omitting `staffId` punches the caller's own login. */
export function attendanceCheckIn(staffId?: string): Promise<AttendanceDayView> {
  return request<AttendanceDayView>("/attendance/check-in", {
    method: "POST",
    body: JSON.stringify(staffId ? { staffId } : {}),
  });
}

export function attendanceCheckOut(staffId?: string): Promise<AttendanceDayView> {
  return request<AttendanceDayView>("/attendance/check-out", {
    method: "POST",
    body: JSON.stringify(staffId ? { staffId } : {}),
  });
}

/** Everyone, for one day — the front desk's board. Defaults to today. */
export function fetchAttendanceBoard(date?: string): Promise<{ date: string; rows: AttendanceDayView[] }> {
  const qs = date ? `?date=${date}` : "";
  return request(`/attendance/board${qs}`);
}

/** A range across every staff member — OWNER/MANAGER only. */
export function fetchAttendanceReport(query: { from?: string; to?: string; staffId?: string }): Promise<AttendanceReport> {
  const params = new URLSearchParams(
    Object.entries(query).filter((e): e is [string, string] => Boolean(e[1])),
  );
  const qs = params.toString();
  return request(`/attendance${qs ? `?${qs}` : ""}`);
}

/** The caller's own attendance — any staff login. */
export function fetchMyAttendance(query: { from?: string; to?: string } = {}): Promise<AttendanceReport> {
  const params = new URLSearchParams(
    Object.entries(query).filter((e): e is [string, string] => Boolean(e[1])),
  );
  const qs = params.toString();
  return request(`/attendance/me${qs ? `?${qs}` : ""}`);
}

export type AttendanceEditRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN";

export interface AttendanceEditRequestView {
  id: string;
  staffId: string;
  staffName: string;
  workDate: string;
  previousCheckInAt: string | null;
  previousCheckOutAt: string | null;
  requestedCheckInAt: string | null;
  requestedCheckOutAt: string | null;
  reason: string;
  status: AttendanceEditRequestStatus;
  requestedByName: string;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export interface CreateAttendanceEditRequestInput {
  staffId?: string;
  workDate: string;
  requestedCheckInAt?: string;
  requestedCheckOutAt?: string;
  reason: string;
}

export function requestAttendanceEdit(
  input: CreateAttendanceEditRequestInput,
): Promise<AttendanceEditRequestView> {
  return request<AttendanceEditRequestView>("/attendance/edit-requests", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** The manager's queue — APPROVE_ATTENDANCE_EDIT only. */
export function fetchAttendanceEditRequests(query: {
  status?: AttendanceEditRequestStatus;
  staffId?: string;
} = {}): Promise<AttendanceEditRequestView[]> {
  const params = new URLSearchParams(
    Object.entries(query).filter((e): e is [string, string] => Boolean(e[1])),
  );
  const qs = params.toString();
  return request(`/attendance/edit-requests${qs ? `?${qs}` : ""}`);
}

/** The caller's own filed requests, and their outcomes. */
export function fetchMyAttendanceEditRequests(): Promise<AttendanceEditRequestView[]> {
  return request<AttendanceEditRequestView[]>("/attendance/edit-requests/me");
}

export function decideAttendanceEditRequest(
  id: string,
  decision: { status: "APPROVED" | "REJECTED"; note?: string },
): Promise<AttendanceEditRequestView> {
  return request<AttendanceEditRequestView>(`/attendance/edit-requests/${id}`, {
    method: "PATCH",
    body: JSON.stringify(decision),
  });
}

export function withdrawAttendanceEditRequest(id: string): Promise<{ withdrawn: true }> {
  return request<{ withdrawn: true }>(`/attendance/edit-requests/${id}`, { method: "DELETE" });
}

/* -------------------------------------------------------------- incentives */

export interface IncentivePlanServiceRate {
  serviceId: string;
  serviceName: string;
  ratePercent: number;
}

export interface IncentivePlanView {
  id: string;
  name: string;
  baseCommissionPercent: number | null;
  perJobAmountCents: number | null;
  monthlyTargetCents: number | null;
  tierBonusPercent: number | null;
  active: boolean;
  serviceRates: IncentivePlanServiceRate[];
}

export interface UpsertIncentivePlanInput {
  name: string;
  baseCommissionPercent?: number;
  perJobAmountCents?: number;
  monthlyTargetCents?: number;
  tierBonusPercent?: number;
  serviceRates?: Array<{ serviceId: string; ratePercent: number }>;
}

export function fetchIncentivePlans(): Promise<IncentivePlanView[]> {
  return request<IncentivePlanView[]>("/incentive-plans");
}

export function createIncentivePlan(input: UpsertIncentivePlanInput): Promise<IncentivePlanView> {
  return request<IncentivePlanView>("/incentive-plans", { method: "POST", body: JSON.stringify(input) });
}

export function updateIncentivePlan(id: string, input: UpsertIncentivePlanInput): Promise<IncentivePlanView> {
  return request<IncentivePlanView>(`/incentive-plans/${id}`, { method: "PUT", body: JSON.stringify(input) });
}

export interface IncentivePreviewRow {
  staffId: string;
  staffName: string;
  planId: string;
  planName: string;
  revenueCents: number;
  commissionCents: number;
  jobsCompleted: number;
  perJobCents: number;
  tierBonusCents: number;
  totalCents: number;
}

/** The live, unsaved figure for a range — what a payout would total if run right now. OWNER/MANAGER only. */
export function fetchIncentivePreview(query: { from: string; to: string; staffId?: string }): Promise<IncentivePreviewRow[]> {
  const params = new URLSearchParams(
    Object.entries(query).filter((e): e is [string, string] => Boolean(e[1])),
  );
  return request(`/incentive-plans/preview?${params.toString()}`);
}

/** The caller's own live estimate for the range — any staff login with a plan assigned. */
export function fetchMyIncentivePreview(query: { from: string; to: string }): Promise<IncentivePreviewRow | null> {
  const params = new URLSearchParams(query);
  return request(`/incentive-plans/me/preview?${params.toString()}`);
}

export type IncentivePayoutStatus = "FINALISED" | "PAID" | "VOID";

export interface IncentivePayoutSnapshot {
  plan: {
    name: string;
    baseCommissionPercent: number | null;
    perJobAmountCents: number | null;
    monthlyTargetCents: number | null;
    tierBonusPercent: number | null;
    serviceRates: IncentivePlanServiceRate[];
  };
  lines: Array<{
    appointmentId: string;
    bookingReference: string;
    serviceId: string | null;
    serviceName: string;
    chargedCents: number;
    receivedCents: number;
  }>;
}

export interface IncentivePayoutView {
  id: string;
  staffId: string;
  staffName: string;
  planId: string | null;
  planName: string;
  periodStart: string;
  periodEnd: string;
  status: IncentivePayoutStatus;
  revenueCents: number;
  commissionCents: number;
  jobsCompleted: number;
  perJobCents: number;
  tierBonusCents: number;
  totalCents: number;
  snapshot: IncentivePayoutSnapshot;
  supersedesPayoutId: string | null;
  finalisedByName: string;
  paidAt: string | null;
  paidByName: string | null;
  voidedAt: string | null;
  voidedByName: string | null;
  voidReason: string | null;
  createdAt: string;
}

export function fetchIncentivePayouts(query: {
  staffId?: string;
  status?: IncentivePayoutStatus;
} = {}): Promise<IncentivePayoutView[]> {
  const params = new URLSearchParams(
    Object.entries(query).filter((e): e is [string, string] => Boolean(e[1])),
  );
  const qs = params.toString();
  return request(`/incentive-payouts${qs ? `?${qs}` : ""}`);
}

/** The caller's own payout history — FINALISED and PAID, never a voided correction. */
export function fetchMyIncentivePayouts(): Promise<IncentivePayoutView[]> {
  return request<IncentivePayoutView[]>("/incentive-payouts/me");
}

/** Finalise one staff member's figure for a period. Idempotent if the figure hasn't moved since the last run. */
export function runIncentivePayout(input: {
  staffId: string;
  periodStart: string;
  periodEnd: string;
}): Promise<IncentivePayoutView> {
  return request<IncentivePayoutView>("/incentive-payouts", { method: "POST", body: JSON.stringify(input) });
}

export function markIncentivePayoutPaid(id: string): Promise<IncentivePayoutView> {
  return request<IncentivePayoutView>(`/incentive-payouts/${id}/paid`, { method: "PATCH" });
}

export function voidIncentivePayout(id: string, reason: string): Promise<IncentivePayoutView> {
  return request<IncentivePayoutView>(`/incentive-payouts/${id}/void`, {
    method: "PATCH",
    body: JSON.stringify({ reason }),
  });
}

/* -----------------------------------------------------------------------
 * Gift cards
 *
 * Stored value a salon sold, redeemable across one or more visits until the
 * balance runs out. Creating one always records how it was paid for
 * (cash/bank/card); redeeming it is just another payment method on the
 * existing appointment-payment endpoint (`recordPayment`, above).
 * ------------------------------------------------------------------ */

export type GiftCardStatus = "ACTIVE" | "REDEEMED" | "VOID";

export interface GiftCardView {
  id: string;
  code: string;
  initialValueCents: number;
  remainingBalanceCents: number;
  currency: string;
  purchaser: { name: string; phone: string } | null;
  recipientName: string | null;
  recipientPhone: string | null;
  recipientEmail: string | null;
  message: string | null;
  expiresAt: string;
  expired: boolean;
  status: GiftCardStatus;
  issuedByName: string | null;
  issuedAt: string;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface CreateGiftCardInput {
  amountCents: number;
  expiresAt: string;
  purchaser: { firstName: string; lastName: string; phone: string; email?: string };
  recipientName?: string;
  recipientPhone?: string;
  recipientEmail?: string;
  message?: string;
  paymentMethod: "CASH" | "BANK_TRANSFER" | "CARD_CAPTURED";
}

export function fetchGiftCards(params: { q?: string; limit?: number; offset?: number } = {}): Promise<GiftCardView[]> {
  const qs = new URLSearchParams();
  if (params.q) {
    qs.set("q", params.q);
  }
  qs.set("limit", String(params.limit ?? 100));
  qs.set("offset", String(params.offset ?? 0));
  return request<GiftCardView[]>(`/gift-cards?${qs.toString()}`);
}

export function fetchGiftCard(id: string): Promise<GiftCardView> {
  return request<GiftCardView>(`/gift-cards/${id}`);
}

export function createGiftCard(input: CreateGiftCardInput, idempotencyKey: string): Promise<GiftCardView> {
  return request<GiftCardView>("/gift-cards", { method: "POST", body: JSON.stringify(input), idempotencyKey });
}

export function voidGiftCard(id: string, reason: string): Promise<GiftCardView> {
  return request<GiftCardView>(`/gift-cards/${id}/void`, { method: "PATCH", body: JSON.stringify({ reason }) });
}
