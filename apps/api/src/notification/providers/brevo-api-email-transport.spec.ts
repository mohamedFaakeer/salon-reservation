import { BrevoApiEmailTransport } from "./brevo-api-email-transport";

describe("BrevoApiEmailTransport", () => {
  const originalFetch = global.fetch;
  const originalEmailFrom = process.env.EMAIL_FROM;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalEmailFrom === undefined) {
      delete process.env.EMAIL_FROM;
    } else {
      process.env.EMAIL_FROM = originalEmailFrom;
    }
  });

  it("posts to Brevo's API with the key header, split sender, and both content types", async () => {
    process.env.EMAIL_FROM = '"Wellness360" <bookings@example.com>';
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ messageId: "brevo-msg-1" }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const transport = new BrevoApiEmailTransport("test-api-key");
    const result = await transport.send({ to: "customer@example.com", subject: "Hi", text: "Hello there" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["api-key"]).toBe("test-api-key");

    const body = JSON.parse(init.body as string);
    expect(body.sender).toEqual({ name: "Wellness360", email: "bookings@example.com" });
    expect(body.to).toEqual([{ email: "customer@example.com" }]);
    expect(body.subject).toBe("Hi");
    expect(body.textContent).toBe("Hello there");
    expect(body.htmlContent).toContain("Hello there");

    expect(result).toEqual({ providerMessageId: "brevo-msg-1" });
  });

  it("throws with the status and body when Brevo rejects the request", async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    })) as unknown as typeof fetch;

    const transport = new BrevoApiEmailTransport("bad-key");

    await expect(transport.send({ to: "a@b.com", subject: "s", text: "t" })).rejects.toThrow(/401/);
  });
});
