import type { DataSource, EntityManager, ObjectLiteral, Repository } from "typeorm";
import { PaymentMethod, PaymentProviderName, PaymentStatus, PaymentType, RefundStatus } from "@salon/shared";
import { PaymentService } from "./payment.service";
import { Payment } from "../entities/payment.entity";
import { Refund } from "../entities/refund.entity";
import { Appointment } from "../entities/appointment.entity";
import type { Tenant } from "../entities/tenant.entity";
import type { AuditService } from "../audit/audit.service";
import type { PaymentProviderResolver } from "./providers/resolve-payment-provider";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => ({ id: "generated-id", ...e }) as T),
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
  } as unknown as Repository<T>;
}

function fakeTenant(): Tenant {
  return { id: "tenant-1", slug: "elegance" } as Tenant;
}

describe("PaymentService", () => {
  let paymentsRepo: Repository<Payment>;
  let refundsRepo: Repository<Refund>;
  let appointmentsRepo: Repository<Appointment>;
  let dataSource: DataSource;
  let providers: PaymentProviderResolver;
  let audit: AuditService;
  let service: PaymentService;

  beforeEach(() => {
    paymentsRepo = mockRepo<Payment>();
    refundsRepo = mockRepo<Refund>();
    appointmentsRepo = mockRepo<Appointment>();

    const manager = {
      getRepository: (entity: unknown) => {
        if (entity === Payment) return paymentsRepo;
        if (entity === Refund) return refundsRepo;
        if (entity === Appointment) return appointmentsRepo;
        throw new Error("unexpected entity in test manager");
      },
    } as unknown as EntityManager;

    dataSource = {
      transaction: vi.fn(async (cb: (manager: EntityManager) => Promise<unknown>) => cb(manager)),
    } as unknown as DataSource;

    providers = {
      resolve: vi.fn(() => ({
        confirm: vi.fn(async () => ({ providerPaymentRef: null })),
        refund: vi.fn(async () => ({ providerRef: null })),
      })),
    } as unknown as PaymentProviderResolver;

    audit = { record: vi.fn() } as unknown as AuditService;

    service = new PaymentService(dataSource, paymentsRepo, providers, audit);
  });

  function fakeAppointment(overrides: Partial<Appointment> = {}): Appointment {
    return {
      id: "appt-1",
      customerId: "cust-1",
      totalCents: 10000,
      advancePaidCents: 0,
      balanceCents: 10000,
      ...overrides,
    } as Appointment;
  }

  describe("recordPayment", () => {
    it("rejects an amount exceeding the outstanding balance", async () => {
      const appointment = fakeAppointment({ balanceCents: 5000 });
      const manager = { getRepository: () => paymentsRepo } as unknown as EntityManager;

      await expect(
        service.recordPayment(manager, fakeTenant(), appointment, {
          amountCents: 6000,
          method: PaymentMethod.CASH,
          type: PaymentType.FULL,
          provider: PaymentProviderName.MANUAL,
          recordedById: "user-1",
          idempotencyKey: "11111111-1111-4111-8111-111111111111",
        }),
      ).rejects.toMatchObject({ statusCode: 400, code: "PAYMENT_EXCEEDS_BALANCE" });
    });

    it("creates a SUCCESS payment and updates the appointment's paid/balance in place", async () => {
      const appointment = fakeAppointment({ balanceCents: 10000 });
      const manager = {
        getRepository: (entity: unknown) => {
          if (entity === Payment) return paymentsRepo;
          if (entity === Appointment) return appointmentsRepo;
          throw new Error("unexpected entity");
        },
      } as unknown as EntityManager;

      const payment = await service.recordPayment(manager, fakeTenant(), appointment, {
        amountCents: 4000,
        method: PaymentMethod.CASH,
        type: PaymentType.ADVANCE,
        provider: PaymentProviderName.MANUAL,
        recordedById: "user-1",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
      });

      expect(payment.state).toBe(PaymentStatus.SUCCESS);
      expect(appointment.advancePaidCents).toBe(4000);
      expect(appointment.balanceCents).toBe(6000);
      expect(appointmentsRepo.save).toHaveBeenCalledWith(appointment);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "PAYMENT_RECORDED" }),
        manager,
      );
    });

    it("returns the existing payment immediately when the idempotencyKey was already recorded (proactive check)", async () => {
      const appointment = fakeAppointment({ balanceCents: 0 }); // already fully paid — a retry must NOT hit the balance check
      const existing = { id: "payment-existing" } as Payment;
      vi.mocked(paymentsRepo.findOne).mockResolvedValueOnce(existing);
      const manager = {
        getRepository: (entity: unknown) => {
          if (entity === Payment) return paymentsRepo;
          if (entity === Appointment) return appointmentsRepo;
          throw new Error("unexpected entity");
        },
      } as unknown as EntityManager;

      const result = await service.recordPayment(manager, fakeTenant(), appointment, {
        amountCents: 1000,
        method: PaymentMethod.CASH,
        type: PaymentType.BALANCE,
        provider: PaymentProviderName.MANUAL,
        recordedById: "user-1",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
      });

      expect(result).toBe(existing);
      expect(paymentsRepo.save).not.toHaveBeenCalled();
      expect(appointmentsRepo.save).not.toHaveBeenCalled();
    });

    it("returns the winning payment when a true concurrent race loses the insert (unique violation)", async () => {
      const appointment = fakeAppointment({ balanceCents: 10000 });
      const existing = { id: "payment-existing" } as Payment;
      vi.mocked(paymentsRepo.findOne)
        .mockResolvedValueOnce(null) // proactive check: nothing recorded yet
        .mockResolvedValueOnce(existing); // catch-block re-query: the concurrent winner
      vi.mocked(paymentsRepo.save).mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "23505" }));
      const manager = {
        getRepository: (entity: unknown) => {
          if (entity === Payment) return paymentsRepo;
          if (entity === Appointment) return appointmentsRepo;
          throw new Error("unexpected entity");
        },
      } as unknown as EntityManager;

      const result = await service.recordPayment(manager, fakeTenant(), appointment, {
        amountCents: 1000,
        method: PaymentMethod.CASH,
        type: PaymentType.BALANCE,
        provider: PaymentProviderName.MANUAL,
        recordedById: "user-1",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
      });

      expect(result).toBe(existing);
      expect(appointmentsRepo.save).not.toHaveBeenCalled();
    });
  });

  describe("refund", () => {
    function fakePayment(overrides: Partial<Payment> = {}): Payment {
      return {
        id: "payment-1",
        tenantId: "tenant-1",
        appointmentId: "appt-1",
        amountCents: 5000,
        provider: PaymentProviderName.MANUAL,
        providerPaymentRef: null,
        state: PaymentStatus.SUCCESS,
        ...overrides,
      } as Payment;
    }

    it("404s when the payment doesn't exist for this tenant", async () => {
      vi.mocked(paymentsRepo.findOne).mockResolvedValue(null);
      await expect(
        service.refund(fakeTenant(), "payment-1", { amountCents: 1000, reason: "customer request" }, "user-1"),
      ).rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
    });

    it("rejects a refund amount exceeding what's refundable", async () => {
      vi.mocked(paymentsRepo.findOne).mockResolvedValue(fakePayment({ amountCents: 5000 }));
      vi.mocked(refundsRepo.find).mockResolvedValue([{ amountCents: 4000 } as Refund]);

      await expect(
        service.refund(fakeTenant(), "payment-1", { amountCents: 2000, reason: "too much" }, "user-1"),
      ).rejects.toMatchObject({ statusCode: 400, code: "REFUND_EXCEEDS_PAYMENT" });
    });

    it("a full refund marks the payment REFUNDED and restores the appointment balance", async () => {
      vi.mocked(paymentsRepo.findOne).mockResolvedValue(fakePayment({ amountCents: 5000 }));
      vi.mocked(refundsRepo.find).mockResolvedValue([]);
      vi.mocked(appointmentsRepo.findOne).mockResolvedValue(
        fakeAppointment({ advancePaidCents: 5000, balanceCents: 5000 }),
      );

      const refund = await service.refund(
        fakeTenant(),
        "payment-1",
        { amountCents: 5000, reason: "cancelled" },
        "user-1",
      );

      expect(refund.state).toBe(RefundStatus.SUCCEEDED);
      expect(paymentsRepo.save).toHaveBeenCalledWith(expect.objectContaining({ state: PaymentStatus.REFUNDED }));
      expect(appointmentsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ advancePaidCents: 0, balanceCents: 10000 }),
      );
    });

    it("a partial refund marks the payment PARTIALLY_REFUNDED", async () => {
      vi.mocked(paymentsRepo.findOne).mockResolvedValue(fakePayment({ amountCents: 5000 }));
      vi.mocked(refundsRepo.find).mockResolvedValue([]);
      vi.mocked(appointmentsRepo.findOne).mockResolvedValue(
        fakeAppointment({ advancePaidCents: 5000, balanceCents: 5000 }),
      );

      await service.refund(fakeTenant(), "payment-1", { amountCents: 2000, reason: "partial" }, "user-1");

      expect(paymentsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ state: PaymentStatus.PARTIALLY_REFUNDED }),
      );
    });
  });

  describe("recordPaymentForAppointment", () => {
    it("404s when the appointment doesn't exist for this tenant", async () => {
      vi.mocked(appointmentsRepo.findOne).mockResolvedValue(null);
      await expect(
        service.recordPaymentForAppointment(
          fakeTenant(),
          "appt-missing",
          { amountCents: 1000, method: PaymentMethod.CASH, type: PaymentType.FULL },
          "user-1",
          "11111111-1111-4111-8111-111111111111",
        ),
      ).rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
    });
  });
});
