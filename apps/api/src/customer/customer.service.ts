import { Injectable } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import type { DataSource, EntityManager, SelectQueryBuilder } from "typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Brackets, In, Repository } from "typeorm";
import {
  ApiError,
  AppointmentStatus,
  BookingSource,
  CustomerSegment,
  PaymentStatus,
  type CreateCustomerDto,
  type CustomerQueryDto,
  type TenantSettings,
  type UpdateCustomerDto,
} from "@salon/shared";
import { Customer } from "../entities/customer.entity";
import { Appointment } from "../entities/appointment.entity";
import { AppointmentServiceLine } from "../entities/appointment-service.entity";
import { Payment } from "../entities/payment.entity";
import { Rating } from "../entities/rating.entity";
import { Tag } from "../entities/tag.entity";
import { CustomerTag } from "../entities/customer-tag.entity";
import { isUniqueViolation } from "../common/postgres-errors.util";
import { normalizePhone } from "./phone.util";
import { detectImage } from "../common/image.util";
// AuditService/TenantService/CloudinaryService must stay VALUE imports:
// NestJS resolves constructor injection via design:paramtypes metadata at
// runtime; `import type` would erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { TenantService } from "../tenant/tenant.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CloudinaryService } from "../cloudinary/cloudinary.service";

/** Not a real phone number — just a stable value the (tenantId, phone) unique index can key the one walk-in row on. */
const WALK_IN_PHONE = "WALKIN";

/** Same bounds as StaffService's headshot — a customer photo is the same category of image (a portrait), same anti-decompression-bomb reasoning. */
const CUSTOMER_PHOTO_MAX_BYTES = 2_000_000;
const CUSTOMER_PHOTO_MIN_DIMENSION = 200;
const CUSTOMER_PHOTO_MAX_DIMENSION = 4000;
const CUSTOMER_PHOTO_MAX_ASPECT_RATIO = 2;

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
  data: CustomerWithTags[];
  meta: { total: number; limit: number; offset: number };
}

export type CustomerWithTags = Customer & { tags: CustomerTagView[] };

export interface BookingCustomerInput {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
}

