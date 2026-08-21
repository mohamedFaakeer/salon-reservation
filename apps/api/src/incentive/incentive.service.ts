import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor injection
// via design:paramtypes metadata at runtime; `import type` would erase it.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Between, In, Repository } from "typeorm";
import { AppointmentStatus, ApiError, PaymentStatus, type IncentivePreviewQueryDto, type UpsertIncentivePlanDto } from "@salon/shared";
import { Appointment } from "../entities/appointment.entity";
import { AppointmentServiceLine } from "../entities/appointment-service.entity";
import { IncentivePlan, IncentivePlanServiceRate } from "../entities/incentive-plan.entity";
import { Payment } from "../entities/payment.entity";
import { Service } from "../entities/service.entity";
import { Staff } from "../entities/staff.entity";
import { resolveDateRange } from "../common/date-range";
import { allocateReceivedByLine, computeIncentive, type IncentiveBreakdown, type PlanComponents } from "./incentive.domain";
import type { IncentivePlanView, IncentivePreviewRow } from "./incentive.types";

/** One paid, completed line, kept detailed enough to explain a frozen payout later. */
export interface ContributingLine {
  appointmentId: string;
  bookingReference: string;
  serviceId: string | null;
  serviceName: string;
  chargedCents: number;
  receivedCents: number;
}

export interface StaffEarnings {
  staff: Staff;
  plan: IncentivePlan;
  breakdown: IncentiveBreakdown;
  lines: ContributingLine[];
}

@Injectable()
export class IncentiveService {
  constructor(
    @InjectRepository(IncentivePlan) private readonly plans: Repository<IncentivePlan>,
    @InjectRepository(IncentivePlanServiceRate) private readonly rates: Repository<IncentivePlanServiceRate>,
    @InjectRepository(Service) private readonly services: Repository<Service>,
    @InjectRepository(Staff) private readonly staff: Repository<Staff>,
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
    @InjectRepository(AppointmentServiceLine) private readonly lines: Repository<AppointmentServiceLine>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
  ) {}

  async list(tenantId: string): Promise<IncentivePlanView[]> {
    const rows = await this.plans.find({ where: { tenantId }, order: { name: "ASC" } });
    return this.toViews(rows);
  }

  async get(tenantId: string, id: string): Promise<IncentivePlanView> {
    const plan = await this.findOwned(tenantId, id);
    return (await this.toViews([plan]))[0];
  }

  async create(tenantId: string, dto: UpsertIncentivePlanDto): Promise<IncentivePlanView> {
    await this.validateServiceRates(tenantId, dto);
    const plan = await this.plans.save(
      this.plans.create({
        tenantId,
        name: dto.name.trim(),
        baseCommissionPercent: dto.baseCommissionPercent ?? null,
        perJobAmountCents: dto.perJobAmountCents ?? null,
        monthlyTargetCents: dto.monthlyTargetCents ?? null,
        tierBonusPercent: dto.tierBonusPercent ?? null,
        active: true,
      }),
    );
    await this.replaceRates(plan.id, dto.serviceRates ?? []);
    return this.get(tenantId, plan.id);
  }

  /**
   * Replaces the plan whole, same reasoning as a service discount: a plan is
   * one coherent set of components, and a partial patch invites states like
   * "target set, bonus rate silently cleared" that the database's own pairing
   * check would then have to catch as an error instead of never existing.
   */
  async update(tenantId: string, id: string, dto: UpsertIncentivePlanDto): Promise<IncentivePlanView> {
    const plan = await this.findOwned(tenantId, id);
    await this.validateServiceRates(tenantId, dto);

    plan.name = dto.name.trim();
    plan.baseCommissionPercent = dto.baseCommissionPercent ?? null;
    plan.perJobAmountCents = dto.perJobAmountCents ?? null;
    plan.monthlyTargetCents = dto.monthlyTargetCents ?? null;
    plan.tierBonusPercent = dto.tierBonusPercent ?? null;
    await this.plans.save(plan);
    await this.replaceRates(plan.id, dto.serviceRates ?? []);
    return this.get(tenantId, plan.id);
  }

