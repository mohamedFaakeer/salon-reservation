import {
  formatInvoiceNumber,
  invoiceNumberPrefix,
  nextSequence,
  prefixForSlug,
} from "./invoice-number";

describe("prefixForSlug", () => {
  it("takes the first four letters, upper-cased", () => {
    expect(prefixForSlug("eagle")).toBe("EAGL");
  });

  it("pads a short slug rather than leaving a stubby prefix", () => {
    // Two salons with two-letter slugs would otherwise both produce a
    // two-character prefix and read as the same series.
    expect(prefixForSlug("ab")).toBe("ABXX");
  });

  it("drops punctuation so the number stays speakable", () => {
    expect(prefixForSlug("hair-lounge")).toBe("HAIR");
  });

  it("handles a slug of digits", () => {
    expect(prefixForSlug("24seven")).toBe("24SE");
  });
});

describe("formatInvoiceNumber", () => {
  it("reads as salon, year, counter", () => {
    expect(formatInvoiceNumber("eagle", 2026, 1)).toBe("EAGL-2026-0001");
  });

  it("pads to four digits so numbers sort as text", () => {
    // Without padding, "EAGL-2026-10" would sort before "EAGL-2026-9".
    expect(formatInvoiceNumber("eagle", 2026, 42)).toBe("EAGL-2026-0042");
  });

  it("grows past four digits rather than wrapping", () => {
    expect(formatInvoiceNumber("eagle", 2026, 12345)).toBe("EAGL-2026-12345");
  });
});

describe("nextSequence", () => {
  const prefix = invoiceNumberPrefix("eagle", 2026);

  it("starts at 1 when the salon has issued none this year", () => {
    expect(nextSequence(null, prefix)).toBe(1);
    expect(nextSequence(undefined, prefix)).toBe(1);
  });

  it("continues from the highest already issued", () => {
    expect(nextSequence("EAGL-2026-0007", prefix)).toBe(8);
  });

  it("restarts in a new year rather than continuing last year's run", () => {
    // The year is in the prefix precisely so this reset cannot collide.
    expect(nextSequence("EAGL-2025-0912", prefix)).toBe(1);
  });

  it("ignores a number from another salon", () => {
    expect(nextSequence("HAIR-2026-0400", prefix)).toBe(1);
  });

  it("does not trip over a malformed tail", () => {
    expect(nextSequence("EAGL-2026-abcd", prefix)).toBe(1);
  });

  it("carries past the four-digit padding", () => {
    expect(nextSequence("EAGL-2026-9999", prefix)).toBe(10000);
  });
});
