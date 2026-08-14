import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { EntityManager } from "typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Like, Repository } from "typeorm";
import { ApiError, type CreateCustomerDto } from "@salon/shared";
import { Customer } from "../entities/customer.entity";
import { isUniqueViolation } from "../common/postgres-errors.util";
import { normalizePhone } from "./phone.util";

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

  async search(tenantId: string, q?: string): Promise<Customer[]> {
    if (!q?.trim()) {
      return this.customers.find({ where: { tenantId }, order: { createdAt: "DESC" }, take: 50 });
    }
    const like = `%${q.trim()}%`;
    return this.customers.find({
      where: [
        { tenantId, firstName: Like(like) },
        { tenantId, lastName: Like(like) },
        { tenantId, phone: Like(like) },
      ],
      take: 50,
    });
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
