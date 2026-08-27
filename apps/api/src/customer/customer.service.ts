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
  type UpdateCustomerDto,
} from "@salon/shared";
import { Customer } from "../entities/customer.entity";
import { Appointment } from "../entities/appointment.entity";
import { AppointmentServiceLine } from "../entities/appointment-service.entity";
import { Payment } from "../entities/payment.entity";
import { Rating } from "../entities/rating.entity";
import { isUniqueViolation } from "../common/postgres-errors.util";
import { normalizePhone } from "./phone.util";

/** Not a real phone number — just a stable value the (tenantId, phone) unique index can key the one walk-in row on. */
const WALK_IN_PHONE = "WALKIN";

export interface CustomerServiceCount {
  name: string;
  count: number;
}

export interface CustomerStats {
  totalBookings: number;
  visits: number;
  cancellations: number;
  noShows: number;
  /**
   * Bookings that are on the books but have not happened yet.
   *
   * Reported separately from `totalBookings` so a screen can tell "never been
   * here" apart from "coming in on Thursday". Both have zero visits, and
   * showing them the same way makes a working salon look like an empty one.
   *
   * PENDING_PAYMENT is excluded: it is an unpaid attempt that expires on its
   * own, not a booking anyone is expecting. EXPIRED and RESCHEDULED are
   * likewise neither upcoming nor concluded — they are bookkeeping.
   */
  upcoming: number;
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

/**
 * On the books and still to happen. Deliberately not "everything that is not
 * concluded": PENDING_PAYMENT expires by itself and nobody is expecting that
 * customer, so counting it would promise a visit that was never booked.
 */
const UPCOMING_STATUSES = [
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.IN_SERVICE,
] as const;

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
    // The walk-in placeholder is an internal retail-checkout construct, never
    // a customer a receptionist should find while searching.
    const where = q
      ? [
          { tenantId, isWalkInPlaceholder: false, firstName: ILike(`%${q}%`) },
          { tenantId, isWalkInPlaceholder: false, lastName: ILike(`%${q}%`) },
          { tenantId, isWalkInPlaceholder: false, phone: ILike(`%${q}%`) },
        ]
      : { tenantId, isWalkInPlaceholder: false };

    const [data, total] = await this.customers.findAndCount({
      where,
      order: { createdAt: "DESC" },
      take: query.limit,
      skip: query.offset,
    });
    return { data, meta: { total, limit: query.limit, offset: query.offset } };
  }

  /** PATCH /customers/:id — currently just the marketing flag, not a general customer edit. */
  async update(tenantId: string, id: string, dto: UpdateCustomerDto): Promise<Customer> {
    const customer = await this.findById(tenantId, id);
    if (dto.marketingOptOut !== undefined) {
      customer.marketingOptOut = dto.marketingOptOut;
    }
    return this.customers.save(customer);
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
   * DECISIONS.md §43 — backs the public, no-login `{{unsubscribeUrl}}` link
   * carried in marketing messages. Deliberately tenant-agnostic (`id` alone,
   * a customer's primary key — globally unique, not the `(tenantId, phone)`
   * pair `findById` requires): a one-tap SMS link can't ask the recipient to
   * re-enter identifying details, and the worst case of this credential
   * being guessed is a customer opting out of marketing they never chose to
   * see, not a destructive or financial action — the same "low friction
   * over cryptographic rigor" tradeoff `bookingReference` already accepts.
   */
  private async findByIdPublic(id: string): Promise<Customer> {
    const customer = await this.customers.findOne({ where: { id }, relations: { tenant: true } });
    if (!customer) {
      throw new ApiError({
        statusCode: 404,
        code: "CUSTOMER_NOT_FOUND",
        message: "This link is no longer valid.",
      });
    }
    return customer;
  }

  /** GET (public) — lets the unsubscribe page greet the customer by name before they confirm. */
  async getUnsubscribeInfo(id: string): Promise<{ customerFirstName: string; salonName: string; alreadyOptedOut: boolean }> {
    const customer = await this.findByIdPublic(id);
    return {
      customerFirstName: customer.firstName,
      salonName: customer.tenant.name,
      alreadyOptedOut: customer.marketingOptOut,
    };
  }

  /** POST (public) — idempotent; re-confirming an already-opted-out customer is a no-op, not an error. */
  async unsubscribeFromMarketing(id: string): Promise<{ customerFirstName: string; salonName: string }> {
    const customer = await this.findByIdPublic(id);
    if (!customer.marketingOptOut) {
      customer.marketingOptOut = true;
      await this.customers.save(customer);
    }
    return { customerFirstName: customer.firstName, salonName: customer.tenant.name };
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
    const upcoming = UPCOMING_STATUSES.reduce((sum, s) => sum + (counts.get(s) ?? 0), 0);

    return {
      totalBookings: total,
      visits,
      cancellations,
      noShows,
      upcoming,
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

  /**
   * The tenant's one "Walk-in customer" row — retail checkout resolves to
   * this when no customer is attached, rather than relaxing
   * `Payment.customerId` to nullable (see the entity's own doc comment).
   * Matched by the boolean flag, not by phone, so there is no real phone
   * number to collide with. A race between two concurrent first-ever
   * checkouts is resolved by re-reading after the unique (tenantId, phone)
   * index rejects the loser's insert — the same shape
   * `findOrCreateForBooking` already handles for a genuine duplicate email.
   */
  async findOrCreateWalkIn(tenantId: string, manager?: EntityManager): Promise<Customer> {
    const repo = manager ? manager.getRepository(Customer) : this.customers;
    const existing = await repo.findOne({ where: { tenantId, isWalkInPlaceholder: true } });
    if (existing) {
      return existing;
    }

    try {
      return await repo.save(
        repo.create({
          tenantId,
          firstName: "Walk-in",
          lastName: "customer",
          phone: WALK_IN_PHONE,
          email: null,
          notes: null,
          isWalkInPlaceholder: true,
        }),
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        const raceWinner = await repo.findOne({ where: { tenantId, isWalkInPlaceholder: true } });
        if (raceWinner) {
          return raceWinner;
        }
      }
      throw err;
    }
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
