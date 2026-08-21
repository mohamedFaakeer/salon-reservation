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
import { allocateReceivedByLine, computeIncentive, type EarningLine, type PlanComponents } from "./incentive.domain";
import type { IncentivePlanView, IncentivePreviewRow } from "./incentive.types";

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

  /**
   * The live, unsaved figure for a range — what a payout would total if run
   * right now. Nothing here is written; A5's payout run reuses this same
   * computation and is what actually freezes it.
   */
  async preview(tenantId: string, query: IncentivePreviewQueryDto): Promise<IncentivePreviewRow[]> {
    const range = resolveDateRange(query.from, query.to, new Date());

    const staffRows = await this.staff.find({
      where: query.staffId
        ? { tenantId, id: query.staffId }
        : { tenantId, active: true },
      relations: { incentivePlan: { serviceRates: true } },
    });
    const earning = staffRows.filter((s) => s.incentivePlan !== null);
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
      return earning.map((s) => zeroRow(s, s.incentivePlan!.name));
    }

    const [lineRows, paymentRows] = await Promise.all([
      this.lines.find({
        where: { appointmentId: In(completed.map((a) => a.id)), status: "ACTIVE" },
      }),
      this.payments.find({
        where: { appointmentId: In(completed.map((a) => a.id)), state: PaymentStatus.SUCCESS },
      }),
    ]);

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

    const earningLinesByStaff = new Map<string, EarningLine[]>();
    for (const [appointmentId, apptLines] of linesByAppointment) {
      const appt = apptById.get(appointmentId);
      if (!appt) continue;
      const chargedLines = apptLines.map((l) => ({
        line: l,
        chargedCents: Math.max(0, l.priceCentsSnapshot - l.discountCentsSnapshot),
      }));
      const received = receivedByAppointment.get(appointmentId) ?? 0;
      const shares = allocateReceivedByLine(received, chargedLines);
      const arr = earningLinesByStaff.get(appt.staffId) ?? [];
      chargedLines.forEach((cl, i) => {
        arr.push({ serviceId: cl.line.serviceId, receivedCents: shares[i], jobCompleted: true });
      });
      earningLinesByStaff.set(appt.staffId, arr);
    }

    return earning.map((s) => {
      const plan = s.incentivePlan!;
      const components: PlanComponents = {
        baseCommissionPercent: plan.baseCommissionPercent,
        perJobAmountCents: plan.perJobAmountCents,
        monthlyTargetCents: plan.monthlyTargetCents,
        tierBonusPercent: plan.tierBonusPercent,
        serviceRates: new Map((plan.serviceRates ?? []).map((r) => [r.serviceId, r.ratePercent])),
      };
      const breakdown = computeIncentive(components, earningLinesByStaff.get(s.id) ?? []);
      return {
        staffId: s.id,
        staffName: s.name,
        planId: plan.id,
        planName: plan.name,
        ...breakdown,
      };
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

function zeroRow(staff: Staff, planName: string): IncentivePreviewRow {
  return {
    staffId: staff.id,
    staffName: staff.name,
    planId: staff.incentivePlanId!,
    planName,
    revenueCents: 0,
    commissionCents: 0,
    jobsCompleted: 0,
    perJobCents: 0,
    tierBonusCents: 0,
    totalCents: 0,
  };
}
