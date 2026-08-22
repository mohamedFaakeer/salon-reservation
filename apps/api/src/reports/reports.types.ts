import type { PaymentMethod } from "@salon/shared";

/**
 * One stylist's period. Performance, honesty about it, and how customers rated
 * the work — kept on one row because they are read together: a high job count
 * with low utilisation and a poor rating tells a different story than any one
 * of the three alone.
 */
export interface StaffReportRow {
  staffId: string;
  name: string;
  /** COMPLETED appointments whose date falls in the range. */
  completed: number;
  /** Minutes of non-cancelled appointments booked into the range. */
  bookedMinutes: number;
  /** Minutes the rota says they were available, less leave and salon closures. */
  rosteredMinutes: number;
  /**
   * bookedMinutes / rosteredMinutes as a percent. Null when they were not
   * rostered at all in the range — dividing by zero would read as 0% busy,
   * which blames someone for a week they were never scheduled to work.
   */
  utilisationPercent: number | null;
  /** Mean score of work done in this range. Null when nothing was rated. */
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
  /** Money received in the range. Never money billed. */
  totalCents: number;
  byMethod: Array<{ method: PaymentMethod; amountCents: number; count: number }>;
  /** Refunds issued in the range, reported separately rather than netted off. */
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
  /** What they used to book, so the call has an opening line. */
  usualServices: string[];
}

/** One cell of the heatmap. `dayOfWeek` is Mon=0..Sun=6, matching the rota. */
export interface BusyHourCell {
  dayOfWeek: number;
  hour: number;
  count: number;
}

export interface FunnelReport {
  /** Bookings that *arrived* in the range, not bookings that happen in it. */
  bookingsCreated: number;
  inquiriesLogged: number;
  inquiriesConverted: number;
  inquiriesClosed: number;
  inquiriesOpen: number;
  /** Converted / logged, as a percent. Null when nothing was logged. */
  conversionPercent: number | null;
  /** How long a resolved inquiry sat before it was dealt with. Null if none were. */
  medianDaysToResolve: number | null;
}

export interface LossReport {
  noShows: number;
  cancellations: number;
  /** Value of the appointments that did not happen, at their booked totals. */
  lostRevenueCents: number;
  byStaff: Array<{ staffId: string; name: string; noShows: number; cancellations: number; lostCents: number }>;
  byHour: Array<{ hour: number; noShows: number; cancellations: number }>;
  /**
   * Did taking money up front change the outcome?
   *
   * Both sides count only appointments that reached a conclusion, so a rate of
   * null means nothing concluded in that group — not a perfect record.
   */
  depositEffect: {
    withDeposit: { concluded: number; noShows: number; noShowPercent: number | null };
    withoutDeposit: { concluded: number; noShows: number; noShowPercent: number | null };
  };
}

/** The slice of `LossReport` the Takings panel actually reads — never the staff/hour/deposit breakdown, which belongs to the Funnel panel alone. */
export interface TakingsLossSummary {
  noShows: number;
  cancellations: number;
  lostRevenueCents: number;
}

/**
 * Each field is one of the seven panels the Reports screen is built from
 * (`ReportPanelKey`, `@salon/shared`), and `null` means "locked" — not "empty
 * this period". A locked panel's real numbers are never computed for a
 * request that can't see them (see `ReportsService.summary`), so `null` here
 * is the only thing a Lite tenant's browser ever receives for it.
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
