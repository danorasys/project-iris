import { describe, expect, it } from "vitest";
import { formatNumber } from "./formatNumber";

describe("formatNumber", () => {
  it("puts dots between thousands, also in a 4-digit number", () => {
    expect(formatNumber(2500, 0)).toBe("2.500");
    expect(formatNumber(3134037, 0)).toBe("3.134.037");
    expect(formatNumber(999, 0)).toBe("999");
  });

  it("uses a comma for decimals and rounds to the ones asked for", () => {
    expect(formatNumber(19.1, 1)).toBe("19,1");
    expect(formatNumber(1234.56, 1)).toBe("1.234,6");
  });

  it("works for the in-between values of the count up", () => {
    expect(formatNumber(0, 0)).toBe("0");
    expect(formatNumber(2499.6, 0)).toBe("2.500");
  });
});
