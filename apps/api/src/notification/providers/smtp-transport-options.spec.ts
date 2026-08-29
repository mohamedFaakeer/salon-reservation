import { smtpTransportOptions } from "./smtp-transport-options";

describe("smtpTransportOptions", () => {
  const original = {
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
  };

  afterEach(() => {
    for (const key of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"] as const) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  });

  it("returns null when SMTP_HOST is unset", () => {
    delete process.env.SMTP_HOST;
    expect(smtpTransportOptions()).toBeNull();
  });

  it("sets a bounded connection/greeting/socket timeout so a hung provider can't block forever", () => {
    process.env.SMTP_HOST = "smtp-relay.brevo.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "login@example.com";
    process.env.SMTP_PASS = "key";

    const options = smtpTransportOptions();

    expect(options).not.toBeNull();
    expect(options?.host).toBe("smtp-relay.brevo.com");
    expect(options?.port).toBe(587);
    expect(options?.auth).toEqual({ user: "login@example.com", pass: "key" });
    expect(options?.connectionTimeout).toBeGreaterThan(0);
    expect(options?.greetingTimeout).toBeGreaterThan(0);
    expect(options?.socketTimeout).toBeGreaterThan(0);
  });
});