  /** The live, unsaved figure for a range — what a payout would total if run right now. */
  async preview(tenantId: string, query: IncentivePreviewQueryDto): Promise<IncentivePreviewRow[]> {
    const range = resolveDateRange(query.from, query.to, new Date());
    const staffRows = await this.eligibleStaff(tenantId, query.staffId);
    const earnings = await this.computeForStaff(tenantId, staffRows, range);

    return earnings.map((e) => ({
      staffId: e.staff.id,
      staffName: e.staff.name,
      planId: e.plan.id,
      planName: e.plan.name,
      ...e.breakdown,
    }));
  }

  /**
   * The detailed version `preview` summarises — every contributing line kept
   * alongside the total, so A5's payout run has what it needs to freeze a
   * snapshot that still explains itself months later. Shared by both rather
   * than computed twice, so a preview and the payout it becomes can never
   * quietly disagree.
   */
  async earningsFor(tenantId: string, staffId: string, range: { from: string; to: string }): Promise<StaffEarnings | null> {
    const staffRows = await this.eligibleStaff(tenantId, staffId);
    const earnings = await this.computeForStaff(tenantId, staffRows, range);
    return earnings[0] ?? null;
  }

  /** The staff row behind a login, for the "me" routes — mirrors AttendanceService.ownStaffId. */
  async ownStaffId(tenantId: string, userId: string): Promise<string> {
    const own = await this.staff.findOne({ where: { tenantId, userId } });
    if (!own) {
      throw new ApiError({
        statusCode: 409,
        code: "NO_STAFF_RECORD",
        message: "This login is not linked to a staff member yet, so there are no earnings to show.",
      });
    }
    return own.id;
  }

  private async eligibleStaff(tenantId: string, staffId?: string): Promise<Staff[]> {
    return this.staff.find({
      where: staffId ? { tenantId, id: staffId } : { tenantId, active: true },
      relations: { incentivePlan: { serviceRates: { service: true } } },
    });
  }

  private async computeForStaff(
    tenantId: string,
    staffRows: Staff[],
    range: { from: string; to: string },
  ): Promise<StaffEarnings[]> {
    const earning = staffRows.filter((s): s is Staff & { incentivePlan: IncentivePlan } => s.incentivePlan !== null);
    if (earning.length === 0) {
      return [];
    }

    const completed = await this.appointments.find({
      where: {
        tenantId,
        staffId: In(earning.map((s) => s.id)),
        appointmentDate: Between(range.from, range.to),
        status: AppointmentStatus.COMPLETED,
      },
    });
    if (completed.length === 0) {
      return earning.map((s) => ({ staff: s, plan: s.incentivePlan, breakdown: zeroBreakdown(), lines: [] }));
    }

    const [lineRows, paymentRows, serviceRows] = await Promise.all([
      this.lines.find({ where: { appointmentId: In(completed.map((a) => a.id)), status: "ACTIVE" } }),
      this.payments.find({ where: { appointmentId: In(completed.map((a) => a.id)), state: PaymentStatus.SUCCESS } }),
      this.services.find({ where: { tenantId } }),
    ]);
    const serviceNameById = new Map(serviceRows.map((s) => [s.id, s.name]));

    const receivedByAppointment = new Map<string, number>();
    for (const p of paymentRows) {
      if (!p.appointmentId) continue;
      receivedByAppointment.set(p.appointmentId, (receivedByAppointment.get(p.appointmentId) ?? 0) + p.amountCents);
    }
    const linesByAppointment = new Map<string, AppointmentServiceLine[]>();
    for (const l of lineRows) {
      const arr = linesByAppointment.get(l.appointmentId) ?? [];
      arr.push(l);
      linesByAppointment.set(l.appointmentId, arr);
    }
    const apptById = new Map(completed.map((a) => [a.id, a]));

    const contributingByStaff = new Map<string, ContributingLine[]>();
    for (const [appointmentId, apptLines] of linesByAppointment) {
      const appt = apptById.get(appointmentId);
      if (!appt) continue;
      const chargedLines = apptLines.map((l) => ({
        line: l,
        chargedCents: Math.max(0, l.priceCentsSnapshot - l.discountCentsSnapshot),
      }));
      const received = receivedByAppointment.get(appointmentId) ?? 0;
      const shares = allocateReceivedByLine(received, chargedLines);
      const arr = contributingByStaff.get(appt.staffId) ?? [];
      chargedLines.forEach((cl, i) => {
        arr.push({
          appointmentId,
          bookingReference: appt.bookingReference,
          serviceId: cl.line.serviceId,
          serviceName: cl.line.serviceId ? (serviceNameById.get(cl.line.serviceId) ?? cl.line.nameSnapshot) : cl.line.nameSnapshot,
          chargedCents: cl.chargedCents,
          receivedCents: shares[i],
        });
      });
      contributingByStaff.set(appt.staffId, arr);
    }

    return earning.map((s) => {
      const plan = s.incentivePlan;
      const contributing = contributingByStaff.get(s.id) ?? [];
      const components: PlanComponents = {
        baseCommissionPercent: plan.baseCommissionPercent,
        perJobAmountCents: plan.perJobAmountCents,
        monthlyTargetCents: plan.monthlyTargetCents,
        tierBonusPercent: plan.tierBonusPercent,
        serviceRates: new Map((plan.serviceRates ?? []).map((r) => [r.serviceId, r.ratePercent])),
      };
      const breakdown = computeIncentive(
        components,
        contributing.map((l) => ({ serviceId: l.serviceId, receivedCents: l.receivedCents, jobCompleted: true })),
      );
      return { staff: s, plan, breakdown, lines: contributing };
    });
  }

