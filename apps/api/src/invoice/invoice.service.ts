import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository/DataSource must stay VALUE imports: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { DataSource, EntityManager, Repository } from "typeorm";
import { ApiError, PaymentStatus } from "@salon/shared";
import { Invoice, InvoiceStatus, type InvoiceSnapshot } from "../entities/invoice.entity";
import { Appointment } from "../entities/appointment.entity";
import { AppointmentServiceLine } from "../entities/appointment-service.entity";
import { Branch } from "../entities/branch.entity";
import { Payment } from "../entities/payment.entity";
import { Staff } from "../entities/staff.entity";
import { Tenant } from "../entities/tenant.entity";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuditService } from "../audit/audit.service";
import { formatInvoiceNumber, invoiceNumberPrefix, nextSequence } from "./invoice-number";
import { renderInvoiceEmail } from "./invoice-template";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { InvoiceMailer } from "./invoice-mailer";

/**
 * Issuing, superseding and sending invoices.
 *
 * The rule that shapes everything here: an invoice is a document, not a view.
 * Once it has left the building it exists in somebody's inbox, and a record
 * that quietly disagrees with that copy is worse than no record. So nothing is
 * ever edited — a correction issues a new version pointing back at the old one
 * and both are kept.
 */
@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    @InjectRepository(Invoice) private readonly invoices: Repository<Invoice>,
    private readonly audit: AuditService,
    private readonly mailer: InvoiceMailer,
    private readonly dataSource: DataSource,
  ) {}

  /** Every version for one appointment, newest first. */
  async listForAppointment(tenantId: string, appointmentId: string): Promise<Invoice[]> {
    return this.invoices.find({
      where: { tenantId, appointmentId },
      order: { version: "DESC" },
    });
  }

  async findOne(tenantId: string, id: string): Promise<Invoice> {
    const invoice = await this.invoices.findOne({ where: { tenantId, id } });
    if (!invoice) {
      throw new ApiError({
        statusCode: 404,
        code: "INVOICE_NOT_FOUND",
        message: "That invoice does not belong to this salon.",
      });
    }
    return invoice;
  }

  /**
   * Issue the invoice for a finished appointment, or supersede the one that
   * is already out if the figures have moved.
   *
   * Safe to call more than once: if a live invoice already matches the bill,
   * it is returned unchanged rather than a near-identical duplicate being cut.
   * Completion can be tapped twice, and two invoice numbers for one visit is
   * a mess somebody has to explain to a customer.
   */
  async issueFor(
    tenantId: string,
    appointmentId: string,
    actorUserId: string | null,
  ): Promise<Invoice> {
    return this.dataSource.transaction(async (manager) => {
      const appointment = await manager.getRepository(Appointment).findOne({
        where: { tenantId, id: appointmentId },
        relations: { customer: true },
      });
      if (!appointment?.customer) {
        throw new ApiError({
          statusCode: 404,
          code: "NOT_FOUND",
          message: "Appointment not found.",
        });
      }

      const current = await manager.getRepository(Invoice).findOne({
        where: { tenantId, appointmentId, status: InvoiceStatus.ISSUED },
      });

      const figures = await this.gatherFigures(manager, tenantId, appointment);

      if (current && unchanged(current, figures)) {
        return current;
      }

      const snapshot = await this.buildSnapshot(manager, tenantId, appointment, figures);

      // Superseded first: the partial unique index allows only one ISSUED
      // invoice per appointment, so the old one has to step aside before the
      // new one can exist. That ordering is what makes the index a guarantee
      // rather than an obstacle.
      if (current) {
        current.status = InvoiceStatus.SUPERSEDED;
        await manager.getRepository(Invoice).save(current);
      }

      const number = await this.reserveNumber(manager, tenantId);
      const invoice = await manager.getRepository(Invoice).save(
        manager.getRepository(Invoice).create({
          tenantId,
          appointmentId,
          customerId: appointment.customerId,
          number,
          version: (current?.version ?? 0) + 1,
          supersedesInvoiceId: current?.id ?? null,
          status: InvoiceStatus.ISSUED,
          ...figures,
          currency: "LKR",
          snapshot,
        }),
      );

      await this.audit.record(
        {
          tenantId,
          actorUserId,
          action: current ? "INVOICE_SUPERSEDED" : "INVOICE_ISSUED",
          entityType: "Invoice",
          entityId: invoice.id,
          metadata: {
            number,
            version: invoice.version,
            supersedes: current?.number ?? null,
            totalCents: figures.totalCents,
          },
        },
        manager,
      );

      return invoice;
    });
  }

  /**
   * Send an invoice somewhere.
   *
   * The address is a parameter rather than always the customer's, because the
   * commonest reason to resend is that the first address was wrong — and
   * because a customer with no email on file can still ask for it at the desk.
   */
  async send(
    tenantId: string,
    invoiceId: string,
    email: string,
    actorUserId: string | null,
  ): Promise<Invoice> {
    const invoice = await this.findOne(tenantId, invoiceId);

    await this.mailer.send(email, invoice, renderInvoiceEmail(invoice));

    invoice.lastSentAt = new Date();
    invoice.lastSentTo = email;
    await this.invoices.save(invoice);

    await this.audit.record({
      tenantId,
      actorUserId,
      action: "INVOICE_SENT",
      entityType: "Invoice",
      entityId: invoice.id,
      metadata: { number: invoice.number, to: email },
    });

    return invoice;
  }

  /**
   * Issue on completion and send it if we can.
   *
   * Never throws into the caller. A failed invoice must not undo a completed
   * service — the same rule notifications already follow (PRD §3.10) — so a
   * problem here is logged and the appointment stands. The invoice can be
   * reissued from the drawer.
   */
  async issueAndSendQuietly(tenantId: string, appointmentId: string, actorUserId: string): Promise<void> {
    try {
      const invoice = await this.issueFor(tenantId, appointmentId, actorUserId);
      const email = invoice.snapshot.customer.email;
      if (email) {
        await this.send(tenantId, invoice.id, email, actorUserId);
      }
    } catch (error) {
      this.logger.warn(
        `Could not issue or send the invoice for appointment ${appointmentId}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * The next number for this salon, under a lock.
   *
   * The tenant row is locked for the rest of the transaction, which serialises
   * every concurrent issuance for that salon — two receptionists completing
   * appointments at the same second queue rather than race. The unique index
   * on (tenantId, number) is the backstop that makes the lock's guarantee real
   * rather than assumed.
   *
   * The counter restarts each January, which is why the prefix carries the
   * year: without it, resetting would collide with last year's numbers.
   */
  private async reserveNumber(manager: EntityManager, tenantId: string): Promise<string> {
    const locked: Array<{ slug: string }> = await manager.query(
      `SELECT slug FROM tenant WHERE id = $1 FOR UPDATE`,
      [tenantId],
    );
    if (locked.length === 0) {
      throw new ApiError({ statusCode: 404, code: "NOT_FOUND", message: "Salon not found." });
    }

    const year = new Date().getUTCFullYear();
    const prefix = invoiceNumberPrefix(locked[0].slug, year);

    const highest: Array<{ number: string }> = await manager.query(
      `SELECT "number" FROM invoice
        WHERE "tenantId" = $1 AND "number" LIKE $2
        ORDER BY "number" DESC
        LIMIT 1`,
      [tenantId, `${prefix}%`],
    );

    return formatInvoiceNumber(locked[0].slug, year, nextSequence(highest[0]?.number, prefix));
  }

  private async gatherFigures(
    manager: EntityManager,
    tenantId: string,
    appointment: Appointment,
  ): Promise<InvoiceFigures> {
    const paid: { total: string } | undefined = await manager
      .getRepository(Payment)
      .createQueryBuilder("p")
      .select('COALESCE(SUM(p."amountCents"), 0)', "total")
      .where('p."tenantId" = :tenantId AND p."appointmentId" = :appointmentId', {
        tenantId,
        appointmentId: appointment.id,
      })
      .andWhere("p.state = :state", { state: PaymentStatus.SUCCESS })
      .getRawOne();

    const paidCents = Number(paid?.total ?? 0);
    const serviceDiscountCents = Math.max(
      0,
      appointment.discountCents - appointment.billDiscountCents,
    );

    return {
      subtotalCents: appointment.subtotalCents,
      serviceDiscountCents,
      billDiscountCents: appointment.billDiscountCents,
      totalCents: appointment.totalCents,
      paidCents,
      balanceCents: appointment.totalCents - paidCents,
    };
  }

  private async buildSnapshot(
    manager: EntityManager,
    tenantId: string,
    appointment: Appointment,
    figures: InvoiceFigures,
  ): Promise<InvoiceSnapshot> {
    const [tenant, branch, staff, lines, payments] = await Promise.all([
      manager.getRepository(Tenant).findOneOrFail({ where: { id: tenantId } }),
      manager.getRepository(Branch).findOne({ where: { tenantId, active: true } }),
      manager.getRepository(Staff).findOne({ where: { tenantId, id: appointment.staffId } }),
      manager.getRepository(AppointmentServiceLine).find({
        where: { appointmentId: appointment.id, status: "ACTIVE" },
      }),
      manager.getRepository(Payment).find({
        where: { tenantId, appointmentId: appointment.id, state: PaymentStatus.SUCCESS },
        order: { createdAt: "ASC" },
      }),
    ]);

    return {
      salon: {
        name: tenant.name,
        address: branch?.address ?? null,
        city: branch?.city ?? null,
        phone: branch?.phone ?? null,
        businessRegNo: tenant.settings.businessRegNo ?? null,
      },
      customer: {
        name: `${appointment.customer.firstName} ${appointment.customer.lastName}`.trim(),
        phone: appointment.customer.phone,
        email: appointment.customer.email,
      },
      appointment: {
        bookingReference: appointment.bookingReference,
        startTime: appointment.startTime.toISOString(),
        // A departed stylist must not blank out an old invoice.
        staffName: staff?.name ?? "Stylist",
      },
      lines: lines.map((line) => ({
        name: line.nameSnapshot,
        durationMin: line.durationMinSnapshot,
        listPriceCents: line.priceCentsSnapshot,
        discountCents: line.discountCentsSnapshot ?? 0,
        discountLabel: line.discountLabelSnapshot ?? null,
        chargedCents: line.priceCentsSnapshot - (line.discountCentsSnapshot ?? 0),
      })),
      billDiscount:
        figures.billDiscountCents > 0
          ? {
              type: appointment.billDiscountType ?? "FIXED",
              value: appointment.billDiscountValue ?? figures.billDiscountCents,
              cents: figures.billDiscountCents,
              reason: appointment.billDiscountReason,
            }
          : null,
      payments: payments.map((p) => ({
        method: p.method,
        amountCents: p.amountCents,
        recordedAt: (p.recordedAt ?? p.createdAt)?.toISOString() ?? null,
      })),
    };
  }
}

interface InvoiceFigures {
  subtotalCents: number;
  serviceDiscountCents: number;
  billDiscountCents: number;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
}

/**
 * Whether the live invoice still describes the bill.
 *
 * Only the money is compared. Re-cutting an invoice because a stylist was
 * renamed would burn a number and confuse a customer for no change to what
 * they owe.
 */
function unchanged(invoice: Invoice, figures: InvoiceFigures): boolean {
  return (
    invoice.subtotalCents === figures.subtotalCents &&
    invoice.serviceDiscountCents === figures.serviceDiscountCents &&
    invoice.billDiscountCents === figures.billDiscountCents &&
    invoice.totalCents === figures.totalCents &&
    invoice.paidCents === figures.paidCents
  );
}
