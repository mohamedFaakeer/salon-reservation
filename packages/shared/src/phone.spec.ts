import { describe, expect, it } from "vitest";
import { normalizeSriLankanPhone } from "./phone";

describe("normalizeSriLankanPhone", () => {
  it("normalizes a local 0-prefixed number", () => {
    expect(normalizeSriLankanPhone("0771234567")).toBe("94771234567");
  });

  it("normalizes an international number with a plus sign", () => {
    expect(normalizeSriLankanPhone("+94771234567")).toBe("94771234567");
  });

  it("normalizes an international number without a plus sign", () => {
    expect(normalizeSriLankanPhone("94771234567")).toBe("94771234567");
  });

  it("normalizes a bare 9-digit subscriber number", () => {
    expect(normalizeSriLankanPhone("771234567")).toBe("94771234567");
  });

  it("strips spaces, dashes, and parentheses before normalizing", () => {
    expect(normalizeSriLankanPhone("+94 77-123 4567")).toBe("94771234567");
    expect(normalizeSriLankanPhone("(077) 123-4567")).toBe("94771234567");
  });

  it("returns null for a number that's too short", () => {
    expect(normalizeSriLankanPhone("12345")).toBeNull();
  });

  it("returns null for a subscriber number starting with 0", () => {
    expect(normalizeSriLankanPhone("94071234567")).toBeNull();
  });

  it("returns null for garbage input", () => {
    expect(normalizeSriLankanPhone("not-a-phone")).toBeNull();
  });
});
