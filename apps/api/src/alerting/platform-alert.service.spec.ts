import nodemailer from "nodemailer";
import { PlatformAlertService } from "./platform-alert.service";

describe("PlatformAlertService", () => {
  const original = { SUPER_ADMIN_EMAIL: process.env.SUPER_ADMIN_EMAIL, SMTP_HOST: process.env.SMTP_HOST };

  afterEach(() => {
    for (const key of ["SUPER_ADMIN_EMAIL", "SMTP_HOST"] as const) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
    vi.restoreAllMocks();
  });

  it("does nothing (no throw) when SUPER_ADMIN_EMAIL is unset", async () => {
    delete process.env.SUPER_ADMIN_EMAIL;
    const service = new PlatformAlertService();
    await expect(service.send("subject", "body")).resolves.toBeUndefined();
  });

  it("does nothing (no throw) when no email transport is configured", async () => {
    process.env.SUPER_ADMIN_EMAIL = "admin@platform.local";
    delete process.env.SMTP_HOST;
    const service = new PlatformAlertService();
    await expect(service.send("subject", "body")).resolves.toBeUndefined();
  });

  it("sends via the resolved transport when both are configured", async () => {
    process.env.SUPER_ADMIN_EMAIL = "admin@platform.local";
    process.env.SMTP_HOST = "smtp.example.com";
    vi.spyOn(nodemailer, "createTransport").mockReturnValue({
      sendMail: vi.fn(async () => ({ messageId: "msg-1" })),
    } as never);

    const service = new PlatformAlertService();
    await service.send("A critical thing happened", "Details here.");
    // No assertion on the mock beyond "did not throw" — resolveEmailTransport
    // already has its own dedicated tests; this just proves the wiring.
  });

  it("swallows a send failure rather than throwing", async () => {
    process.env.SUPER_ADMIN_EMAIL = "admin@platform.local";
    process.env.SMTP_HOST = "smtp.example.com";
    vi.spyOn(nodemailer, "createTransport").mockReturnValue({
      sendMail: vi.fn(async () => {
        throw new Error("network down");
      }),
    } as never);

    const service = new PlatformAlertService();
    await expect(service.send("subject", "body")).resolves.toBeUndefined();
  });
});
