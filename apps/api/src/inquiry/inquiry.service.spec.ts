import type { DataSource, ObjectLiteral, Repository } from "typeorm";
import { BookingSource, InquiryStatus } from "@salon/shared";
import { InquiryService } from "./inquiry.service";
import type { Inquiry, InquiryService as InquiryServiceLine } from "../entities/inquiry.entity";
import type { Appointment } from "../entities/appointment.entity";
import type { Service } from "../entities/service.entity";
import type { Customer } from "../entities/customer.entity";
import type { CustomerService } from "../customer/customer.service";
import type { AuditService } from "../audit/audit.service";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => (Array.isArray(e) ? e : ({ id: "generated", ...e } as T))),
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
    findAndCount: vi.fn(async () => [[] as T[], 0] as [T[], number]),
  } as unknown as Repository<T>;
}

function fakeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "cust-1",
    tenantId: "t1",
    firstName: "Nimali",
    lastName: "Perera",
    phone: "+94771234567",
    ...overrides,
  } as Customer;
}

describe("InquiryService", () => {
  let inquiries: Repository<Inquiry>;
  let services: Repository<Service>;
  let appointments: Repository<Appointment>;
  let customers: CustomerService;
  let audit: AuditService;
  let dataSource: DataSource;
  let service: InquiryService;
  let txInquiries: Repository<Inquiry>;
  let txLines: Repository<InquiryServiceLine>;

  beforeEach(() => {
    inquiries = mockRepo<Inquiry>();
    services = mockRepo<Service>();
    appointments = mockRepo<Appointment>();
    txInquiries = mockRepo<Inquiry>();
    txLines = mockRepo<InquiryServiceLine>();
    customers = {
      findById: vi.fn(async () => fakeCustomer()),
      create: vi.fn(async () => fakeCustomer({ id: "cust-new" })),
    } as unknown as CustomerService;
    audit = { record: vi.fn(async () => undefined) } as unknown as AuditService;
    dataSource = {
      transaction: vi.fn(async (cb: (m: unknown) => unknown) =>
        cb({
          getRepository: (entity: { name: string }) =>
            entity.name === "Inquiry" ? txInquiries : txLines,
        }),
      ),
    } as unknown as DataSource;
    service = new InquiryService(
      inquiries,
      services,
      appointments,
      customers,
      audit,
      dataSource,
    );
  });

  const dto = {
    customerId: "cust-1",
    serviceIds: ["svc-1"],
    source: BookingSource.PHONE,
    notes: "  Asked about bridal packages  ",
  };

  describe("create", () => {
    beforeEach(() => {
      vi.mocked(services.find).mockResolvedValue([{ id: "svc-1", name: "Bridal Package" } as Service]);
      vi.mocked(txInquiries.save).mockResolvedValue({ id: "inq-1", tenantId: "t1" } as Inquiry);
    });

    it("logs against the caller's salon, never a salon in the body", async () => {
      await service.create("t1", dto, "user-1");

      const created = vi.mocked(txInquiries.create).mock.calls[0][0] as Inquiry;
      expect(created.tenantId).toBe("t1");
    });

    it("opens the inquiry and reserves nothing", async () => {
      await service.create("t1", dto, "user-1");

      const created = vi.mocked(txInquiries.create).mock.calls[0][0] as Inquiry;
      expect(created.status).toBe(InquiryStatus.OPEN);
      // The whole point of the entity: no staff, no date, no time, no hold.
      expect(created.appointmentId).toBeNull();
      expect(created).not.toHaveProperty("staffId");
      expect(created).not.toHaveProperty("startTime");
    });

    it("snapshots the service name so a rename cannot rewrite the question", async () => {
      await service.create("t1", dto, "user-1");

      const line = vi.mocked(txLines.create).mock.calls[0][0] as InquiryServiceLine;
      expect(line.nameSnapshot).toBe("Bridal Package");
      expect(line.serviceId).toBe("svc-1");
    });

    it("accepts an inquiry about nothing in particular", async () => {
      // "Do you do balayage?" is a real question about a service the salon may
      // not even offer. Demanding a service id would lose it.
      await service.create("t1", { ...dto, serviceIds: [] }, "user-1");

      expect(txLines.create).not.toHaveBeenCalled();
      expect(txInquiries.save).toHaveBeenCalled();
    });

    it("refuses a service that belongs to another salon", async () => {
      vi.mocked(services.find).mockResolvedValue([]);

      await expect(service.create("t1", dto, "user-1")).rejects.toMatchObject({
        statusCode: 404,
        code: "SERVICE_NOT_FOUND",
      });
    });

    it("requires either an existing customer or a new one", async () => {
      await expect(
        service.create("t1", { source: BookingSource.PHONE }, "user-1"),
      ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    });

    it("trims the note and stores an empty one as null", async () => {
      await service.create("t1", { ...dto, notes: "   " }, "user-1");

      const created = vi.mocked(txInquiries.create).mock.calls[0][0] as Inquiry;
      expect(created.notes).toBeNull();
    });

    it("records the inquiry in the audit trail", async () => {
      await service.create("t1", dto, "user-1");

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "INQUIRY_CREATED", tenantId: "t1" }),
        expect.anything(),
      );
    });
  });

  describe("update", () => {
    function existing(overrides: Partial<Inquiry> = {}) {
      vi.mocked(inquiries.findOne).mockResolvedValue({
        id: "inq-1",
        tenantId: "t1",
        customerId: "cust-1",
        status: InquiryStatus.OPEN,
        appointmentId: null,
        customer: fakeCustomer(),
        services: [],
        ...overrides,
      } as Inquiry);
    }

    it("refuses an inquiry belonging to another salon", async () => {
      vi.mocked(inquiries.findOne).mockResolvedValue(null);

      await expect(
        service.update("t1", "someone-elses", { status: InquiryStatus.CLOSED }, "user-1"),
      ).rejects.toMatchObject({ statusCode: 404, code: "INQUIRY_NOT_FOUND" });
    });

    it("will not mark an inquiry converted without the booking it became", async () => {
      existing();

      await expect(
        service.update("t1", "inq-1", { status: InquiryStatus.CONVERTED }, "user-1"),
      ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    });

    it("will not link a booking from another salon", async () => {
      // The client supplies this id, so it is never trusted.
      existing();
      vi.mocked(appointments.findOne).mockResolvedValue(null);

      await expect(
        service.update(
          "t1",
          "inq-1",
          { status: InquiryStatus.CONVERTED, appointmentId: "appt-x" },
          "user-1",
        ),
      ).rejects.toMatchObject({ statusCode: 404, code: "APPOINTMENT_NOT_FOUND" });
    });

    it("will not link a booking made for a different customer", async () => {
      existing();
      vi.mocked(appointments.findOne).mockResolvedValue({
        id: "appt-1",
        tenantId: "t1",
        customerId: "someone-else",
      } as Appointment);

      await expect(
        service.update(
          "t1",
          "inq-1",
          { status: InquiryStatus.CONVERTED, appointmentId: "appt-1" },
          "user-1",
        ),
      ).rejects.toMatchObject({ statusCode: 409, code: "INQUIRY_CUSTOMER_MISMATCH" });
    });

    it("links the booking when it really is this customer's", async () => {
      existing();
      vi.mocked(appointments.findOne).mockResolvedValue({
        id: "appt-1",
        tenantId: "t1",
        customerId: "cust-1",
      } as Appointment);

      const result = await service.update(
        "t1",
        "inq-1",
        { status: InquiryStatus.CONVERTED, appointmentId: "appt-1" },
        "user-1",
      );

      expect(result.status).toBe(InquiryStatus.CONVERTED);
      expect(result.appointmentId).toBe("appt-1");
    });

    it("clears the booking link when an inquiry is reopened", async () => {
      // The database check constraint forbids a non-converted row carrying an
      // appointment; clearing it here keeps that from surfacing as a 500.
      existing({ status: InquiryStatus.CONVERTED, appointmentId: "appt-1" });

      const result = await service.update("t1", "inq-1", { status: InquiryStatus.OPEN }, "user-1");

      expect(result.appointmentId).toBeNull();
    });

    it("closes rather than deletes, per rule §8", async () => {
      existing();

      const result = await service.update("t1", "inq-1", { status: InquiryStatus.CLOSED }, "user-1");

      expect(result.status).toBe(InquiryStatus.CLOSED);
      expect(inquiries.save).toHaveBeenCalled();
    });

    it("records the change in the audit trail", async () => {
      existing();

      await service.update("t1", "inq-1", { status: InquiryStatus.CLOSED }, "user-1");

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "INQUIRY_UPDATED", tenantId: "t1" }),
      );
    });
  });

  describe("list", () => {
    it("lists only this salon's inquiries", async () => {
      await service.list("t1", { limit: 25, offset: 0 });

      expect(inquiries.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: "t1" } }),
      );
    });

    it("filters by status when asked", async () => {
      await service.list("t1", { status: InquiryStatus.OPEN, limit: 25, offset: 0 });

      expect(inquiries.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: "t1", status: InquiryStatus.OPEN } }),
      );
    });
  });
});
