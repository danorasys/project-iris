import { describe, expect, it } from "vitest";
import { checkCode, isCompleteCode, normalizeCode } from "./classCode";

describe("class code", () => {
  it("is typed with spaces or lowercase and still counts", () => {
    expect(normalizeCode("  k7#mp2$x ")).toBe("K7#MP2$X");
    expect(isCompleteCode("  k7#mp2$x ")).toBe(true);
  });

  it("needs 8 characters with letters, numbers and symbols", () => {
    expect(isCompleteCode("K7#MP2$")).toBe(false); // 7
    expect(isCompleteCode("1234567")).toBe(false); // the old codes, only digits
    expect(isCompleteCode("ABCD2345")).toBe(false); // no symbol
    expect(isCompleteCode("AB#CD%EF")).toBe(false); // no number
    expect(isCompleteCode("23#45%67")).toBe(false); // no letter
  });

  it("says what's missing, one by one", () => {
    expect(checkCode("ab3")).toEqual({ length: false, letter: true, digit: true, symbol: false, allowed: true });
  });

  it("refuses symbols IRIS never uses", () => {
    expect(checkCode("AB3#CD4!").allowed).toBe(false);
    expect(isCompleteCode("AB3#CD4!")).toBe(false);
  });
});
