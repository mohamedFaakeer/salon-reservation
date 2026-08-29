import { resolveEmailTransport } from "./resolve-email-transport";
import { BrevoApiEmailTransport } from "./brevo-api-email-transport";
import { SmtpEmailTransport } from "./smtp-email-transport";

describe("resolveEmailTransport", () => {
  const original = {
    BREVO_API_KEY: process.env.BREVO_API_KEY,
    SMTP_HOST: process.env.SMTP_HOST,
  };

  afterEach(() => {
    for (const key of ["BREVO_API_KEY", "SMTP_HOST"] as const) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  });

  it("prefers the Brevo API transport when BREVO_API_KEY is set, even alongside SMTP_HOST", () => {
    process.env.BREVO_API_KEY = "key";
    process.env.SMTP_HOST = "smtp-relay.brevo.com";
    expect(resolveEmailTransport()).toBeInstanceOf(BrevoApiEmailTransport);
  });

  it("falls back to SMTP when only SMTP_HOST is set", () => {
    delete process.env.BREVO_API_KEY;
    process.env.SMTP_HOST = "smtp.example.com";
    expect(resolveEmailTransport()).toBeInstanceOf(SmtpEmailTransport);
  });

  it("returns null when neither is configured", () => {
    delete process.env.BREVO_API_KEY;
    delete process.env.SMTP_HOST;
    expect(resolveEmailTransport()).toBeNull();
  });
});
