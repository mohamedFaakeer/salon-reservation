import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { EntityManager } from "typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ILike, Repository } from "typeorm";
import {
  ApiError,
  AppointmentStatus,
  PaymentStatus,
  type CreateCustomerDto,
  type CustomerQueryDto,
} from "@salon/shared";
import { Customer } from "../entities/customer.entity";
import { Appointment } from "../entities/appointment.entity";
import { AppointmentServiceLine } from "../entities/appointment-service.entity";
import { Payment } from "../entities/payment.entity";
import { Rating } from "../entities/rating.entity";
import { isUniqueViolation } from "../common/postgres-errors.util";
import { normalizePhone } from "./phone.util";

export interface CustomerServiceCount {
  name: string;
  count: number;
}

export interface CustomerStats {
  totalBookings: number;
  visits: number;
  cancellations: number;
  noShows: number;
  /** Percent of concluded appointments missed. Null when there is nothing to judge. */
  noShowRate: number | null;
  totalSpentCents: number;
  firstVisitDate: string | null;
  lastVisitDate: string | null;
  services: CustomerServiceCount[];
  /** Mean of the ratings they have left. Null when they have left none. */
  averageRating: number | null;
  ratingCount: number;
}

export interface CustomerListResult {
  data: Customer[];
  meta: { total: number; limit: number; offset: number };
}

