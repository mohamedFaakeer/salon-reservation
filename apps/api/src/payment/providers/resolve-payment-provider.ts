import { Injectable } from "@nestjs/common";
import { PaymentProviderName } from "@salon/shared";
// ManualProvider/PayHereProvider must stay VALUE imports: NestJS resolves
// constructor injection via design:paramtypes metadata at runtime;
// `import type` would erase them and break DI.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ManualProvider } from "./manual.provider";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PayHereProvider } from "./payhere.provider";
import type { PaymentProvider } from "./payment-provider.interface";

/** Always resolves to ManualProvider today — nothing in this phase sets provider to "payhere". */
@Injectable()
export class PaymentProviderResolver {
  constructor(
    private readonly manual: ManualProvider,
    private readonly payhere: PayHereProvider,
  ) {}

  resolve(name: PaymentProviderName): PaymentProvider {
    return name === PaymentProviderName.PAYHERE ? this.payhere : this.manual;
  }
}
