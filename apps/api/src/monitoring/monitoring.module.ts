import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ErrorLog } from "../entities/error-log.entity";
import { SecurityEventReview } from "../entities/security-event-review.entity";

/**
 * Registers the two tables the super-admin monitoring feature owns
 * (`ErrorLog`, `SecurityEventReview`) so their repositories are reachable
 * both from a future controller/service here (Phase B) and, in the
 * meantime, from `main.ts` via `app.get(getRepositoryToken(ErrorLog))` —
 * `ApiExceptionFilter` needs one but is instantiated outside Nest's DI
 * container (see `main.ts`), so this module just needs to exist in the
 * import graph, not export anything yet.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ErrorLog, SecurityEventReview])],
})
export class MonitoringModule {}