export interface CustomerTagView {
  id: string;
  label: string;
  color: string | null;
}

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
    @InjectRepository(AppointmentServiceLine) private readonly lines: Repository<AppointmentServiceLine>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Rating) private readonly ratings: Repository<Rating>,
    @InjectRepository(Tag) private readonly tags: Repository<Tag>,
    @InjectRepository(CustomerTag) private readonly customerTags: Repository<CustomerTag>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly tenantService: TenantService,
    private readonly cloudinary: CloudinaryService,
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

    if (dto.tagIds && dto.tagIds.length > 0) {
      await this.assertTagsOwned(tenantId, dto.tagIds);
    }

    const run = async (m: EntityManager): Promise<Customer> => {
      const customerRepo = m.getRepository(Customer);
      const saved = await customerRepo.save(
        customerRepo.create({
          tenantId,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          phone,
          email,
          notes: dto.notes?.trim() || null,
          title: dto.title?.trim() || null,
          dateOfBirth: dto.dateOfBirth ?? null,
          clientSource: dto.clientSource?.trim() || null,
          address: dto.address?.trim() || null,
          province: dto.province ?? null,
        }),
      );
      if (dto.tagIds && dto.tagIds.length > 0) {
        await this.replaceTags(m, saved.id, dto.tagIds);
      }
      return saved;
    };

    // A caller inside its own transaction (e.g. booking) passes its own
    // manager; a direct POST /customers call opens one here so the tag
    // links are never left dangling if the customer insert itself fails.
    return manager ? run(manager) : this.dataSource.transaction(run);
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
   * GET /customers — newest first, filterable by free-text `q`, a `tagId`,
   * and/or a `segment`. Built as one composable query so any combination of
   * filters (e.g. searching within a segment) behaves correctly, rather than
   * the old fixed set of `where` alternatives.
   */
  async search(tenantId: string, query: CustomerQueryDto): Promise<CustomerListResult> {
    const qb = this.baseQuery(tenantId);

    const q = query.q?.trim();
    if (q) {
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where("c.firstName ILIKE :q", { q: `%${q}%` })
            .orWhere("c.lastName ILIKE :q", { q: `%${q}%` })
            .orWhere("c.phone ILIKE :q", { q: `%${q}%` });
        }),
      );
    }

    if (query.tagId) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM "customer_tag" ct WHERE ct."customerId" = c.id AND ct."tagId" = :tagId)`,
        { tagId: query.tagId },
      );
    }

    if (query.segment) {
      const settings = await this.tenantService.getSettings(tenantId);
      this.applySegmentFilter(qb, query.segment, settings);
    }

    const [data, total] = await qb
      .orderBy("c.createdAt", "DESC")
      .take(query.limit)
      .skip(query.offset)
      .getManyAndCount();

    return { data: await this.attachTags(data), meta: { total, limit: query.limit, offset: query.offset } };
  }

  /** GET /customers/:id — the full detail shape, tags included, for the customer page and the Edit drawer's pre-fill. */
  async findDetail(tenantId: string, id: string): Promise<CustomerWithTags> {
    const customer = await this.findById(tenantId, id);
    const [withTags] = await this.attachTags([customer]);
    return withTags;
  }

  /** GET /customers/segments/summary — a count per segment for the Customers page's chip badges. */
  async segmentCounts(tenantId: string): Promise<Array<{ segment: CustomerSegment; count: number }>> {
    const settings = await this.tenantService.getSettings(tenantId);
    const segments = Object.values(CustomerSegment);
    const counts = await Promise.all(
      segments.map(async (segment) => {
        const qb = this.baseQuery(tenantId);
        this.applySegmentFilter(qb, segment, settings);
        return { segment, count: await qb.getCount() };
      }),
    );
    return counts;
  }

  /** GET /customers/lookup?phone= — powers the Add/Edit drawer's live duplicate check. Normalizes phone the same way create() does. */
  async lookupByPhone(tenantId: string, phone: string): Promise<Customer | null> {
    return this.customers.findOne({ where: { tenantId, phone: normalizePhone(phone) } });
  }

  /**
   * PATCH /customers/:id — a real general edit. Re-runs the duplicate check
   * (excluding this customer's own row) when phone/email changes, and audits
   * only a phone change — the one field with real identity/security weight.
   * Routine edits (notes, tags, address, name) are not audited, to keep the
   * feed from flooding with everyday CRM entry (DECISIONS.md).
   */
  async update(
    tenantId: string,
    id: string,
    dto: UpdateCustomerDto,
    actorUserId: string | null,
  ): Promise<CustomerWithTags> {
    const customer = await this.findById(tenantId, id);
    const oldPhone = customer.phone;

    const nextPhone = dto.phone !== undefined ? normalizePhone(dto.phone) : customer.phone;
    const nextEmail = dto.email !== undefined ? dto.email?.trim().toLowerCase() || null : customer.email;
    const phoneChanged = nextPhone !== customer.phone;
    const emailChanged = nextEmail !== customer.email;

    if (phoneChanged || emailChanged) {
      const conflict = await this.findDuplicate(this.customers, tenantId, nextPhone, nextEmail, id);
      if (conflict) {
        throw new ApiError({
          statusCode: 409,
          code: "DUPLICATE_CUSTOMER",
          message: "A customer with this phone or email already exists.",
          details: { existing: conflict },
        });
      }
    }

    if (dto.tagIds !== undefined && dto.tagIds.length > 0) {
      await this.assertTagsOwned(tenantId, dto.tagIds);
    }

    if (dto.firstName !== undefined) customer.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) customer.lastName = dto.lastName.trim();
    customer.phone = nextPhone;
    customer.email = nextEmail;
    if (dto.notes !== undefined) customer.notes = dto.notes?.trim() || null;
    if (dto.marketingOptOut !== undefined) customer.marketingOptOut = dto.marketingOptOut;
    if (dto.title !== undefined) customer.title = dto.title?.trim() || null;
    if (dto.dateOfBirth !== undefined) customer.dateOfBirth = dto.dateOfBirth;
    if (dto.clientSource !== undefined) customer.clientSource = dto.clientSource?.trim() || null;
    if (dto.address !== undefined) customer.address = dto.address?.trim() || null;
    if (dto.province !== undefined) customer.province = dto.province;

    const saved = await this.dataSource.transaction(async (manager) => {
      const result = await manager.getRepository(Customer).save(customer);
      if (dto.tagIds !== undefined) {
        await this.replaceTags(manager, id, dto.tagIds);
      }
      return result;
    });

    if (phoneChanged) {
      await this.audit.record({
        tenantId,
        actorUserId,
        action: "CUSTOMER_PHONE_CHANGED",
        entityType: "Customer",
        entityId: id,
        metadata: { oldPhone, newPhone: nextPhone },
      });
    }

    const [withTags] = await this.attachTags([saved]);
    return withTags;
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

  /** Every tag currently applied to a customer, for the detail/edit views. */
  async tagsFor(customerId: string): Promise<CustomerTagView[]> {
    const rows = await this.customerTags.find({ where: { customerId }, relations: { tag: true } });
    return rows.map((r) => ({ id: r.tag.id, label: r.tag.label, color: r.tag.color }));
  }

  /** Batched — one query for the whole page/result set, never one per row. */
  private async attachTags(rows: Customer[]): Promise<CustomerWithTags[]> {
    if (rows.length === 0) {
      return [];
    }
    const ids = rows.map((c) => c.id);
    const links = await this.customerTags.find({ where: { customerId: In(ids) }, relations: { tag: true } });
    const byCustomer = new Map<string, CustomerTagView[]>();
    for (const link of links) {
      const list = byCustomer.get(link.customerId) ?? [];
      list.push({ id: link.tag.id, label: link.tag.label, color: link.tag.color });
      byCustomer.set(link.customerId, list);
    }
    return rows.map((c) => ({ ...c, tags: byCustomer.get(c.id) ?? [] }));
  }

  async uploadPhoto(tenantId: string, id: string, buffer: Buffer): Promise<Customer> {
    this.assertPhotoValid(buffer);
    const customer = await this.findById(tenantId, id);
    const imageUrl = await this.cloudinary.uploadCustomerPhoto(buffer, `customer-photos/${tenantId}`);
    customer.profileImageUrl = imageUrl;
    return this.customers.save(customer);
  }

  /** No Cloudinary-side delete — an orphaned free-tier asset is an accepted, documented gap, same as staff/tenant-logo photos. */
  async removePhoto(tenantId: string, id: string): Promise<Customer> {
    const customer = await this.findById(tenantId, id);
    customer.profileImageUrl = null;
    return this.customers.save(customer);
  }

  private assertPhotoValid(buffer: Buffer): void {
    if (buffer.byteLength > CUSTOMER_PHOTO_MAX_BYTES) {
      throw new ApiError({
        statusCode: 400,
        code: "CUSTOMER_PHOTO_FILE_TOO_LARGE",
        message: `That file is too large — the limit is ${CUSTOMER_PHOTO_MAX_BYTES / 1_000_000} MB.`,
      });
    }
    // Real magic-byte parsing, never the client-supplied Content-Type/filename
    // — this is what actually rejects a disguised non-image file, and SVG
    // (the one format that can carry a <script> tag) is never accepted since
    // it never parses as a well-formed PNG/JPEG/WebP.
    const detected = detectImage(buffer);
    if (!detected) {
      throw new ApiError({
        statusCode: 400,
        code: "CUSTOMER_PHOTO_INVALID_FILE_TYPE",
        message: "That isn't a PNG, JPEG or WebP image.",
      });
    }
    const { width, height } = detected;
    if (
      width < CUSTOMER_PHOTO_MIN_DIMENSION ||
      height < CUSTOMER_PHOTO_MIN_DIMENSION ||
      width > CUSTOMER_PHOTO_MAX_DIMENSION ||
      height > CUSTOMER_PHOTO_MAX_DIMENSION
    ) {
      throw new ApiError({
        statusCode: 400,
        code: "CUSTOMER_PHOTO_DIMENSIONS_OUT_OF_RANGE",
        message: `Image dimensions must be between ${CUSTOMER_PHOTO_MIN_DIMENSION}×${CUSTOMER_PHOTO_MIN_DIMENSION} and ${CUSTOMER_PHOTO_MAX_DIMENSION}×${CUSTOMER_PHOTO_MAX_DIMENSION}px.`,
      });
    }
    const ratio = width / height;
    if (ratio > CUSTOMER_PHOTO_MAX_ASPECT_RATIO || ratio < 1 / CUSTOMER_PHOTO_MAX_ASPECT_RATIO) {
      throw new ApiError({
        statusCode: 400,
        code: "CUSTOMER_PHOTO_ASPECT_RATIO_INVALID",
        message: `That's an unusually elongated shape for a portrait photo — keep it within ${CUSTOMER_PHOTO_MAX_ASPECT_RATIO}:1.`,
      });
    }
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
    excludeId?: string,
  ): Promise<Customer | null> {
    const byPhone = await repo.findOne({ where: { tenantId, phone } });
    if (byPhone && byPhone.id !== excludeId) {
      return byPhone;
    }
    if (email) {
      const byEmail = await repo.findOne({ where: { tenantId, email } });
      if (byEmail && byEmail.id !== excludeId) {
        return byEmail;
      }
    }
    return null;
  }

  /** Never trust tag ids from the client — every one must belong to this tenant's own tag set. */
  private async assertTagsOwned(tenantId: string, tagIds: string[]): Promise<void> {
    const uniqueIds = Array.from(new Set(tagIds));
    const owned = await this.tags.find({ where: { id: In(uniqueIds), tenantId } });
    if (owned.length !== uniqueIds.length) {
      throw new ApiError({
        statusCode: 400,
        code: "INVALID_TAG_IDS",
        message: "One or more tags do not belong to this salon.",
      });
    }
  }

  /** Replaces the full tag set — matches checkbox-form semantics, same convention as StaffService.setServices. */
  private async replaceTags(manager: EntityManager, customerId: string, tagIds: string[]): Promise<void> {
    const repo = manager.getRepository(CustomerTag);
    await repo.delete({ customerId });
    const uniqueIds = Array.from(new Set(tagIds));
    if (uniqueIds.length > 0) {
      await repo.save(uniqueIds.map((tagId) => repo.create({ customerId, tagId })));
    }
  }

  private baseQuery(tenantId: string): SelectQueryBuilder<Customer> {
    return this.customers
      .createQueryBuilder("c")
      .where("c.tenantId = :tenantId", { tenantId })
      // The walk-in placeholder is an internal retail-checkout construct,
      // never a customer a receptionist should find while searching.
      .andWhere("c.isWalkInPlaceholder = false");
  }

  /**
   * One hand-written predicate per segment, following the same style
   * `ReportsService.lapsedCustomers` already uses for this kind of
   * behavioral query — this codebase has no generic "segments engine" and
   * doesn't need one for five fixed, well-understood conditions.
   */
  private applySegmentFilter(
    qb: SelectQueryBuilder<Customer>,
    segment: CustomerSegment,
    settings: TenantSettings,
  ): void {
    const windows = settings.customerSegmentSettings;
    switch (segment) {
      case CustomerSegment.NEW:
        qb.andWhere("c.createdAt >= NOW() - make_interval(days => :newCustomerWindowDays)", {
          newCustomerWindowDays: windows.newCustomerWindowDays,
        });
        break;

      case CustomerSegment.RECENT:
        qb.andWhere(
          `EXISTS (
            SELECT 1 FROM "appointment" a
            WHERE a."customerId" = c.id
              AND a."tenantId" = c."tenantId"
              AND a.status = :recentCompletedStatus
              AND a."appointmentDate" >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Colombo')::date - make_interval(days => :recentVisitWindowDays)
          )`,
          { recentCompletedStatus: AppointmentStatus.COMPLETED, recentVisitWindowDays: windows.recentVisitWindowDays },
        );
        break;

      case CustomerSegment.FIRST_VISIT:
        qb.andWhere(
          `NOT EXISTS (
            SELECT 1 FROM "appointment" a
            WHERE a."customerId" = c.id AND a."tenantId" = c."tenantId" AND a.status = :fvCompletedStatus
          )`,
          { fvCompletedStatus: AppointmentStatus.COMPLETED },
        );
        qb.andWhere(
          `EXISTS (
            SELECT 1 FROM "appointment" a
            WHERE a."customerId" = c.id AND a."tenantId" = c."tenantId" AND a.status IN (:...fvUpcomingStatuses)
          )`,
          { fvUpcomingStatuses: UPCOMING_STATUSES },
        );
        break;

      case CustomerSegment.UPCOMING_BIRTHDAY:
        // Walks real calendar days forward from Colombo "today" rather than
        // constructing a hypothetical "this year's birthday" date directly
        // (e.g. via make_date) — that approach throws a Postgres error for
        // anyone born Feb 29 whenever the current year isn't a leap year.
        // Walking real dates naturally wraps Dec 31 -> Jan 1 and simply never
        // produces an invalid date; the one accepted, minor trade-off is that
        // a Feb 29 birthday doesn't surface in this segment during a run of
        // non-leap years, which is a one-in-1,461-days edge case, not a bug
        // worth a more elaborate query.
        qb.andWhere('c."dateOfBirth" IS NOT NULL');
        qb.andWhere(
          `EXISTS (
            SELECT 1 FROM generate_series(0, :upcomingBirthdayWindowDays) AS g(n)
            WHERE to_char(
                    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Colombo')::date + make_interval(days => g.n),
                    'MMDD'
                  ) = to_char(c."dateOfBirth", 'MMDD')
          )`,
          { upcomingBirthdayWindowDays: windows.upcomingBirthdayWindowDays },
        );
        break;

      case CustomerSegment.WEB:
        qb.andWhere(
          `EXISTS (
            SELECT 1 FROM "appointment" a
            WHERE a."customerId" = c.id AND a."tenantId" = c."tenantId" AND a.source = :webSource
          )`,
          { webSource: BookingSource.ONLINE },
        );
        break;
    }
  }
}