  private async findOwned(tenantId: string, id: string): Promise<IncentivePlan> {
    const plan = await this.plans.findOne({ where: { tenantId, id } });
    if (!plan) {
      throw new ApiError({ statusCode: 404, code: "INCENTIVE_PLAN_NOT_FOUND", message: "Incentive plan not found." });
    }
    return plan;
  }

  private async validateServiceRates(tenantId: string, dto: UpsertIncentivePlanDto): Promise<void> {
    const hasComponent =
      dto.baseCommissionPercent !== undefined ||
      dto.perJobAmountCents !== undefined ||
      (dto.monthlyTargetCents !== undefined && dto.tierBonusPercent !== undefined);
    if (!hasComponent) {
      throw new ApiError({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Set at least one of a base commission, a flat per-job amount, or a monthly target with its bonus rate.",
      });
    }
    if ((dto.monthlyTargetCents === undefined) !== (dto.tierBonusPercent === undefined)) {
      throw new ApiError({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "A monthly target and its bonus rate must be set together, or not at all.",
      });
    }
    if (!dto.serviceRates?.length) {
      return;
    }
    const serviceIds = dto.serviceRates.map((r) => r.serviceId);
    const owned = await this.services.find({ where: { tenantId, id: In(serviceIds) } });
    if (owned.length !== new Set(serviceIds).size) {
      throw new ApiError({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "One or more services in the rate table don't belong to this salon, or are listed twice.",
      });
    }
  }

  private async replaceRates(planId: string, rates: Array<{ serviceId: string; ratePercent: number }>): Promise<void> {
    await this.rates.delete({ planId });
    if (rates.length === 0) {
      return;
    }
    await this.rates.save(rates.map((r) => this.rates.create({ planId, serviceId: r.serviceId, ratePercent: r.ratePercent })));
  }

  private async toViews(plans: IncentivePlan[]): Promise<IncentivePlanView[]> {
    if (plans.length === 0) {
      return [];
    }
    const rateRows = await this.rates.find({ where: { planId: In(plans.map((p) => p.id)) }, relations: { service: true } });
    const ratesByPlan = new Map<string, IncentivePlanServiceRate[]>();
    for (const r of rateRows) {
      const arr = ratesByPlan.get(r.planId) ?? [];
      arr.push(r);
      ratesByPlan.set(r.planId, arr);
    }
    return plans.map((p) => ({
      id: p.id,
      name: p.name,
      baseCommissionPercent: p.baseCommissionPercent,
      perJobAmountCents: p.perJobAmountCents,
      monthlyTargetCents: p.monthlyTargetCents,
      tierBonusPercent: p.tierBonusPercent,
      active: p.active,
      serviceRates: (ratesByPlan.get(p.id) ?? []).map((r) => ({
        serviceId: r.serviceId,
        serviceName: r.service?.name ?? "",
        ratePercent: r.ratePercent,
      })),
    }));
  }
}

function zeroBreakdown(): IncentiveBreakdown {
  return { revenueCents: 0, commissionCents: 0, jobsCompleted: 0, perJobCents: 0, tierBonusCents: 0, totalCents: 0 };
}
