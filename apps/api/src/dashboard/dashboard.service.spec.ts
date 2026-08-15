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

    expect(appointments.find).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", appointmentDate: TODAY },
    });
  });
});
