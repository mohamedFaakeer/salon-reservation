import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource, EntityManager } from "typeorm";
import { BookingSource } from "@salon/shared";
import { Customer } from "../entities/customer.entity";
import { Service } from "../entities/service.entity";
import { Staff } from "../entities/staff.entity";
import { StaffServiceAssignment } from "../entities/staff-service.entity";
import { WorkingSchedule } from "../entities/working-schedule.entity";
import { AvailabilityService } from "../availability/availability.service";
import { BookingService } from "../booking/booking.service";
import { TenantService } from "../tenant/tenant.service";
import { AuditService } from "../audit/audit.service";
import { colomboNow } from "../availability/time.util";

export interface DemoSeedResult {
  /** false when the tenant already had demo data — the call was a safe no-op. */
  seeded: boolean;
  counts: { services: number; staff: number; customers: number; appointments: number };
}

/** DEPLOYMENT.md §7 — the exact catalogue the demo script promises. */
const SERVICES: Array<{ name: string; durationMin: number; priceCents: number; category: string }> = [
  { name: "Women's Haircut", durationMin: 45, priceCents: 250_000, category: "Hair" },
  { name: "Men's Haircut", durationMin: 30, priceCents: 180_000, category: "Hair" },
  { name: "Beard Trim", durationMin: 15, priceCents: 60_000, category: "Hair" },
  { name: "Hair Wash", durationMin: 15, priceCents: 80_000, category: "Hair" },
  { name: "Hair Coloring", durationMin: 90, priceCents: 450_000, category: "Hair" },
  { name: "Facial", durationMin: 60, priceCents: 350_000, category: "Skin" },
  { name: "Manicure", durationMin: 45, priceCents: 220_000, category: "Nails" },
  { name: "Pedicure", durationMin: 45, priceCents: 250_000, category: "Nails" },
  { name: "Bridal Makeup", durationMin: 180, priceCents: 1_200_000, category: "Makeup" },
  { name: "Hair Styling", durationMin: 20, priceCents: 100_000, category: "Hair" },
];

/**
 * Staff are qualified by service *category* rather than by an explicit name
 * list, so adding a service above automatically stays consistent with who can
 * perform it instead of silently producing an unbookable service.
 */
const STAFF: Array<{ name: string; color: string; categories: string[] }> = [
  { name: "Kasun", color: "#2563EB", categories: ["Hair"] },
  { name: "Nadeesha", color: "#7C3AED", categories: ["Hair", "Makeup"] },
  { name: "Ishara", color: "#059669", categories: ["Skin", "Nails"] },
  { name: "Tharushi", color: "#DC2626", categories: ["Nails", "Skin", "Hair"] },
];

const CUSTOMERS: Array<{ firstName: string; lastName: string; phone: string; email?: string }> = [
  { firstName: "Ayesha", lastName: "Perera", phone: "+94771000001", email: "ayesha.demo@example.com" },
  { firstName: "Mohamed", lastName: "Rizwan", phone: "+94771000002", email: "mohamed.demo@example.com" },
  { firstName: "Sara", lastName: "Fernando", phone: "+94771000003" },
  { firstName: "Nimal", lastName: "Silva", phone: "+94771000004" },
  { firstName: "Dilini", lastName: "Jayawardena", phone: "+94771000005" },
];

/** Mon–Sat 09:00–18:00 with a 13:00–14:00 break; Sunday closed (no row = day off). */
const WORKDAYS = [0, 1, 2, 3, 4, 5];
const DAY_START_MIN = 9 * 60;
const DAY_END_MIN = 18 * 60;
const BREAK_START_MIN = 13 * 60;
const BREAK_END_MIN = 14 * 60;

