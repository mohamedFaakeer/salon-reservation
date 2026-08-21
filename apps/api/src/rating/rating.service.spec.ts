import type { ObjectLiteral, Repository } from "typeorm";
import { AppointmentStatus } from "@salon/shared";
import { RatingService } from "./rating.service";
import type { Rating } from "../entities/rating.entity";
import type { Appointment } from "../entities/appointment.entity";

function mockRepo<T extends ObjectLiteral>() {
  return {
    create: vi.fn((e: Partial<T>) => e as T),
    save: vi.fn(async (e: T) => ({ id: "rating-1", createdAt: new Date(), ...e }) as T),
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
    createQueryBuilder: vi.fn(),
  } as unknown as Repository<T>;
}

function fakeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "appt-1",
    tenantId: "t1",
    customerId: "c1",
    staffId: "s1",
    status: AppointmentStatus.COMPLETED,
    ...overrides,
  } as Appointment;
}

/** The shape node-postgres raises on a unique index collision. */
function uniqueViolation(): Error {
  return Object.assign(new Error("duplicate key"), { code: "23505" });
}

describe("RatingService", () => {
  let ratings: Repository<Rating>;
  let service: RatingService;

  beforeEach(() => {
    ratings = mockRepo<Rating>();
    service = new RatingService(ratings);
  });

  describe("submit", () => {
    it("records a rating against a completed visit", async () => {
      const result = await service.submit(fakeAppointment(), { phone: "0771234567", score: 5 });

      const created = vi.mocked(ratings.create).mock.calls[0][0] as Rating;
      expect(created.tenantId).toBe("t1");
      expect(created.customerId).toBe("c1");
      // Denormalised so a stylist's ratings can be read without walking the
      // appointment every time.
      expect(created.staffId).toBe("s1");
      expect(created.score).toBe(5);
      expect(result.score).toBe(5);
    });

    it("stores a blank comment as null rather than an empty string", async () => {
      await service.submit(fakeAppointment(), { phone: "0771234567", score: 4, comment: "   " });

      const created = vi.mocked(ratings.create).mock.calls[0][0] as Rating;
      expect(created.comment).toBeNull();
    });

    it.each([
      [AppointmentStatus.CONFIRMED],
      [AppointmentStatus.CHECKED_IN],
      [AppointmentStatus.IN_SERVICE],
    ])("refuses to rate a visit still in progress (%s)", async (status) => {
      await expect(
        service.submit(fakeAppointment({ status }), { phone: "0771234567", score: 5 }),
      ).rejects.toMatchObject({ statusCode: 409, code: "APPOINTMENT_NOT_COMPLETED" });
    });

    it.each([[AppointmentStatus.CANCELLED], [AppointmentStatus.NO_SHOW]])(
      "tells a customer plainly that a %s visit cannot be rated",
      async (status) => {
        await expect(
          service.submit(fakeAppointment({ status }), { phone: "0771234567", score: 1 }),
        ).rejects.toMatchObject({
          code: "APPOINTMENT_NOT_COMPLETED",
          message: "This appointment did not take place, so there is nothing to rate.",
        });
      },
    );

    it("lets the unique index decide the double-submit race", async () => {
      // Two taps on a slow connection. A check-then-insert would let both
      // through; the database is the arbiter.
      vi.mocked(ratings.save).mockRejectedValueOnce(uniqueViolation());

      await expect(
        service.submit(fakeAppointment(), { phone: "0771234567", score: 5 }),
      ).rejects.toMatchObject({ statusCode: 409, code: "ALREADY_RATED" });
    });

    it("does not swallow an unrelated database failure", async () => {
      const boom = new Error("connection lost");
      vi.mocked(ratings.save).mockRejectedValueOnce(boom);

      await expect(
        service.submit(fakeAppointment(), { phone: "0771234567", score: 5 }),
      ).rejects.toThrow("connection lost");
    });
  });

  describe("summary", () => {
    function seedSummary(average: string | null, count: number) {
      const qb = {
        select: vi.fn(() => qb),
        addSelect: vi.fn(() => qb),
        where: vi.fn(() => qb),
        getRawOne: vi.fn(async () => ({ average, count })),
      };
      vi.mocked(ratings.createQueryBuilder).mockReturnValue(qb as never);
      return qb;
    }

    it("rounds the mean to one decimal", async () => {
      seedSummary("4.6666", 3);

      const result = await service.summaryForCustomer("t1", "c1");

      expect(result).toEqual({ average: 4.7, count: 3 });
    });

    it("reports no average when nothing has been rated", async () => {
      seedSummary(null, 0);

      const result = await service.summaryForStaff("t1", "s1");

      // Zero out of five would be the worst score there is, not the absence
      // of one.
      expect(result).toEqual({ average: null, count: 0 });
    });

    it("scopes a staff summary to the tenant as well as the stylist", async () => {
      const qb = seedSummary("5", 1);

      await service.summaryForStaff("t1", "s1");

      expect(qb.where).toHaveBeenCalledWith(expect.stringContaining("tenantId"), {
        tenantId: "t1",
        staffId: "s1",
      });
    });
  });
});
