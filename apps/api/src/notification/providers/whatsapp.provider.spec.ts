import { WhatsAppNotificationProvider } from "./whatsapp.provider";

describe("WhatsAppNotificationProvider", () => {
  it("always throws NOT_IMPLEMENTED (never invoked live)", async () => {
    const provider = new WhatsAppNotificationProvider();
    await expect(provider.send({ recipient: "+94771234567", subject: "S", body: "B" })).rejects.toMatchObject({
      statusCode: 501,
      code: "NOT_IMPLEMENTED",
    });
  });
});
