import { describe, expect, it } from "vitest";
import { GAP, pageNumbers } from "./pageNumbers";

describe("pageNumbers", () => {
  it("shows every page when they're few", () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
    expect(pageNumbers(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("leaves gaps around the current one when there are many", () => {
    expect(pageNumbers(5, 9)).toEqual([1, GAP, 4, 5, 6, GAP, 9]);
  });

  it("keeps the row long near the ends", () => {
    expect(pageNumbers(1, 9)).toEqual([1, 2, 3, 4, GAP, 9]);
    expect(pageNumbers(9, 9)).toEqual([1, GAP, 6, 7, 8, 9]);
  });
});
