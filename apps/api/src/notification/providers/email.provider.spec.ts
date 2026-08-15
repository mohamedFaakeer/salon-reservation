import nodemailer from "nodemailer";
import { EmailNotificationProvider } from "./email.provider";

describe("EmailNotificationProvider", () => {
  const originalHost = process.env.SMTP_HOST;

  afterEach(() => {
    if (originalHost === undefined) {
      delete process.env.SMTP_HOST;
    } else {
      process.env.SMTP_HOST = originalHost;
    }
    vi.restoreAllMocks();
  });

  it("falls back to console logging when SMTP_HOST is not configured", async () => {
    delete process.env.SMTP_HOST;
    const provider = new EmailNotificationProvider();
    const result = await provider.send({ recipient: "a@b.com", subject: "Subject", body: "Body" });
    expect(result).toEqual({ providerMessageId: null });
  });

  it("sends via nodemailer when SMTP_HOST is configured", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    const sendMail = vi.fn(async () => ({ messageId: "msg-123" }));
    vi.spyOn(nodemailer, "createTransport").mockReturnValue({
      sendMail,
    } as unknown as ReturnType<typeof nodemailer.createTransport>);

    const provider = new EmailNotificationProvider();
    const result = await provider.send({ recipient: "a@b.com", subject: "Subject", body: "Body" });

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "a@b.com", subject: "Subject" }));
    expect(result).toEqual({ providerMessageId: "msg-123" });
  });
});