export interface BookingCustomerInput {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
}

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
    @InjectRepository(AppointmentServiceLine) private readonly lines: Repository<AppointmentServiceLine>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Rating) private readonly ratings: Repository<Rating>,
  ) {}

  /** POST /customers — hard block on a phone/email match (PRD: "no silent duplicates"). */
  async create(tenantId: string, dto: CreateCustomerDto, manager?: EntityManager): Promise<Customer> {
    const repo = manager ? manager.getRepository(Customer) : this.customers;
    const phone = normalizePhone(dto.phone);
    const email = dto.email?.trim().toLowerCase() ?? null;

    const existing = await this.findDuplicate(repo, tenantId, phone, email);
    if (existing) {
      throw new ApiError({
        statusCode: 409,
        code: "DUPLICATE_CUSTOMER",
        message: "A customer with this phone or email already exists.",
        details: { existing },
      });
    }

    return repo.save(
      repo.create({
        tenantId,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone,
        email,
        notes: null,
      }),
    );
  }

  /**
   * Silent match-by-phone for the online booking flow — a returning
   * customer typing their own number should never see an error. Deliberately
   * different behavior from `create`; not exposed as its own route.
   */
  async findOrCreateForBooking(
    tenantId: string,
    input: BookingCustomerInput,
    manager?: EntityManager,
  ): Promise<Customer> {
    const repo = manager ? manager.getRepository(Customer) : this.customers;
    const phone = normalizePhone(input.phone);
    const existing = await repo.findOne({ where: { tenantId, phone } });
    if (existing) {
      return existing;
    }

    const email = input.email?.trim().toLowerCase() ?? null;
    try {
      return await repo.save(
        repo.create({
          tenantId,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          phone,
          email,
          notes: null,
        }),
      );
    } catch (err) {
      // Phone is the canonical online-booking identity (PRD Q2); an email
      // that happens to collide with a different customer (e.g. a shared
      // family inbox) must never block a booking — drop it silently rather
      // than surfacing a raw DB constraint error.
      if (isUniqueViolation(err) && email) {
        return repo.save(
          repo.create({
            tenantId,
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            phone,
            email: null,
            notes: null,
          }),
        );
      }
      throw err;
    }
  }

  /**
   * GET /customers — newest first, or matches for `q`.
   *
   * This used to hardcode `take: 50` and drop the `limit`/`offset` its own DTO
   * declares, so the documented pagination silently did nothing and a salon
   * with more than fifty customers could not reach the rest. It also matched
   * with `Like`, which is case-sensitive in Postgres: searching "ayesha" found
   * nobody named "Ayesha". Both now behave like every other list endpoint
   * (notifications, payments, audit) and like the appointment search, which
   * has always used ILIKE.
   */
  async search(tenantId: string, query: CustomerQueryDto): Promise<CustomerListResult> {
    const q = query.q?.trim();
    const where = q
      ? [
          { tenantId, firstName: ILike(`%${q}%`) },
          { tenantId, lastName: ILike(`%${q}%`) },
          { tenantId, phone: ILike(`%${q}%`) },
        ]
      : { tenantId };

    const [data, total] = await this.customers.findAndCount({
      where,
      order: { createdAt: "DESC" },
      take: query.limit,
      skip: query.offset,
    });
    return { data, meta: { total, limit: query.limit, offset: query.offset } };
  }

  async findById(tenantId: string, id: string): Promise<Customer> {
    const customer = await this.customers.findOne({ where: { id, tenantId } });
    if (!customer) {
      throw new ApiError({
        statusCode: 404,
        code: "CUSTOMER_NOT_FOUND",
        message: "Customer not found.",
      });
    }
    return customer;
  }

  /**
   * What this customer is worth to this salon, and how reliable they are.
   *
   * Every figure is aggregated in the database rather than tallied from a page
   * of results in the browser: a client-side count reports "0 no-shows" for
   * someone with three of them on page two, which is worse than showing
   * nothing. Scoped by tenantId on every query — a customer record is never
   * shared across salons, but the aggregates must not be either.
   */
  async stats(tenantId: string, customerId: string): Promise<CustomerStats> {
    // Confirms the customer belongs to this tenant before aggregating.
    await this.findById(tenantId, customerId);

    const [byStatus, spend, services, visitDates, ratings] = await Promise.all([
      this.appointments
        .createQueryBuilder("a")
        .select("a.status", "status")
        .addSelect("COUNT(*)::int", "count")
        .where("a.tenantId = :tenantId AND a.customerId = :customerId", { tenantId, customerId })
        .groupBy("a.status")
        .getRawMany<{ status: AppointmentStatus; count: number }>(),

      // Money actually received, not money billed. A completed appointment the
      // customer never paid for is not spending.
      this.payments
        .createQueryBuilder("p")
        .select("COALESCE(SUM(p.amountCents), 0)::int", "total")
        .where("p.tenantId = :tenantId AND p.customerId = :customerId AND p.state = :state", {
          tenantId,
          customerId,
          state: PaymentStatus.SUCCESS,
        })
        .getRawOne<{ total: number }>(),

      // Names come from the snapshot on the line, not the current Service row:
      // a service renamed last year must still read as what they booked.
      this.lines
        .createQueryBuilder("l")
        .innerJoin(Appointment, "a", 'a.id = l."appointmentId"')
        .select("l.nameSnapshot", "name")
        .addSelect("COUNT(*)::int", "count")
        .where("a.tenantId = :tenantId AND a.customerId = :customerId", { tenantId, customerId })
        .andWhere("l.status = :active", { active: "ACTIVE" })
        .andWhere("a.status NOT IN (:...ignored)", {
          ignored: [AppointmentStatus.CANCELLED, AppointmentStatus.RESCHEDULED, AppointmentStatus.EXPIRED],
        })
        .groupBy("l.nameSnapshot")
        .orderBy("2", "DESC")
        .limit(6)
        .getRawMany<{ name: string; count: number }>(),

      this.appointments
        .createQueryBuilder("a")
        .select("MIN(a.appointmentDate)", "first")
        .addSelect("MAX(a.appointmentDate)", "last")
        .where("a.tenantId = :tenantId AND a.customerId = :customerId", { tenantId, customerId })
        .andWhere("a.status = :completed", { completed: AppointmentStatus.COMPLETED })
        .getRawOne<{ first: string | null; last: string | null }>(),

      this.ratings
        .createQueryBuilder("r")
        .select("AVG(r.score)", "average")
        .addSelect("COUNT(*)::int", "count")
        .where('r."tenantId" = :tenantId AND r."customerId" = :customerId', { tenantId, customerId })
        .getRawOne<{ average: string | null; count: number }>(),
    ]);

    const counts = new Map(byStatus.map((r) => [r.status, Number(r.count)]));
    const total = byStatus.reduce((sum, r) => sum + Number(r.count), 0);
    const visits = counts.get(AppointmentStatus.COMPLETED) ?? 0;
    const cancellations = counts.get(AppointmentStatus.CANCELLED) ?? 0;
    const noShows = counts.get(AppointmentStatus.NO_SHOW) ?? 0;

    return {
      totalBookings: total,
      visits,
      cancellations,
      noShows,
      // Of the appointments that reached a conclusion. Bookings still in the
      // future are not evidence either way, so they stay out of the ratio.
      noShowRate: visits + noShows === 0 ? null : Math.round((noShows / (visits + noShows)) * 100),
      totalSpentCents: Number(spend?.total ?? 0),
      firstVisitDate: visitDates?.first ?? null,
      lastVisitDate: visitDates?.last ?? null,
      services: services.map((r) => ({ name: r.name, count: Number(r.count) })),
      // Null rather than 0 — an unrated customer has no score, and zero out of
      // five would be the worst one there is.
      averageRating:
        Number(ratings?.count ?? 0) === 0
          ? null
          : Math.round(Number(ratings?.average) * 10) / 10,
      ratingCount: Number(ratings?.count ?? 0),
    };
  }

  private async findDuplicate(
    repo: Repository<Customer>,
    tenantId: string,
    phone: string,
    email: string | null,
  ): Promise<Customer | null> {
    const byPhone = await repo.findOne({ where: { tenantId, phone } });
    if (byPhone) {
      return byPhone;
    }
    if (email) {
      const byEmail = await repo.findOne({ where: { tenantId, email } });
      if (byEmail) {
        return byEmail;
      }
    }
    return null;
  }
}
