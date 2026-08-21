import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository/DataSource must stay VALUE imports: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { DataSource, In, Repository } from "typeorm";
import {
  ApiError,
  InquiryStatus,
  type BookingSource,
  type CreateInquiryDto,
  type InquiryQueryDto,
  type UpdateInquiryDto,
} from "@salon/shared";
import { Inquiry, InquiryService as InquiryServiceLine } from "../entities/inquiry.entity";
import { Appointment } from "../entities/appointment.entity";
import { Service } from "../entities/service.entity";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CustomerService } from "../customer/customer.service";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";

export interface InquiryRecord {
  id: string;
  customerId: string;
  /**
   * The whole customer, not a joined display name: converting an inquiry
   * pre-fills the booking drawer, which needs the parts separately. A
   * pre-formatted "First Last" would have to be split back apart, and names
   * do not survive that round trip.
   */
  customer: { id: string; firstName: string; lastName: string; phone: string } | null;
  source: BookingSource;
  status: InquiryStatus;
  notes: string | null;
  services: Array<{ serviceId: string | null; name: string }>;
  appointmentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InquiryListResult {
  data: InquiryRecord[];
  meta: { total: number; limit: number; offset: number };
}

@Injectable()
export class InquiryService {
  constructor(
    @InjectRepository(Inquiry) private readonly inquiries: Repository<Inquiry>,
    @InjectRepository(Service) private readonly services: Repository<Service>,
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
    private readonly customers: CustomerService,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  async list(tenantId: string, query: InquiryQueryDto): Promise<InquiryListResult> {
    const limit = query.limit ?? 25;
    const offset = query.offset ?? 0;

    const [rows, total] = await this.inquiries.findAndCount({
      where: {
        tenantId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.customerId ? { customerId: query.customerId } : {}),
      },
      relations: { customer: true, services: true },
      // Newest first: an inquiry is a thing you still owe someone an answer to,
      // and the one that came in this morning is the one that matters.
      order: { createdAt: "DESC" },
      take: limit,
      skip: offset,
    });

    return { data: rows.map(toRecord), meta: { total, limit, offset } };
  }

  /**
   * Log a question. Nothing is reserved, nothing is checked for availability —
   * that is the whole point of the entity.
   */
  async create(
    tenantId: string,
    dto: CreateInquiryDto,
    actorUserId: string,
  ): Promise<InquiryRecord> {
    if (!dto.customerId && !dto.newCustomer) {
      throw new ApiError({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Provide either customerId or newCustomer.",
      });
    }

    // Resolved before the transaction for the same reason the booking path
    // does it: an unknown service id is the caller's mistake, not a rollback.
    const serviceLines = await this.resolveServices(tenantId, dto.serviceIds ?? []);

    return this.dataSource.transaction(async (manager) => {
      const customer = dto.customerId
        ? await this.customers.findById(tenantId, dto.customerId)
        : await this.customers.create(tenantId, dto.newCustomer!, manager);

      const inquiryRepo = manager.getRepository(Inquiry);
      const lineRepo = manager.getRepository(InquiryServiceLine);

      const inquiry = await inquiryRepo.save(
        inquiryRepo.create({
          tenantId,
          customerId: customer.id,
          source: dto.source,
          status: InquiryStatus.OPEN,
          notes: dto.notes?.trim() || null,
          appointmentId: null,
          createdByUserId: actorUserId,
        }),
      );

      const saved = serviceLines.length
        ? await lineRepo.save(
            serviceLines.map((s) =>
              lineRepo.create({
                inquiryId: inquiry.id,
                serviceId: s.id,
                nameSnapshot: s.name,
              }),
            ),
          )
        : [];

      await this.audit.record(
        {
          tenantId,
          actorUserId,
          action: "INQUIRY_CREATED",
          entityType: "Inquiry",
          entityId: inquiry.id,
          metadata: { source: dto.source, services: serviceLines.map((s) => s.name) },
        },
        manager,
      );

      return toRecord({ ...inquiry, customer, services: saved });
    });
  }

