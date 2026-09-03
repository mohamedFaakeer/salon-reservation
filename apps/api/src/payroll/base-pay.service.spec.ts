import type { ObjectLiteral, Repository } from "typeorm";
import { AttendanceDayStatus, PayFrequency } from "@salon/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BasePayService } from "./base-pay.service";
import type { Employment } from "../entities/employment.entity";
import type { Staff } from "../entities/staff.entity";
import type { StaffLeave } from "../entities/staff-leave.entity";
import type { AttendanceService } from "../attendance/attendance.service";

function mockRepo<T extends ObjectLiteral>() {
  return {
    find: vi.fn(async () => [] as T[]),
    findOne: vi.fn(async () => null as T | null),
    createQueryBuilder: vi.fn(() => queryBuilder([])),
  } as unknown as Repository<T>;
}

function queryBuilder(rows: unknown[]) {
  const qb: Record<string, unknown> = {};
  for (const method of ["where", "andWhere"]) {
    qb[method] = vi.fn(() => qb);
  }
  qb.getMany = vi.fn(async () => rows);
  return qb;
}

function employment(overrides: Partial<Employment> = {}): Employment {
  return {
    id: "emp-1",
    staffId: "s1",
    payFrequency: PayFrequency.MONTHLY,
    baseRateCents: 300_000,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("BasePayService", () => {
  let employments: Repository<Employment>;
  let leaves: Repository<StaffLeave>;
  let staff: Repository<Staff>;
  let attendance: { report: ReturnType<typeof vi.fn> };
  let service: BasePayService;

  beforeEach(() => {
    employments = mockRepo<Employment>();
    leaves = mockRepo<StaffLeave>();
    staff = mockRepo<Staff>();
    attendance = { report: vi.fn() };
    vi.mocked(staff.findOne).mockResolvedValue({ id: "s1", name: "Nadia" } as Staff);
    service = new BasePayService(employments, leaves, staff, attendance as unknown as AttendanceService);
  });

  it("rejects an unknown staff member", async () => {
    vi.mocked(staff.findOne).mockResolvedValue(null);
    await expect(service.preview("tenant-1", { staffId: "ghost", from: "2026-09-01", to: "2026-09-02" })).rejects.toMatchObject({
      code: "STAFF_NOT_FOUND",
    });
  });

  it("assembles day inputs from Employment + Attendance + StaffLeave and sums a real MONTHLY figure", async () => {
    vi.mocked(employments.find).mockResolvedValue([employment({ baseRateCents: 300_000 })]);
    attendance.report.mockResolvedValue({
      range: { from: "2026-09-01", to: "2026-09-02", days: 2 },
      summary: [],
      days: [
        { workDate: "2026-09-01", status: AttendanceDayStatus.PRESENT },
        { workDate: "2026-09-02", status: AttendanceDayStatus.ABSENT },
      ],
    });

    const result = await service.preview("tenant-1", { staffId: "s1", from: "2026-09-01", to: "2026-09-02" });

    expect(result.staffName).toBe("Nadia");
    // Day 1 earns a thirtieth of the monthly rate (10,000); day 2 is a confirmed unpaid absence (0).
    expect(result.earnedCents).toBe(10_000);
    expect(result.unpaidAbsenceDays).toBe(1);
    expect(result.days).toHaveLength(2);
  });

  it("reads the paid flag off the covering StaffLeave for a DAILY employee's ON_LEAVE day", async () => {
    vi.mocked(employments.find).mockResolvedValue([employment({ payFrequency: PayFrequency.DAILY, baseRateCents: 5_000 })]);
    vi.mocked(leaves.createQueryBuilder).mockReturnValue(
      queryBuilder([{ startDate: "2026-09-01", endDate: "2026-09-01", paid: false }]) as never,
    );
    attendance.report.mockResolvedValue({
      range: { from: "2026-09-01", to: "2026-09-01", days: 1 },
      summary: [],
      days: [{ workDate: "2026-09-01", status: AttendanceDayStatus.ON_LEAVE }],
    });

    const result = await service.preview("tenant-1", { staffId: "s1", from: "2026-09-01", to: "2026-09-01" });

    expect(result.earnedCents).toBe(0);
    expect(result.days[0].note).toBe("UNPAID_LEAVE");
  });

  it("a date outside any Employment version is flagged rather than silently zeroed", async () => {
    vi.mocked(employments.find).mockResolvedValue([]);
    attendance.report.mockResolvedValue({
      range: { from: "2026-09-01", to: "2026-09-01", days: 1 },
      summary: [],
      days: [{ workDate: "2026-09-01", status: AttendanceDayStatus.PRESENT }],
    });

    const result = await service.preview("tenant-1", { staffId: "s1", from: "2026-09-01", to: "2026-09-01" });

    expect(result.daysWithoutEmployment).toBe(1);
    expect(result.days[0].note).toBe("NO_EMPLOYMENT");
  });
});
