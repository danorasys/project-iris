import { describe, expect, it } from "vitest";
import { includesOtherCondition, supportConditionNames, toggleSupportCondition } from "./supportCondition";

const catalog = [
  { id: 1, name: "Parálisis cerebral" },
  { id: 3, name: "Mielomeningocele" },
  { id: 14, name: "Otra condición (especificar)" },
  { id: 15, name: "Prefiero no especificar" },
];

describe("toggleSupportCondition", () => {
  it("adds one more condition and keeps them sorted", () => {
    expect(toggleSupportCondition([3], 1, catalog)).toEqual([1, 3]);
  });

  it("removes a condition that was already chosen", () => {
    expect(toggleSupportCondition([1, 3], 1, catalog)).toEqual([3]);
  });

  it("leaves 'Prefiero no especificar' alone when it is chosen", () => {
    expect(toggleSupportCondition([1, 3, 14], 15, catalog)).toEqual([15]);
  });

  it("drops 'Prefiero no especificar' when another condition is chosen", () => {
    expect(toggleSupportCondition([15], 3, catalog)).toEqual([3]);
  });

  it("doesn't change the list it was given", () => {
    const selected = [3];
    toggleSupportCondition(selected, 1, catalog);
    expect(selected).toEqual([3]);
  });
});

describe("includesOtherCondition", () => {
  it("is true only when 'Otra condición' is among the chosen ones", () => {
    expect(includesOtherCondition([1, 14], catalog)).toBe(true);
    expect(includesOtherCondition([1, 3], catalog)).toBe(false);
    expect(includesOtherCondition([14], [])).toBe(false);
  });
});

describe("supportConditionNames", () => {
  it("gives the names in the order of the catalog", () => {
    expect(supportConditionNames([3, 1], catalog)).toEqual(["Parálisis cerebral", "Mielomeningocele"]);
    expect(supportConditionNames([], catalog)).toEqual([]);
  });
});
