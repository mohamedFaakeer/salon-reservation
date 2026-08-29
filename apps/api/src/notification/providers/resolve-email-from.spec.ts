import { resolveEmailFrom, resolveEmailFromParts } from "./resolve-email-from";

describe("resolveEmailFrom", () => {
  const original = { EMAIL_FROM: process.env.EMAIL_FROM, SMTP_USER: process.env.SMTP_USER };

  afterEach(() => {
    for (const key of ["EMAIL_FROM", "SMTP_USER"] as const) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  });

  it("prefers EMAIL_FROM when set, even alongside SMTP_USER", () => {
    process.env.EMAIL_FROM = '"Elegance Salon" <bookings@example.com>';
    process.env.SMTP_USER = "brevo-login@example.com";
    expect(resolveEmailFrom()).toBe('"Elegance Salon" <bookings@example.com>');
  });

  it("falls back to SMTP_USER when EMAIL_FROM is unset", () => {
    delete process.env.EMAIL_FROM;
    process.env.SMTP_USER = "brevo-login@example.com";
    expect(resolveEmailFrom()).toBe("brevo-login@example.com");
  });

  it("falls back to the default address when neither is set", () => {
    delete process.env.EMAIL_FROM;
    delete process.env.SMTP_USER;
    expect(resolveEmailFrom()).toBe("no-reply@salon.local");
  });
});

describe("resolveEmailFromParts", () => {
  const original = process.env.EMAIL_FROM;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.EMAIL_FROM;
    } else {
      process.env.EMAIL_FROM = original;
    }
  });

  it("splits a quoted display name from the address", () => {
    process.env.EMAIL_FROM = '"Elegance Salon" <bookings@example.com>';
    expect(resolveEmailFromParts()).toEqual({ name: "Elegance Salon", email: "bookings@example.com" });
  });

  it("splits an unquoted display name from the address", () => {
    process.env.EMAIL_FROM = "Elegance Salon <bookings@example.com>";
    expect(resolveEmailFromParts()).toEqual({ name: "Elegance Salon", email: "bookings@example.com" });
  });

  it("returns just the address when there's no display name", () => {
    process.env.EMAIL_FROM = "bookings@example.com";
    expect(resolveEmailFromParts()).toEqual({ email: "bookings@example.com" });
  });
});
