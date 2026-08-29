import { Injectable } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { In, Repository } from "typeorm";
import {
  ApiError,
  type CreateStaffDto,
  type SetStaffServicesDto,
  type UpdateStaffDto,
} from "@salon/shared";
import { Staff } from "../entities/staff.entity";
import { StaffServiceAssignment } from "../entities/staff-service.entity";
import { Service } from "../entities/service.entity";
import { User } from "../entities/user.entity";
import { IncentivePlan } from "../entities/incentive-plan.entity";
import { detectImage } from "../common/image.util";
// CloudinaryService must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CloudinaryService } from "../cloudinary/cloudinary.service";

/**
 * Deliberately tighter than a product photo's 3:1 (`PRODUCT_IMAGE_MAX_ASPECT_RATIO`)
 * — a headshot that's 3x wider than tall isn't a face crop gone slightly odd,
 * it's the wrong kind of photo entirely. Matches the tenant logo's own 2:1.
 */
const STAFF_PHOTO_MAX_BYTES = 2_000_000;
const STAFF_PHOTO_MIN_DIMENSION = 200;
const STAFF_PHOTO_MAX_DIMENSION = 4000;
const STAFF_PHOTO_MAX_ASPECT_RATIO = 2;

@Injectable()
export class StaffService {
  constructor(
    @InjectRepository(Staff) private readonly staff: Repository<Staff>,
    @InjectRepository(StaffServiceAssignment)
    private readonly assignments: Repository<StaffServiceAssignment>,
    @InjectRepository(Service) private readonly services: Repository<Service>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(IncentivePlan) private readonly incentivePlans: Repository<IncentivePlan>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cloudinary: CloudinaryService,
  ) {}

  /**
   * `maxStaff` is a hard seat cap (`TenantLimits`, resolved by `TenantGuard`):
   * this salon's plan says how many bookable stylist profiles it may have,
   * `null` meaning unlimited. Checked against active profiles — a retired
   * stylist doesn't count against the cap they're no longer using.
   */
  async create(tenantId: string, dto: CreateStaffDto, maxStaff: number | null): Promise<Staff> {
    if (dto.userId) {
      await this.assertUserLinkable(tenantId, dto.userId);
    }
    if (maxStaff !== null) {
      const activeCount = await this.staff.count({ where: { tenantId, active: true } });
      if (activeCount >= maxStaff) {
        throw new ApiError({
          statusCode: 409,
          code: "STAFF_LIMIT_REACHED",
          message: `This salon's plan allows up to ${maxStaff} stylist${maxStaff === 1 ? "" : "s"}. Ask your account manager to raise the limit.`,
        });
      }
    }
    return this.staff.save(
      this.staff.create({
        tenantId,
        branchId: null,
        userId: dto.userId ?? null,
        name: dto.name.trim(),
        phone: dto.phone?.trim() ?? null,
        specialties: dto.specialties?.trim() ?? null,
        color: dto.color ?? null,
        active: true,
        jobTitle: dto.jobTitle?.trim() ?? null,
        gender: dto.gender ?? null,
      }),
    );
  }

  async list(tenantId: string): Promise<Staff[]> {
    return this.staff.find({ where: { tenantId }, order: { name: "ASC" } });
  }

  async update(tenantId: string, id: string, dto: UpdateStaffDto): Promise<Staff> {
    const staff = await this.findOwned(tenantId, id);

    if (dto.userId != null && dto.userId !== staff.userId) {
      await this.assertUserLinkable(tenantId, dto.userId, id);
    }

    if (dto.name !== undefined) staff.name = dto.name.trim();
    if (dto.phone !== undefined) staff.phone = dto.phone.trim();
    if (dto.specialties !== undefined) staff.specialties = dto.specialties.trim();
    if (dto.color !== undefined) staff.color = dto.color;
    if (dto.userId !== undefined) staff.userId = dto.userId;
    if (dto.active !== undefined) staff.active = dto.active;
    if (dto.jobTitle !== undefined) staff.jobTitle = dto.jobTitle.trim();
    if (dto.gender !== undefined) staff.gender = dto.gender;

    if (dto.incentivePlanId !== undefined) {
      if (dto.incentivePlanId !== null) {
        // Never trust the id: it must be a plan this salon actually owns,
        // never one guessed or copied from another tenant.
        const owned = await this.incentivePlans.findOne({
          where: { id: dto.incentivePlanId, tenantId },
        });
        if (!owned) {
          throw new ApiError({
            statusCode: 404,
            code: "INCENTIVE_PLAN_NOT_FOUND",
            message: "That incentive plan does not belong to this salon.",
          });
        }
      }
      staff.incentivePlanId = dto.incentivePlanId;
    }

    return this.staff.save(staff);
  }

  /**
   * Every staff member's service ids in one query.
   *
   * The skills matrix used to call `getServices` once per stylist, so opening
   * it cost one request per member and grew with the team — a thirty-stylist
   * salon spent thirty-one requests to draw one grid, and the admin app's own
   * rate limit was the first thing to notice.
   */
  async listAllServiceAssignments(
    tenantId: string,
  ): Promise<Array<{ staffId: string; serviceIds: string[] }>> {
    const rows = await this.assignments.find({ where: { tenantId } });
    const byStaff = new Map<string, string[]>();
    for (const row of rows) {
      const existing = byStaff.get(row.staffId);
      if (existing) {
        existing.push(row.serviceId);
      } else {
        byStaff.set(row.staffId, [row.serviceId]);
      }
    }
    return [...byStaff].map(([staffId, serviceIds]) => ({ staffId, serviceIds }));
  }

