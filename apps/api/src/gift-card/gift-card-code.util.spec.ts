import { describe, expect, it } from "vitest";
import { generateGiftCardCode, normalizeGiftCardCode } from "./gift-card-code.util";

describe("generateGiftCardCode", () => {
  it("formats as <3-letter prefix>-GC-<10 chars>", () => {
    const code = generateGiftCardCode("elegance");
    expect(code).toMatch(/^ELE-GC-[A-Z0-9]{10}$/);
  });

  it("pads a short slug and strips non-alphanumerics", () => {
    const code = generateGiftCardCode("a-b");
    expect(code.slice(0, 3)).toBe("ABX");
  });

  it("never has visually ambiguous characters (0/O/1/I/L) in its random suffix", () => {
    for (let i = 0; i < 50; i++) {
      const suffix = generateGiftCardCode("elegance").split("-")[2];
      expect(suffix).not.toMatch(/[0O1IL]/);
    }
  });

  it("is not deterministic across calls", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateGiftCardCode("elegance")));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe("normalizeGiftCardCode", () => {
  it("trims and uppercases", () => {
    expect(normalizeGiftCardCode("  ele-gc-abc123 ")).toBe("ELE-GC-ABC123");
  });
});
