import { SetMetadata } from "@nestjs/common";
import type { ModuleKey } from "@salon/shared";

export const MODULE_KEY = "requiredModule";

/** Gates an entire controller (or one route) behind the tenant's Lite/Pro entitlements. */
export const RequiresModule = (module: ModuleKey) => SetMetadata(MODULE_KEY, module);