@Injectable()
export class DemoSeedService {
  private readonly logger = new Logger(DemoSeedService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(TenantService) private readonly tenantService: TenantService,
    @Inject(BookingService) private readonly booking: BookingService,
    @Inject(AvailabilityService) private readonly availability: AvailabilityService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * Populates a tenant with the demo catalogue, staff, schedules, customers and
   * a few sample appointments (DEPLOYMENT.md §7).
   *
   * Idempotent by design — DEPLOYMENT.md promises "re-running is safe", and a
   * demo gets re-seeded far more often than it gets provisioned. The guard is
   * deliberately coarse ("does this tenant have any service?") rather than
   * per-entity upserts: a half-seeded tenant is a far worse failure mode than a
   * refused second run, and the reference data is written in one transaction so
   * that half-seeded state cannot exist in the first place.
   */
  async seed(tenantId: string, actorUserId: string): Promise<DemoSeedResult> {
    const tenant = await this.tenantService.findById(tenantId);

    const existing = await this.dataSource.getRepository(Service).count({ where: { tenantId } });
    if (existing > 0) {
      this.logger.log(`Tenant ${tenant.slug} already has demo data — skipping.`);
      return { seeded: false, counts: await this.counts(tenantId) };
    }

    await this.dataSource.transaction(async (manager) => {
      await this.seedReferenceData(manager, tenantId);
      await this.audit.record(
        {
          tenantId,
          actorUserId,
          action: "DEMO_SEEDED",
          entityType: "Tenant",
          entityId: tenantId,
          metadata: { services: SERVICES.length, staff: STAFF.length, customers: CUSTOMERS.length },
        },
        manager,
      );
    });

    // Appointments are created *after* the reference-data transaction commits,
    // and through the booking engine rather than by direct insert. CLAUDE.md
    // rule §1: every booking source uses the same engine, so the demo data is
    // exercised by the same code path a receptionist uses — which also means
    // seeding proves the engine works on a fresh deploy.
    const appointments = await this.seedAppointments(tenant.slug, tenantId, actorUserId);

    return { seeded: true, counts: { ...(await this.counts(tenantId)), appointments } };
  }

  private async seedReferenceData(manager: EntityManager, tenantId: string): Promise<void> {
    const serviceRepo = manager.getRepository(Service);
    const services = await serviceRepo.save(
      SERVICES.map((s) =>
        serviceRepo.create({
          tenantId,
          name: s.name,
          category: s.category,
          durationMin: s.durationMin,
          priceCents: s.priceCents,
          active: true,
        }),
      ),
    );

    const staffRepo = manager.getRepository(Staff);
    const staff = await staffRepo.save(
      STAFF.map((s) => staffRepo.create({ tenantId, name: s.name, color: s.color, active: true })),
    );

    const assignmentRepo = manager.getRepository(StaffServiceAssignment);
    const assignments: StaffServiceAssignment[] = [];
    staff.forEach((member, i) => {
      const categories = STAFF[i].categories;
      for (const service of services) {
        if (service.category && categories.includes(service.category)) {
          assignments.push(
            assignmentRepo.create({ tenantId, staffId: member.id, serviceId: service.id }),
          );
        }
      }
    });
    await assignmentRepo.save(assignments);

    const scheduleRepo = manager.getRepository(WorkingSchedule);
    await scheduleRepo.save(
      staff.flatMap((member) =>
        WORKDAYS.map((dayOfWeek) =>
          scheduleRepo.create({
            tenantId,
            staffId: member.id,
            dayOfWeek,
            startMin: DAY_START_MIN,
            endMin: DAY_END_MIN,
            breakStartMin: BREAK_START_MIN,
            breakEndMin: BREAK_END_MIN,
          }),
        ),
      ),
    );

    const customerRepo = manager.getRepository(Customer);
    await customerRepo.save(
      CUSTOMERS.map((c) =>
        customerRepo.create({
          tenantId,
          firstName: c.firstName,
          lastName: c.lastName,
          phone: c.phone,
          email: c.email ?? null,
        }),
      ),
    );
  }

  /**
   * Books a handful of appointments across today and the next few days by
   * asking the availability engine for real open slots, rather than inventing
   * timestamps. Inventing them would fight the GiST exclusion constraints and
   * would break the moment the demo is seeded on a Sunday or near closing time.
   *
   * Seeding must never fail the whole request because the calendar happened to
   * be full, so per-appointment failures are logged and skipped.
   */
  private async seedAppointments(
    slug: string,
    tenantId: string,
    actorUserId: string,
  ): Promise<number> {
    const tenant = await this.tenantService.findById(tenantId);
    const services = await this.dataSource.getRepository(Service).find({ where: { tenantId } });
    const customers = await this.dataSource.getRepository(Customer).find({ where: { tenantId } });
    const menCut = services.find((s) => s.name === "Men's Haircut");
    const facial = services.find((s) => s.name === "Facial");
    const womenCut = services.find((s) => s.name === "Women's Haircut");
    if (!menCut || !facial || !womenCut || customers.length < 4) {
      return 0;
    }

    // A believable board: two on today (one already checked in), two upcoming.
    const plan: Array<{ serviceId: string; customerIndex: number; dayOffset: number; checkInNow: boolean }> = [
      { serviceId: menCut.id, customerIndex: 0, dayOffset: 0, checkInNow: true },
      { serviceId: womenCut.id, customerIndex: 1, dayOffset: 0, checkInNow: false },
      { serviceId: facial.id, customerIndex: 2, dayOffset: 1, checkInNow: false },
      { serviceId: menCut.id, customerIndex: 3, dayOffset: 2, checkInNow: false },
    ];

    let created = 0;
    for (const [i, item] of plan.entries()) {
      const slot = await this.findSlot(slug, item.serviceId, item.dayOffset);
      if (!slot) {
        this.logger.warn(`No open slot for demo appointment ${i + 1} — skipped.`);
        continue;
      }
      try {
        await this.booking.reserveAndConfirm(
          tenant,
          {
            customerId: customers[item.customerIndex].id,
            serviceIds: [item.serviceId],
            staffId: slot.staffId,
            start: slot.start,
            source: BookingSource.WALK_IN,
            checkInNow: item.checkInNow,
          },
          `demo-seed-${tenantId}-${i}`,
          actorUserId,
        );
        created += 1;
      } catch (err) {
        this.logger.warn(
          `Demo appointment ${i + 1} could not be booked: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return created;
  }

  /** Scans forward from `dayOffset` for the first bookable slot, skipping closed days. */
  private async findSlot(
    slug: string,
    serviceId: string,
    dayOffset: number,
  ): Promise<{ start: string; staffId: string } | null> {
    for (let extra = 0; extra < 7; extra += 1) {
      const date = addDays(colomboNow(new Date()).date, dayOffset + extra);
      // staffId omitted = "Any Available Staff", which is what a demo board wants.
      const { slots } = await this.availability.findSlots(slug, { serviceIds: [serviceId], date });
      if (slots.length > 0) {
        // Mid-morning rather than the first slot, so the demo board is not all 09:00.
        const pick = slots[Math.min(2, slots.length - 1)];
        return { start: pick.start, staffId: pick.staffId };
      }
    }
    return null;
  }

  private async counts(tenantId: string): Promise<DemoSeedResult["counts"]> {
    const [services, staff, customers] = await Promise.all([
      this.dataSource.getRepository(Service).count({ where: { tenantId } }),
      this.dataSource.getRepository(Staff).count({ where: { tenantId } }),
      this.dataSource.getRepository(Customer).count({ where: { tenantId } }),
    ]);
    return { services, staff, customers, appointments: 0 };
  }
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
