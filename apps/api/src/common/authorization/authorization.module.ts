import { Module, type Provider } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { RolesGuard } from "./roles.guard";
import { ModuleGuard } from "./module.guard";

const rolesGuardProvider: Provider = {
  provide: APP_GUARD,
  useClass: RolesGuard,
};

// Registered after RolesGuard within the same module, so a permission check
// always settles before an entitlements check — see module.guard.ts.
const moduleGuardProvider: Provider = {
  provide: APP_GUARD,
  useClass: ModuleGuard,
};

@Module({
  providers: [RolesGuard, ModuleGuard, rolesGuardProvider, moduleGuardProvider],
})
export class AuthorizationModule {}
