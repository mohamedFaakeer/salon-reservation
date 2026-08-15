import { SmsNotificationProvider } from "./sms.provider";

describe("SmsNotificationProvider", () => {
  it("always throws NOT_IMPLEMENTED (never invoked live)", async () => {
    const provider = new SmsNotificationProvider();
    await expect(provider.send({ recipient: "+94771234567", subject: "S", body: "B" })).rejects.toMatchObject({
      statusCode: 501,
      code: "NOT_IMPLEMENTED",
    });
  });
});
