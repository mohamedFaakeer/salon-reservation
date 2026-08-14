import { ManualProvider } from "./manual.provider";

describe("ManualProvider", () => {
  const provider = new ManualProvider();

  it("confirm() resolves instantly with no provider reference", async () => {
    const result = await provider.confirm({ amountCents: 1000, idempotencyKey: "key-1" });
    expect(result).toEqual({ providerPaymentRef: null });
  });

  it("refund() resolves instantly with no provider reference", async () => {
    const result = await provider.refund({ amountCents: 500, providerPaymentRef: null });
    expect(result).toEqual({ providerRef: null });
  });
});