  async getServices(tenantId: string, staffId: string): Promise<Service[]> {
    await this.findOwned(tenantId, staffId);
    const rows = await this.assignments.find({ where: { tenantId, staffId } });
    if (rows.length === 0) {
      return [];
    }
    return this.services.find({ where: { id: In(rows.map((r) => r.serviceId)) } });
  }

  /** Replaces the full assignment set — matches checkbox-form semantics (UX.md). */
  async setServices(
    tenantId: string,
    staffId: string,
    dto: SetStaffServicesDto,
  ): Promise<Service[]> {
    await this.findOwned(tenantId, staffId);

    const uniqueIds = Array.from(new Set(dto.serviceIds));
    if (uniqueIds.length > 0) {
      const owned = await this.services.find({
        where: { id: In(uniqueIds), tenantId },
      });
      if (owned.length !== uniqueIds.length) {
        throw new ApiError({
          statusCode: 400,
          code: "INVALID_SERVICE_IDS",
          message: "One or more services do not belong to this salon.",
        });
      }
    }

    await this.dataSource.transaction(async (manager) => {
      const assignmentRepo = manager.getRepository(StaffServiceAssignment);
      await assignmentRepo.delete({ staffId, tenantId });
      if (uniqueIds.length > 0) {
        await assignmentRepo.save(
          uniqueIds.map((serviceId) =>
            assignmentRepo.create({ staffId, serviceId, tenantId }),
          ),
        );
      }
    });

    return this.getServices(tenantId, staffId);
  }

  async uploadPhoto(tenantId: string, id: string, buffer: Buffer): Promise<Staff> {
    this.assertPhotoValid(buffer);
    const staff = await this.findOwned(tenantId, id);
    const imageUrl = await this.cloudinary.uploadStaffPhoto(buffer, `staff-photos/${tenantId}`);
    staff.imageUrl = imageUrl;
    return this.staff.save(staff);
  }

  /** No Cloudinary-side delete — an orphaned free-tier asset is an accepted, documented gap, same as a tenant logo or product photo. */
  async removePhoto(tenantId: string, id: string): Promise<Staff> {
    const staff = await this.findOwned(tenantId, id);
    staff.imageUrl = null;
    return this.staff.save(staff);
  }

  private assertPhotoValid(buffer: Buffer): void {
    if (buffer.byteLength > STAFF_PHOTO_MAX_BYTES) {
      throw new ApiError({
        statusCode: 400,
        code: "STAFF_PHOTO_FILE_TOO_LARGE",
        message: `That file is too large — the limit is ${STAFF_PHOTO_MAX_BYTES / 1_000_000} MB.`,
      });
    }
    const detected = detectImage(buffer);
    if (!detected) {
      throw new ApiError({
        statusCode: 400,
        code: "STAFF_PHOTO_INVALID_FILE_TYPE",
        message: "That isn't a PNG, JPEG or WebP image.",
      });
    }
    const { width, height } = detected;
    if (
      width < STAFF_PHOTO_MIN_DIMENSION ||
      height < STAFF_PHOTO_MIN_DIMENSION ||
      width > STAFF_PHOTO_MAX_DIMENSION ||
      height > STAFF_PHOTO_MAX_DIMENSION
    ) {
      throw new ApiError({
        statusCode: 400,
        code: "STAFF_PHOTO_DIMENSIONS_OUT_OF_RANGE",
        message: `Image dimensions must be between ${STAFF_PHOTO_MIN_DIMENSION}×${STAFF_PHOTO_MIN_DIMENSION} and ${STAFF_PHOTO_MAX_DIMENSION}×${STAFF_PHOTO_MAX_DIMENSION}px.`,
      });
    }
    const ratio = width / height;
    if (ratio > STAFF_PHOTO_MAX_ASPECT_RATIO || ratio < 1 / STAFF_PHOTO_MAX_ASPECT_RATIO) {
      throw new ApiError({
        statusCode: 400,
        code: "STAFF_PHOTO_ASPECT_RATIO_INVALID",
        message: `That's an unusually elongated shape for a portrait photo — keep it within ${STAFF_PHOTO_MAX_ASPECT_RATIO}:1.`,
      });
    }
  }

  private async findOwned(tenantId: string, id: string): Promise<Staff> {
    const staff = await this.staff.findOne({ where: { id, tenantId } });
    if (!staff) {
      throw new ApiError({
        statusCode: 404,
        code: "STAFF_NOT_FOUND",
        message: "Staff member not found.",
      });
    }
    return staff;
  }

  /** Validates the linked user exists and isn't already linked to another staff row in this tenant. */
  private async assertUserLinkable(
    tenantId: string,
    userId: string,
    excludeStaffId?: string,
  ): Promise<void> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new ApiError({
        statusCode: 400,
        code: "USER_NOT_FOUND",
        message: "Linked user does not exist.",
      });
    }
    const existing = await this.staff.findOne({ where: { tenantId, userId } });
    if (existing && existing.id !== excludeStaffId) {
      throw new ApiError({
        statusCode: 409,
        code: "STAFF_USER_ALREADY_LINKED",
        message: "This user is already linked to another staff member.",
      });
    }
  }
}
