import { describe, expect, it } from "vitest";
import { calculateProgress, isInsideRect, isProgressComplete } from "./dwellMath";

describe("isInsideRect", () => {
  const rect = { left: 10, top: 10, right: 110, bottom: 60 };

  it("detects a point inside the rect", () => {
    expect(isInsideRect(50, 30, rect)).toBe(true);
  });

  it("detects a point outside the rect", () => {
    expect(isInsideRect(200, 30, rect)).toBe(false);
  });

  it("treats the edges as inside", () => {
    expect(isInsideRect(10, 10, rect)).toBe(true);
    expect(isInsideRect(110, 60, rect)).toBe(true);
  });
});

describe("calculateProgress", () => {
  it("returns 0 at the start", () => {
    expect(calculateProgress(0, 900)).toBe(0);
  });

  it("returns 0.5 halfway through", () => {
    expect(calculateProgress(450, 900)).toBeCloseTo(0.5);
  });

  it("never goes above 1", () => {
    expect(calculateProgress(5000, 900)).toBe(1);
  });

  it("is never negative", () => {
    expect(calculateProgress(-100, 900)).toBe(0);
  });
});

describe("isProgressComplete", () => {
  it("is false before the duration is met", () => {
    expect(isProgressComplete(800, 900)).toBe(false);
  });

  it("is true once the duration is met", () => {
    expect(isProgressComplete(900, 900)).toBe(true);
  });
});
