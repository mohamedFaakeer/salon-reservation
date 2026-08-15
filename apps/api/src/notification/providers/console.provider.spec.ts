import { ConsoleNotificationProvider } from "./console.provider";

describe("ConsoleNotificationProvider", () => {
  it("always succeeds with no provider message id", async () => {
    const provider = new ConsoleNotificationProvider();
    const result = await provider.send({ recipient: "test@example.com", subject: "Hi", body: "Body" });
    expect(result).toEqual({ providerMessageId: null });
  });
});