  /**
   * Close it, reopen it, or record that it became a booking.
   *
   * Converting does not create the appointment — the booking drawer does that
   * through the ordinary availability engine, and this call only records the
   * link afterwards. Keeping the two apart is what stops this from becoming a
   * second booking path, which CLAUDE.md rule §1 forbids. The cost is that a
   * failure here leaves a real booking against a still-open inquiry, which is
   * visible and fixable; the alternative failure mode is a phantom booking.
   */
  async update(
    tenantId: string,
    id: string,
    dto: UpdateInquiryDto,
    actorUserId: string,
  ): Promise<InquiryRecord> {
    const inquiry = await this.inquiries.findOne({
      where: { tenantId, id },
      relations: { customer: true, services: true },
    });
    if (!inquiry) {
      throw new ApiError({
        statusCode: 404,
        code: "INQUIRY_NOT_FOUND",
        message: "That inquiry does not belong to this salon.",
      });
    }

    if (dto.status === InquiryStatus.CONVERTED) {
      if (!dto.appointmentId) {
        throw new ApiError({
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "Converting an inquiry requires the booking it became.",
        });
      }
      // Never trust the id: it must be a booking in the caller's own salon,
      // and for the same customer, or "converted" is an unverifiable claim.
      const appointment = await this.appointments.findOne({
        where: { tenantId, id: dto.appointmentId },
      });
      if (!appointment) {
        throw new ApiError({
          statusCode: 404,
          code: "APPOINTMENT_NOT_FOUND",
          message: "That booking does not belong to this salon.",
        });
      }
      if (appointment.customerId !== inquiry.customerId) {
        throw new ApiError({
          statusCode: 409,
          code: "INQUIRY_CUSTOMER_MISMATCH",
          message: "That booking belongs to a different customer.",
        });
      }
      inquiry.appointmentId = appointment.id;
    } else {
      // The database check constraint enforces this pairing too; clearing it
      // here keeps the app from ever presenting the constraint as a 500.
      inquiry.appointmentId = null;
    }

    inquiry.status = dto.status;
    await this.inquiries.save(inquiry);

    await this.audit.record({
      tenantId,
      actorUserId,
      action: "INQUIRY_UPDATED",
      entityType: "Inquiry",
      entityId: inquiry.id,
      metadata: { status: dto.status, appointmentId: inquiry.appointmentId },
    });

    return toRecord(inquiry);
  }

  /** Every id must be a live service of this salon — never a client-supplied name. */
  private async resolveServices(
    tenantId: string,
    serviceIds: string[],
  ): Promise<Array<{ id: string; name: string }>> {
    if (serviceIds.length === 0) {
      return [];
    }
    const unique = [...new Set(serviceIds)];
    const rows = await this.services.find({ where: { tenantId, id: In(unique) } });
    if (rows.length !== unique.length) {
      throw new ApiError({
        statusCode: 404,
        code: "SERVICE_NOT_FOUND",
        message: "One of those services is not offered by this salon.",
      });
    }
    return rows.map((s) => ({ id: s.id, name: s.name }));
  }
}

function toRecord(inquiry: Inquiry): InquiryRecord {
  return {
    id: inquiry.id,
    customerId: inquiry.customerId,
    customer: inquiry.customer
      ? {
          id: inquiry.customer.id,
          firstName: inquiry.customer.firstName,
          lastName: inquiry.customer.lastName,
          phone: inquiry.customer.phone,
        }
      : null,
    source: inquiry.source,
    status: inquiry.status,
    notes: inquiry.notes,
    services: (inquiry.services ?? []).map((l) => ({
      serviceId: l.serviceId,
      name: l.nameSnapshot,
    })),
    appointmentId: inquiry.appointmentId,
    createdAt: inquiry.createdAt,
    updatedAt: inquiry.updatedAt,
  };
}
