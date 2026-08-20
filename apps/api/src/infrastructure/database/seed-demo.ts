/**
 * Local demo bootstrap (`npm run db:seed:demo`, DEPLOYMENT.md §10).
 *
 * Migrations already create the platform super-admin, the `elegance` tenant and
 * its owner (1740000000000-InitialIdentity). This script fills that tenant with
 * the demo *business* data — catalogue, staff, schedules, customers and a few
 * sample appointments — which migrations deliberately do not own, because it is
 * demo content rather than schema.
 *
 * On a real deployment the equivalent is done over HTTP
 * (POST /super-admin/tenants/:id/demo-seed). Both paths call the same
 * DemoSeedService, so local and deployed demo data cannot drift apart.
 *
 * Idempotent: safe to re-run.
 */
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AppModule } from "../../app.module";
import { DemoSeedService } from "../../super-admin/demo-seed.service";
import { Tenant } from "../../entities/tenant.entity";
import { User } from "../../entities/user.entity";

const SLUG = process.env.DEMO_TENANT_SLUG ?? "elegance";

async function main(): Promise<void> {
  const logger = new Logger("SeedDemo");
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });

  try {
    const dataSource = app.get(DataSource);

    const tenant = await dataSource.getRepository(Tenant).findOne({ where: { slug: SLUG } });
    if (!tenant) {
      throw new Error(
        `Tenant "${SLUG}" not found. Run "npm run db:migrate" first — migrations create it.`,
      );
    }

    // The audit trail needs a real actor; the platform super-admin is the one
    // who would perform this action over HTTP, so attribute it there too.
    const actor = await dataSource.getRepository(User).findOne({ where: { isSuperAdmin: true } });
    if (!actor) {
      throw new Error('No super-admin user found. Run "npm run db:migrate" first.');
    }

    const result = await app.get(DemoSeedService).seed(tenant.id, actor.id);

    if (result.seeded) {
      logger.log(
        `Seeded ${result.counts.services} services, ${result.counts.staff} staff, ` +
          `${result.counts.customers} customers, ${result.counts.appointments} appointments ` +
          `into "${tenant.slug}".`,
      );
    } else {
      logger.log(`Tenant "${tenant.slug}" already has demo data — nothing to do.`);
    }
    logger.log(`Customer booking page: /salon/${tenant.slug}`);
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  new Logger("SeedDemo").error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
