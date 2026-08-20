import type { ObjectLiteral, Repository } from "typeorm";
import { AppointmentStatus } from "@salon/shared";
import { DashboardService } from "./dashboard.service";
import type { Appointment } from "../entities/appointment.entity";
import { colomboNow } from "../availability/time.util";

function mockRepo<T extends ObjectLiteral>() {
  return {
    find: vi.fn(async () => [] as T[]),
  } as unknown as Repository<T>;
}

const TODAY = colomboNow(new Date()).date;

function fakeAppointment(overrides: Partial<Appointment>): Appointment {
  return {
    id: "appt-1",
    tenantId: "tenant-1",
    appointmentDate: TODAY,
    startTime: new Date(),
    endTime: new Date(Date.now() + 30 * 60_000),
    status: AppointmentStatus.CONFIRMED,
    totalCents: 500000,
    balanceCents: 500000,
    ...overrides,
  } as Appointment;
}

describe("DashboardService", () => {
  let appointments: Repository<Appointment>;
  let service: DashboardService;

  beforeEach(() => {
    appointments = mockRepo<Appointment>();
    service = new DashboardService(appointments);
  });

  it("counts appointments by status", async () => {
    vi.mocked(appointments.find).mockResolvedValue([
      fakeAppointment({ id: "a", status: AppointmentStatus.CONFIRMED }),
      fakeAppointment({ id: "b", status: AppointmentStatus.CONFIRMED }),
      fakeAppointment({ id: "c", status: AppointmentStatus.COMPLETED }),
    ]);

    const result = await service.today("tenant-1");

    expect(result.countsByStatus[AppointmentStatus.CONFIRMED]).toBe(2);
    expect(result.countsByStatus[AppointmentStatus.COMPLETED]).toBe(1);
  });

  it("sums expected revenue and outstanding across active statuses, including COMPLETED", async () => {
    vi.mocked(appointments.find).mockResolvedValue([
      fakeAppointment({ id: "a", status: AppointmentStatus.CONFIRMED, totalCents: 1000, balanceCents: 400 }),
      fakeAppointment({ id: "b", status: AppointmentStatus.COMPLETED, totalCents: 2000, balanceCents: 0 }),
      fakeAppointment({ id: "c", status: AppointmentStatus.CANCELLED, totalCents: 5000, balanceCents: 5000 }),
      fakeAppointment({ id: "d", status: AppointmentStatus.NO_SHOW, totalCents: 3000, balanceCents: 3000 }),
      fakeAppointment({ id: "e", status: AppointmentStatus.RESCHEDULED, totalCents: 1500, balanceCents: 1500 }),
      fakeAppointment({ id: "f", status: AppointmentStatus.EXPIRED, totalCents: 700, balanceCents: 700 }),
    ]);

    const result = await service.today("tenant-1");

    // Only CONFIRMED + COMPLETED count — CANCELLED/NO_SHOW/RESCHEDULED/EXPIRED are excluded.
    expect(result.expectedRevenueCents).toBe(3000);
    expect(result.outstandingCents).toBe(400);
  });

  it("counts checkedInNow and inServiceNow independently", async () => {
    vi.mocked(appointments.find).mockResolvedValue([
      fakeAppointment({ id: "a", status: AppointmentStatus.CHECKED_IN }),
      fakeAppointment({ id: "b", status: AppointmentStatus.CHECKED_IN }),
      fakeAppointment({ id: "c", status: AppointmentStatus.IN_SERVICE }),
    ]);

    const result = await service.today("tenant-1");

    expect(result.checkedInNow).toBe(2);
    expect(result.inServiceNow).toBe(1);
  });

  it("counts CONFIRMED appointments past their start time as waitingLate, not future ones", async () => {
    vi.mocked(appointments.find).mockResolvedValue([
      fakeAppointment({ id: "past", status: AppointmentStatus.CONFIRMED, startTime: new Date(Date.now() - 60_000) }),
      fakeAppointment({ id: "future", status: AppointmentStatus.CONFIRMED, startTime: new Date(Date.now() + 60_000) }),
      // Already checked in — shouldn't count as "waiting" even though technically past start.
      fakeAppointment({
        id: "checked-in",
        status: AppointmentStatus.CHECKED_IN,
        startTime: new Date(Date.now() - 60_000),
      }),
    ]);

    const result = await service.today("tenant-1");

    expect(result.waitingLate).toBe(1);
  });

  it("counts cancellations and no-shows", async () => {
    vi.mocked(appointments.find).mockResolvedValue([
      fakeAppointment({ id: "a", status: AppointmentStatus.CANCELLED }),
      fakeAppointment({ id: "b", status: AppointmentStatus.CANCELLED }),
      fakeAppointment({ id: "c", status: AppointmentStatus.NO_SHOW }),
    ]);

    const result = await service.today("tenant-1");

    expect(result.cancellations).toBe(2);
    expect(result.noShows).toBe(1);
  });

  it("queries scoped to the tenant and today's Colombo-local appointmentDate", async () => {
    await service.today("tenant-1");

    // TypeORM types `where` as a union that does not overlap a plain object,
    // so this goes through unknown rather than pretending they are compatible.
    const where = vi.mocked(appointments.find).mock.calls[0][0]?.where as unknown as {
      tenantId: string;
      appointmentDate: { value: [string, string] };
    };
    expect(where.tenantId).toBe("tenant-1");
    // A single day is still expressed as a range, so there is one code path.
    expect(where.appointmentDate.value).toEqual([TODAY, TODAY]);
  });

  describe("summary", () => {
    function whereOf() {
      return vi.mocked(appointments.find).mock.calls[0][0]?.where as unknown as {
        appointmentDate: { value: [string, string] };
      };
    }

    it("defaults to today when no range is given", async () => {
      const result = await service.summary("tenant-1");

      expect(result.range).toEqual({ from: TODAY, to: TODAY });
      expect(whereOf().appointmentDate.value).toEqual([TODAY, TODAY]);
    });

    it("treats a lone `from` as a single day", async () => {
      const result = await service.summary("tenant-1", "2026-03-01");

      expect(result.range).toEqual({ from: "2026-03-01", to: "2026-03-01" });
    });

    it("reports live counts when the range covers today", async () => {
      vi.mocked(appointments.find).mockResolvedValue([
        fakeAppointment({ status: AppointmentStatus.CHECKED_IN }),
        fakeAppointment({ status: AppointmentStatus.IN_SERVICE }),
      ]);

      const result = await service.summary("tenant-1");

      expect(result.live).toEqual({ checkedInNow: 1, inServiceNow: 1, waitingLate: 0 });
    });

    it("returns no live block for a range that ended before today", async () => {
      // Zero would be a claim about right now; null says the question does not
      // apply to a historical range.
      const result = await service.summary("tenant-1", "2026-01-01", "2026-01-31");

      expect(result.live).toBeNull();
    });

    it("ignores rows from other days when counting who is in the salon now", async () => {
      vi.mocked(appointments.find).mockResolvedValue([
        fakeAppointment({ status: AppointmentStatus.CHECKED_IN, appointmentDate: "2026-01-02" }),
        fakeAppointment({ status: AppointmentStatus.CHECKED_IN }),
      ]);

      const result = await service.summary("tenant-1", "2026-01-01", TODAY);

      expect(result.live?.checkedInNow).toBe(1);
    });

    it("counts revenue across the whole range, not just today", async () => {
      vi.mocked(appointments.find).mockResolvedValue([
        fakeAppointment({ appointmentDate: "2026-01-02", totalCents: 100000, balanceCents: 0 }),
        fakeAppointment({ appointmentDate: "2026-01-03", totalCents: 250000, balanceCents: 50000 }),
      ]);

      const result = await service.summary("tenant-1", "2026-01-01", TODAY);

      expect(result.appointments).toBe(2);
      expect(result.expectedRevenueCents).toBe(350000);
      expect(result.outstandingCents).toBe(50000);
    });

    it("rejects an end date before the start", async () => {
      await expect(service.summary("tenant-1", "2026-03-10", "2026-03-01")).rejects.toMatchObject({
        statusCode: 400,
        code: "INVALID_DATE_RANGE",
      });
    });

    it("rejects a range wider than a year", async () => {
      await expect(service.summary("tenant-1", "2020-01-01", "2026-01-01")).rejects.toMatchObject({
        statusCode: 400,
        code: "DATE_RANGE_TOO_WIDE",
      });
    });
  });
});
