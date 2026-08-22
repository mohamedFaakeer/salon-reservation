import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor injection
// via design:paramtypes metadata at runtime; `import type` would erase it.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Repository } from "typeorm";
import { AppointmentStatus, InquiryStatus, PaymentStatus, RefundStatus, type ReportPanelKey } from "@salon/shared";
import { Appointment } from "../entities/appointment.entity";
import { AppointmentServiceLine } from "../entities/appointment-service.entity";
import { AttendanceDay } from "../entities/attendance-day.entity";
import { Customer } from "../entities/customer.entity";
import { Closure } from "../entities/closure.entity";
import { Inquiry } from "../entities/inquiry.entity";
import { Payment } from "../entities/payment.entity";
import { Rating } from "../entities/rating.entity";
import { Refund } from "../entities/refund.entity";
import { Staff } from "../entities/staff.entity";
import { StaffLeave } from "../entities/staff-leave.entity";
import { WorkingSchedule } from "../entities/working-schedule.entity";
import { datesIn, resolveDateRange, utcWindowFor } from "../common/date-range";
import {
  computeRosteredMinutes,
  daysApart,
  median,
  percentOrNull,
  rankServices,
  round1,
  shiftDate,
  tallyLosses,
  type LossRow,
} from "./reports.math";
import type {
  BusyHourCell,
  CollectionReport,
  CustomerSpendRow,
  FunnelReport,
  LapsedCustomerRow,
  LossReport,
  ReportsSummary,
  ServiceCount,
  StaffReportRow,
} from "./reports.types";

/**
 * Statuses that mean the appointment did not happen. Excluded wherever the
 * question is "what work was done" or "what was booked" — a cancelled booking
 * is not demand the salon served.
 */
const DID_NOT_HAPPEN: AppointmentStatus[] = [
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
  AppointmentStatus.RESCHEDULED,
  AppointmentStatus.EXPIRED,
];

/** Never a real booking: an unpaid attempt that expires on its own. */
const NOT_A_BOOKING: AppointmentStatus[] = [
  AppointmentStatus.PENDING_PAYMENT,
  AppointmentStatus.EXPIRED,
];

/** How long since a visit before somebody counts as lapsed. */
const LAPSED_AFTER_DAYS = 60;
const TOP_N = 5;
const LIST_N = 10;
const LAPSED_N = 25;

/**
 * Every number on the Reports screen.
 *
 * One method, one round trip, one range. Twelve endpoints would mean twelve
 * spinners and — worse — twelve chances for the panels to describe different
 * periods, which is how a report quietly lies.
 *
 * Two rules run through all of it. Money is always money *received*
 * (`PaymentStatus.SUCCESS`), never money billed, because a completed
 * appointment nobody paid for is not revenue. And any rate whose denominator
 * is zero returns null rather than 0, because zero is a claim: "0% no-shows"
 * reads as a perfect record when it should read "nothing has concluded yet".
 */
