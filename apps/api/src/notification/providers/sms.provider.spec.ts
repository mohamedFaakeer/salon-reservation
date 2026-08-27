import { SmsNotificationProvider } from "./sms.provider";

describe("SmsNotificationProvider", () => {
  const originalToken = process.env.TEXTLK_API_TOKEN;
  const originalSenderId = process.env.TEXTLK_SENDER_ID;

  afterEach(() => {
    if (originalToken === undefined) delete process.env.TEXTLK_API_TOKEN;
    else process.env.TEXTLK_API_TOKEN = originalToken;
    if (originalSenderId === undefined) delete process.env.TEXTLK_SENDER_ID;
    else process.env.TEXTLK_SENDER_ID = originalSenderId;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("falls back to console logging when Text.lk credentials are not configured", async () => {
    delete process.env.TEXTLK_API_TOKEN;
    delete process.env.TEXTLK_SENDER_ID;
    const provider = new SmsNotificationProvider();

    const result = await provider.send({ recipient: "0771234567", subject: "S", body: "Body" });

    expect(result).toEqual({ providerMessageId: null });
  });

  it("rejects a recipient that isn't a valid Sri Lankan mobile number", async () => {
    process.env.TEXTLK_API_TOKEN = "token";
    process.env.TEXTLK_SENDER_ID = "SalonApp";
    const provider = new SmsNotificationProvider();

    await expect(provider.send({ recipient: "12345", subject: "S", body: "Body" })).rejects.toMatchObject({
      statusCode: 422,
      code: "INVALID_PHONE_NUMBER",
    });
  });

  it("normalizes the recipient and sends via Text.lk when credentials are configured", async () => {
    process.env.TEXTLK_API_TOKEN = "token";
    process.env.TEXTLK_SENDER_ID = "SalonApp";
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: "success",
        message: "Your message was successfully delivered",
        data: { uid: "uid-123", to: "94771234567", from: "SalonApp", message: "Body", status: "Delivered", cost: "1", sms_count: 1 },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new SmsNotificationProvider();
    const result = await provider.send({ recipient: "0771234567", subject: "S", body: "Body" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.text.lk/api/v3/sms/send",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
        body: JSON.stringify({ recipient: "94771234567", sender_id: "SalonApp", type: "plain", message: "Body" }),
      }),
    );
    expect(result).toEqual({ providerMessageId: "uid-123" });
  });

  it("throws a retryable error when Text.lk rejects the send", async () => {
    process.env.TEXTLK_API_TOKEN = "token";
    process.env.TEXTLK_SENDER_ID = "SalonApp";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ status: "error", message: "Invalid recipient number" }),
      })),
    );

    const provider = new SmsNotificationProvider();
    await expect(provider.send({ recipient: "0771234567", subject: "S", body: "Body" })).rejects.toMatchObject({
      statusCode: 502,
      code: "SMS_GATEWAY_ERROR",
    });
  });

  it("throws a retryable error when the gateway is unreachable", async () => {
    process.env.TEXTLK_API_TOKEN = "token";
    process.env.TEXTLK_SENDER_ID = "SalonApp";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const provider = new SmsNotificationProvider();
    await expect(provider.send({ recipient: "0771234567", subject: "S", body: "Body" })).rejects.toMatchObject({
      statusCode: 502,
      code: "SMS_GATEWAY_UNREACHABLE",
    });
  });
});
