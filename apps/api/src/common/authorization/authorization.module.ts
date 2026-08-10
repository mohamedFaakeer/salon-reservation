import { Module, type Provider } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { RolesGuard } from "./roles.guard";

const globalGuard: Provider = {
  provide: APP_GUARD,
  useClass: RolesGuard,
};

@Module({
  providers: [RolesGuard, globalGuard],
})
export class AuthorizationModule {}