@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
    @InjectRepository(AppointmentServiceLine) private readonly lines: Repository<AppointmentServiceLine>,
    @InjectRepository(AttendanceDay) private readonly attendanceDays: Repository<AttendanceDay>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Refund) private readonly refunds: Repository<Refund>,
    @InjectRepository(Rating) private readonly ratings: Repository<Rating>,
    @InjectRepository(Staff) private readonly staff: Repository<Staff>,
    @InjectRepository(WorkingSchedule) private readonly schedules: Repository<WorkingSchedule>,
    @InjectRepository(StaffLeave) private readonly leave: Repository<StaffLeave>,
    @InjectRepository(Closure) private readonly closures: Repository<Closure>,
    @InjectRepository(Inquiry) private readonly inquiries: Repository<Inquiry>,
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
  ) {}

  /**
   * `panels` is the tenant's resolved Lite/Pro entitlement for each of the
   * seven panels below (`TenantGuard` → `resolveReportPanels`). A locked
   * panel is never computed at all, not merely omitted from the response —
   * the only thing that can leak over the wire is a number that was never
   * queried in the first place. Missing entirely (should not happen once
   * `TenantGuard` has run) defaults every panel open, matching PRO.
   */
  async summary(
    tenantId: string,
    from: string | undefined,
    to: string | undefined,
    panels: Record<ReportPanelKey, boolean> | undefined,
  ): Promise<ReportsSummary> {
    const range = resolveDateRange(from, to, new Date());
    const on = (key: ReportPanelKey): boolean => panels?.[key] ?? true;
    const needsLosses = on("takings") || on("funnelLosses");

    const [staff, services, collection, topSpenders, frequent, lapsed, busyHours, funnel, losses] =
      await Promise.all([
        on("staff") ? this.staffRows(tenantId, range) : Promise.resolve(null),
        on("services") ? this.serviceRows(tenantId, range) : Promise.resolve(null),
        on("takings") ? this.collectionRows(tenantId, range) : Promise.resolve(null),
        on("customerSpend") ? this.topSpenders(tenantId, range) : Promise.resolve(null),
        on("customerSpend") ? this.frequentCustomers(tenantId, range) : Promise.resolve(null),
        on("lapsedCustomers") ? this.lapsedCustomers(tenantId, range) : Promise.resolve(null),
        on("busyHours") ? this.busyHours(tenantId, range) : Promise.resolve(null),
        on("funnelLosses") ? this.funnel(tenantId, range) : Promise.resolve(null),
        needsLosses ? this.losses(tenantId, range) : Promise.resolve(null),
      ]);

    return {
      range: { from: range.from, to: range.to, days: range.days },
      takings: collection && losses ? { collection, losses } : null,
      staff,
      services,
      busyHours,
      lapsedCustomers: lapsed,
      customerSpend: topSpenders && frequent ? { topSpenders, frequent } : null,
      funnelLosses: funnel && losses ? { funnel, losses } : null,
    };
  }

  /**
   * Per stylist: jobs done, how full their diary was, and how it was rated.
   *
   * Utilisation is here because a raw completed-job count punishes whoever
   * takes the long work — one colour treatment is three haircuts — and a
   * league table that does that is worse than no league table.
   */
  private async staffRows(tenantId: string, range: Range): Promise<StaffReportRow[]> {
    const [staffRows, worked, rated, rostered, late] = await Promise.all([
      this.staff.find({ where: { tenantId }, order: { name: "ASC" } }),

      this.appointments
        .createQueryBuilder("a")
        .select('a."staffId"', "staffId")
        .addSelect(`COUNT(*) FILTER (WHERE a.status = '${AppointmentStatus.COMPLETED}')::int`, "completed")
        .addSelect(
          `COALESCE(SUM(EXTRACT(EPOCH FROM (a."endTime" - a."startTime")) / 60)
             FILTER (WHERE a.status NOT IN (${quoted(DID_NOT_HAPPEN)})), 0)::int`,
          "bookedMinutes",
        )
        .where('a."tenantId" = :tenantId', { tenantId })
        .andWhere('a."appointmentDate" BETWEEN :from AND :to', range)
        .groupBy('a."staffId"')
        .getRawMany<{ staffId: string; completed: number; bookedMinutes: number }>(),

      // Scoped to the work done in this range, not to ratings submitted in it:
      // "how was the work you did that week received" is the useful question,
      // and a rating left late still describes the visit it was about.
      this.ratings
        .createQueryBuilder("r")
        .innerJoin(Appointment, "a", 'a.id = r."appointmentId"')
        .select('r."staffId"', "staffId")
        .addSelect("AVG(r.score)", "average")
        .addSelect("COUNT(*)::int", "count")
        .where('r."tenantId" = :tenantId', { tenantId })
        .andWhere('a."appointmentDate" BETWEEN :from AND :to', range)
        .groupBy('r."staffId"')
        .getRawMany<{ staffId: string; average: string; count: number }>(),

      this.rosteredMinutes(tenantId, range),

      this.attendanceDays
        .createQueryBuilder("d")
        .select('d."staffId"', "staffId")
        .addSelect("COUNT(*)::int", "count")
        .where('d."tenantId" = :tenantId', { tenantId })
        .andWhere('d."workDate" BETWEEN :from AND :to', range)
        .andWhere('d."lateMinutes" > 0')
        .groupBy('d."staffId"')
        .getRawMany<{ staffId: string; count: number }>(),
    ]);

    const workedBy = new Map(worked.map((r) => [r.staffId, r]));
    const ratedBy = new Map(rated.map((r) => [r.staffId, r]));
    const lateBy = new Map(late.map((r) => [r.staffId, Number(r.count)]));

    return staffRows.map((s) => {
      const w = workedBy.get(s.id);
      const r = ratedBy.get(s.id);
      const bookedMinutes = Number(w?.bookedMinutes ?? 0);
      const rosteredMinutes = rostered.get(s.id) ?? 0;
      const ratingCount = Number(r?.count ?? 0);

      return {
        staffId: s.id,
        name: s.name,
        completed: Number(w?.completed ?? 0),
        bookedMinutes,
        rosteredMinutes,
        utilisationPercent:
          rosteredMinutes === 0 ? null : Math.round((bookedMinutes / rosteredMinutes) * 100),
        averageRating: ratingCount === 0 ? null : round1(Number(r?.average)),
        ratingCount,
        lateArrivals: lateBy.get(s.id) ?? 0,
      };
    });
  }

  /**
   * Loads what the rota, leave and closures say, then hands the arithmetic to
   * `computeRosteredMinutes`. Kept in TypeScript rather than SQL because the
   * rota is weekday templates that leave and closures punch holes in, and the
   * equivalent generate_series join is not something anyone could safely
   * change later.
   */
  private async rosteredMinutes(tenantId: string, range: Range): Promise<Map<string, number>> {
    const [schedules, leaves, closures] = await Promise.all([
      this.schedules.find({ where: { tenantId } }),
      this.leave.find({ where: { tenantId } }),
      this.closures.find({ where: { tenantId } }),
    ]);

    return computeRosteredMinutes(datesIn(range), schedules, leaves, closures);
  }

  /**
   * What people booked, by count and by money.
   *
   * Both lists come from one query and are only sorted differently, because
   * the interesting thing is where they disagree: a cheap fringe trim can top
   * the popularity list while contributing almost nothing.
   *
   * Names come from the line's snapshot, never the current Service row — a
   * service renamed since must still read as what was sold.
   */
  private async serviceRows(
    tenantId: string,
    range: Range,
  ): Promise<{ popular: ServiceCount[]; byRevenue: ServiceCount[] }> {
    const rows = await this.lines
      .createQueryBuilder("l")
      .innerJoin(Appointment, "a", 'a.id = l."appointmentId"')
      .select('l."nameSnapshot"', "name")
      .addSelect("COUNT(*)::int", "count")
      // Net of the service discount. Summing list prices would report revenue
      // the salon never took the moment any offer ran.
      .addSelect(
        'COALESCE(SUM(l."priceCentsSnapshot" - l."discountCentsSnapshot"), 0)::int',
        "revenueCents",
      )
      .where('a."tenantId" = :tenantId', { tenantId })
      .andWhere('a."appointmentDate" BETWEEN :from AND :to', range)
      .andWhere("l.status = :active", { active: "ACTIVE" })
      .andWhere(`a.status NOT IN (${quoted(DID_NOT_HAPPEN)})`)
      .groupBy('l."nameSnapshot"')
      .getRawMany<{ name: string; count: number; revenueCents: number }>();

    const all: ServiceCount[] = rows.map((r) => ({
      name: r.name,
      count: Number(r.count),
      revenueCents: Number(r.revenueCents),
    }));

    return rankServices(all, TOP_N);
  }

  /**
   * Money in, by how it arrived.
   *
   * Filtered on when the payment was *taken* rather than when its appointment
   * happens: a deposit paid today for December is today's cash. Payments carry
   * timestamps, so the range is converted to a real UTC window first —
   * comparing a timestamptz to a bare date silently uses UTC midnight, which
   * is 05:30 in Colombo, and would file a 4am payment under the day before.
   *
   * Refunds are reported beside the total rather than subtracted from it. Both
   * numbers are real and answer different questions: what came through the
   * till, and what went back out.
   */
  private async collectionRows(tenantId: string, range: Range): Promise<CollectionReport> {
    const window = utcWindowFor(range);

    const [byMethod, refunded] = await Promise.all([
      this.payments
        .createQueryBuilder("p")
        .select("p.method", "method")
        .addSelect('COALESCE(SUM(p."amountCents"), 0)::int', "amountCents")
        .addSelect("COUNT(*)::int", "count")
        .where('p."tenantId" = :tenantId', { tenantId })
        .andWhere("p.state = :state", { state: PaymentStatus.SUCCESS })
        .andWhere('COALESCE(p."recordedAt", p."createdAt") >= :startUtc', window)
        .andWhere('COALESCE(p."recordedAt", p."createdAt") < :endUtc', window)
        .groupBy("p.method")
        .getRawMany<{ method: string; amountCents: number; count: number }>(),

      // `refund` carries no tenantId of its own — unlike every other table
      // here, it is scoped through the payment it reverses. Filtering it
      // directly is not merely wrong, it is a cross-tenant read, so the join
      // is what enforces rule §7 for this query.
      this.refunds
        .createQueryBuilder("r")
        .innerJoin(Payment, "p", 'p.id = r."paymentId"')
        .select('COALESCE(SUM(r."amountCents"), 0)::int', "total")
        .where('p."tenantId" = :tenantId', { tenantId })
        .andWhere("r.state = :state", { state: RefundStatus.SUCCEEDED })
        .andWhere('r."createdAt" >= :startUtc AND r."createdAt" < :endUtc', window)
        .getRawOne<{ total: number }>(),
    ]);

    const methods = byMethod.map((r) => ({
      method: r.method as CollectionReport["byMethod"][number]["method"],
      amountCents: Number(r.amountCents),
      count: Number(r.count),
    }));
    const totalCents = methods.reduce((sum, m) => sum + m.amountCents, 0);
    const refundedCents = Number(refunded?.total ?? 0);

    return {
      totalCents,
      byMethod: methods.sort((a, b) => b.amountCents - a.amountCents),
      refundedCents,
      netCents: totalCents - refundedCents,
    };
  }

  /** Who spent the most. Money received in the range, per customer. */
  private async topSpenders(tenantId: string, range: Range): Promise<CustomerSpendRow[]> {
    const window = utcWindowFor(range);

    const rows = await this.payments
      .createQueryBuilder("p")
      .innerJoin(Customer, "c", 'c.id = p."customerId"')
      .select('p."customerId"', "customerId")
      .addSelect(`(c."firstName" || ' ' || c."lastName")`, "name")
      .addSelect("c.phone", "phone")
      .addSelect('COALESCE(SUM(p."amountCents"), 0)::int', "totalCents")
      .addSelect('COUNT(DISTINCT p."appointmentId")::int', "visits")
      .where('p."tenantId" = :tenantId', { tenantId })
      .andWhere("p.state = :state", { state: PaymentStatus.SUCCESS })
      .andWhere('COALESCE(p."recordedAt", p."createdAt") >= :startUtc', window)
      .andWhere('COALESCE(p."recordedAt", p."createdAt") < :endUtc', window)
      .groupBy('p."customerId"')
      .addGroupBy('c."firstName"')
      .addGroupBy('c."lastName"')
      .addGroupBy("c.phone")
      .orderBy("4", "DESC")
      .limit(LIST_N)
      .getRawMany<CustomerSpendRow>();

    return rows.map(normaliseSpendRow);
  }

  /** Who came most often. Completed visits, which is a different top ten. */
  private async frequentCustomers(tenantId: string, range: Range): Promise<CustomerSpendRow[]> {
    const rows = await this.appointments
      .createQueryBuilder("a")
      .innerJoin(Customer, "c", 'c.id = a."customerId"')
      .select('a."customerId"', "customerId")
      .addSelect(`(c."firstName" || ' ' || c."lastName")`, "name")
      .addSelect("c.phone", "phone")
      .addSelect('COALESCE(SUM(a."totalCents"), 0)::int', "totalCents")
      .addSelect("COUNT(*)::int", "visits")
      .where('a."tenantId" = :tenantId', { tenantId })
      .andWhere('a."appointmentDate" BETWEEN :from AND :to', range)
      .andWhere("a.status = :completed", { completed: AppointmentStatus.COMPLETED })
      .groupBy('a."customerId"')
      .addGroupBy('c."firstName"')
      .addGroupBy('c."lastName"')
      .addGroupBy("c.phone")
      .orderBy("5", "DESC")
      .limit(LIST_N)
      .getRawMany<CustomerSpendRow>();

    return rows.map(normaliseSpendRow);
  }

  /**
   * A call list, not a chart.
   *
   * Measured as of the *end* of the range rather than today, so a historical
   * range answers "who had gone quiet by then" instead of silently reporting
   * today's answer under a date the user chose. Ordered by most recently
   * lapsed first: those are the ones most likely to still come back.
   */
  private async lapsedCustomers(tenantId: string, range: Range): Promise<LapsedCustomerRow[]> {
    const asOf = range.to;
    const cutoff = shiftDate(asOf, -LAPSED_AFTER_DAYS);

    const rows = await this.customers
      .createQueryBuilder("c")
      .innerJoin(Appointment, "a", 'a."customerId" = c.id')
      .select("c.id", "customerId")
      .addSelect(`(c."firstName" || ' ' || c."lastName")`, "name")
      .addSelect("c.phone", "phone")
      .addSelect('MAX(a."appointmentDate")', "lastVisitDate")
      .where('c."tenantId" = :tenantId', { tenantId })
      .andWhere("a.status = :completed", { completed: AppointmentStatus.COMPLETED })
      .andWhere('a."appointmentDate" <= :asOf', { asOf })
      .groupBy("c.id")
      .having('MAX(a."appointmentDate") < :cutoff', { cutoff })
      .orderBy('MAX(a."appointmentDate")', "DESC")
      .limit(LAPSED_N)
      .getRawMany<{ customerId: string; name: string; phone: string; lastVisitDate: string }>();

    if (rows.length === 0) {
      return [];
    }

    // What each of them used to book, so the call has an opening line.
    const usual = await this.lines
      .createQueryBuilder("l")
      .innerJoin(Appointment, "a", 'a.id = l."appointmentId"')
      .select('a."customerId"', "customerId")
      .addSelect('l."nameSnapshot"', "name")
      .addSelect("COUNT(*)::int", "count")
      .where('a."tenantId" = :tenantId', { tenantId })
      .andWhere('a."customerId" IN (:...ids)', { ids: rows.map((r) => r.customerId) })
      .andWhere("l.status = :active", { active: "ACTIVE" })
      .groupBy('a."customerId"')
      .addGroupBy('l."nameSnapshot"')
      .orderBy("3", "DESC")
      .getRawMany<{ customerId: string; name: string; count: number }>();

    const byCustomer = new Map<string, string[]>();
    for (const row of usual) {
      const list = byCustomer.get(row.customerId) ?? [];
      if (list.length < 3) {
        list.push(row.name);
      }
      byCustomer.set(row.customerId, list);
    }

    return rows.map((r) => ({
      customerId: r.customerId,
      name: r.name,
      phone: r.phone,
      lastVisitDate: r.lastVisitDate,
      daysSince: daysApart(r.lastVisitDate, asOf),
      usualServices: byCustomer.get(r.customerId) ?? [],
    }));
  }

  /**
   * When the salon is actually busy, as weekday × hour.
   *
   * `startTime` is a UTC instant, so it is shifted into Colombo before the
   * hour is taken — otherwise every appointment reports five and a half hours
   * early and the whole heatmap is wrong in a way that still looks plausible.
   * ISODOW gives Mon=1..Sun=7; it is shifted to Mon=0..Sun=6 to match the
   * rota's own day numbering rather than introducing a second convention.
   */
  private async busyHours(tenantId: string, range: Range): Promise<BusyHourCell[]> {
    const rows = await this.appointments
      .createQueryBuilder("a")
      .select(`EXTRACT(ISODOW FROM (a."startTime" AT TIME ZONE 'Asia/Colombo'))::int`, "dow")
      .addSelect(`EXTRACT(HOUR FROM (a."startTime" AT TIME ZONE 'Asia/Colombo'))::int`, "hour")
      .addSelect("COUNT(*)::int", "count")
      .where('a."tenantId" = :tenantId', { tenantId })
      .andWhere('a."appointmentDate" BETWEEN :from AND :to', range)
      .andWhere(`a.status NOT IN (${quoted(NOT_A_BOOKING)})`)
      .groupBy("1")
      .addGroupBy("2")
      .getRawMany<{ dow: number; hour: number; count: number }>();

    return rows.map((r) => ({
      dayOfWeek: Number(r.dow) - 1,
      hour: Number(r.hour),
      count: Number(r.count),
    }));
  }

  /**
   * Inquiries in, bookings out.
   *
   * The only panel measured on creation date rather than appointment date, and
   * deliberately so: a funnel compares things that *arrived* in the period. An
   * appointment booked in March for June is March's win, and counting it in
   * June would credit the wrong week's effort.
   */
  private async funnel(tenantId: string, range: Range): Promise<FunnelReport> {
    const window = utcWindowFor(range);

    const [bookings, inquiryRows, resolved] = await Promise.all([
      this.appointments
        .createQueryBuilder("a")
        .select("COUNT(*)::int", "count")
        .where('a."tenantId" = :tenantId', { tenantId })
        .andWhere('a."createdAt" >= :startUtc AND a."createdAt" < :endUtc', window)
        .andWhere(`a.status NOT IN (${quoted(NOT_A_BOOKING)})`)
        .getRawOne<{ count: number }>(),

      this.inquiries
        .createQueryBuilder("i")
        .select("i.status", "status")
        .addSelect("COUNT(*)::int", "count")
        .where('i."tenantId" = :tenantId', { tenantId })
        .andWhere('i."createdAt" >= :startUtc AND i."createdAt" < :endUtc', window)
        .groupBy("i.status")
        .getRawMany<{ status: InquiryStatus; count: number }>(),

      this.inquiries
        .createQueryBuilder("i")
        .select(
          `EXTRACT(EPOCH FROM (i."updatedAt" - i."createdAt")) / 86400`,
          "days",
        )
        .where('i."tenantId" = :tenantId', { tenantId })
        .andWhere('i."createdAt" >= :startUtc AND i."createdAt" < :endUtc', window)
        .andWhere("i.status <> :open", { open: InquiryStatus.OPEN })
        .getRawMany<{ days: string }>(),
    ]);

    const counts = new Map(inquiryRows.map((r) => [r.status, Number(r.count)]));
    const converted = counts.get(InquiryStatus.CONVERTED) ?? 0;
    const closed = counts.get(InquiryStatus.CLOSED) ?? 0;
    const open = counts.get(InquiryStatus.OPEN) ?? 0;
    const logged = converted + closed + open;

    return {
      bookingsCreated: Number(bookings?.count ?? 0),
      inquiriesLogged: logged,
      inquiriesConverted: converted,
      inquiriesClosed: closed,
      inquiriesOpen: open,
      conversionPercent: percentOrNull(converted, logged),
      medianDaysToResolve: median(resolved.map((r) => Number(r.days))),
    };
  }

  /**
   * What the empty chairs cost, and whether a deposit prevents them.
   *
   * `totalCents` is the appointment's own booked total, so the figure is what
   * the salon expected to take rather than a guess at replacement value.
   */
  private async losses(tenantId: string, range: Range): Promise<LossReport> {
    const rows = await this.appointments
      .createQueryBuilder("a")
      .leftJoin(Staff, "s", 's.id = a."staffId"')
      .select("a.status", "status")
      .addSelect('a."staffId"', "staffId")
      .addSelect("s.name", "staffName")
      .addSelect('a."totalCents"', "totalCents")
      .addSelect('a."advancePaidCents"', "advancePaidCents")
      .addSelect(`EXTRACT(HOUR FROM (a."startTime" AT TIME ZONE 'Asia/Colombo'))::int`, "hour")
      .where('a."tenantId" = :tenantId', { tenantId })
      .andWhere('a."appointmentDate" BETWEEN :from AND :to', range)
      .andWhere("a.status IN (:...concluded)", {
        concluded: [AppointmentStatus.COMPLETED, AppointmentStatus.NO_SHOW, AppointmentStatus.CANCELLED],
      })
      .getRawMany<LossRow>();

    return tallyLosses(rows);
  }
}

interface Range {
  from: string;
  to: string;
  days: number;
}

/**
 * Statuses inlined into SQL rather than bound.
 *
 * Safe because every value comes from the AppointmentStatus enum in this
 * repository and never from a request — but it is inlined only so the list can
 * sit inside a FILTER clause, where TypeORM's `:...param` expansion does not
 * reach. Never widen this to take caller input.
 */
function quoted(statuses: AppointmentStatus[]): string {
  return statuses.map((s) => `'${s}'`).join(", ");
}

function normaliseSpendRow(row: CustomerSpendRow): CustomerSpendRow {
  return {
    customerId: row.customerId,
    name: row.name,
    phone: row.phone,
    totalCents: Number(row.totalCents),
    visits: Number(row.visits),
  };
}

