import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
// Repository must stay a VALUE import: NestJS resolves constructor
// injection via design:paramtypes metadata at runtime; `import type` would
// erase it and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Repository } from "typeorm";
import { ApiError, AppointmentStatus, type SubmitRatingDto } from "@salon/shared";
import { Rating } from "../entities/rating.entity";
import type { Appointment } from "../entities/appointment.entity";
import { isUniqueViolation } from "../common/postgres-errors.util";

export interface RatingSummary {
  /** Mean score, one decimal. Null when nobody has rated. */
  average: number | null;
  count: number;
}

export interface RatingView {
  id: string;
  score: number;
  comment: string | null;
  createdAt: Date;
  appointmentId: string;
}

@Injectable()
export class RatingService {
  constructor(@InjectRepository(Rating) private readonly ratings: Repository<Rating>) {}

  /**
   * Record a customer's rating of one appointment.
   *
   * The caller has already proved ownership by presenting the booking
   * reference and the phone it was booked with; this enforces the two rules
   * that ownership does not cover.
   */
  async submit(appointment: Appointment, dto: SubmitRatingDto): Promise<RatingView> {
    // You can only rate a visit that happened. Rating a booking that was
    // cancelled, missed, or has not occurred yet is not feedback about
    // anything the salon did.
    if (appointment.status !== AppointmentStatus.COMPLETED) {
      throw new ApiError({
        statusCode: 409,
        code: "APPOINTMENT_NOT_COMPLETED",
        message:
          appointment.status === AppointmentStatus.NO_SHOW ||
          appointment.status === AppointmentStatus.CANCELLED
            ? "This appointment did not take place, so there is nothing to rate."
            : "You can rate this visit once the salon has marked it complete.",
      });
    }

    const rating = this.ratings.create({
      tenantId: appointment.tenantId,
      appointmentId: appointment.id,
      customerId: appointment.customerId,
      staffId: appointment.staffId,
      score: dto.score,
      comment: dto.comment?.trim() || null,
    });

    try {
      const saved = await this.ratings.save(rating);
      return toView(saved);
    } catch (err) {
      // The unique index is the arbiter, not a check-then-insert: two taps on
      // a slow connection race, and only one may win.
      if (isUniqueViolation(err)) {
        throw new ApiError({
          statusCode: 409,
          code: "ALREADY_RATED",
          message: "You've already rated this visit. Thank you.",
        });
      }
      throw err;
    }
  }

  /** The rating on one appointment, if it has been given. */
  async findForAppointment(appointmentId: string): Promise<RatingView | null> {
    const rating = await this.ratings.findOne({ where: { appointmentId } });
    return rating ? toView(rating) : null;
  }

  /** Every rating this customer has left at this salon, newest first. */
  async listForCustomer(tenantId: string, customerId: string): Promise<RatingView[]> {
    const rows = await this.ratings.find({
      where: { tenantId, customerId },
      order: { createdAt: "DESC" },
    });
    return rows.map(toView);
  }

  async summaryForCustomer(tenantId: string, customerId: string): Promise<RatingSummary> {
    return this.summarise({ tenantId, customerId });
  }

  async summaryForStaff(tenantId: string, staffId: string): Promise<RatingSummary> {
    return this.summarise({ tenantId, staffId });
  }

  private async summarise(where: Record<string, string>): Promise<RatingSummary> {
    const row = await this.ratings
      .createQueryBuilder("r")
      .select("AVG(r.score)", "average")
      .addSelect("COUNT(*)::int", "count")
      .where(
        Object.keys(where)
          .map((key) => `r."${key}" = :${key}`)
          .join(" AND "),
        where,
      )
      .getRawOne<{ average: string | null; count: number }>();

    const count = Number(row?.count ?? 0);
    return {
      // Null rather than 0: an unrated salon has no score, and 0 out of 5
      // would be the worst possible one.
      average: count === 0 ? null : Math.round(Number(row?.average) * 10) / 10,
      count,
    };
  }
}

function toView(rating: Rating): RatingView {
  return {
    id: rating.id,
    score: rating.score,
    comment: rating.comment,
    createdAt: rating.createdAt,
    appointmentId: rating.appointmentId,
  };
}
