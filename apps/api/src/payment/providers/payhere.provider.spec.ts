import { PayHereProvider } from "./payhere.provider";

describe("PayHereProvider", () => {
  it("confirm() always throws NOT_IMPLEMENTED (never actually invoked live)", async () => {
    const provider = new PayHereProvider();
    await expect(provider.confirm({ amountCents: 1000, idempotencyKey: "key-1" })).rejects.toMatchObject({
      statusCode: 501,
      code: "NOT_IMPLEMENTED",
    });
  });

  it("refund() always throws NOT_IMPLEMENTED", async () => {
    const provider = new PayHereProvider();
    await expect(provider.refund({ amountCents: 500, providerPaymentRef: null })).rejects.toMatchObject({
      statusCode: 501,
      code: "NOT_IMPLEMENTED",
    });
  });

  it("enabled flag reflects PAYMENTS_PAYHERE_ENABLED, defaulting to false", () => {
    expect(new PayHereProvider().enabled).toBe(false);
  });
});
