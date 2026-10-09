import { describe, expect, it } from "vitest";
import { contentLabel, lessonsLabel } from "./lessonsLabel";

describe("what a class has ready, in words", () => {
  it("counts the lessons", () => {
    expect(lessonsLabel(0)).toBe("Aún sin lecciones");
    expect(lessonsLabel(1)).toBe("1 lección");
    expect(lessonsLabel(4)).toBe("4 lecciones");
  });

  it("puts the units first when there are lessons", () => {
    expect(contentLabel(1, 1)).toBe("1 unidad · 1 lección");
    expect(contentLabel(2, 6)).toBe("2 unidades · 6 lecciones");
  });

  it("says there are no units nor lessons yet", () => {
    expect(contentLabel(0, 0)).toBe("Aún sin unidades ni lecciones");
  });

  it("says only the lessons without the units count", () => {
    expect(contentLabel(null, 3)).toBe("3 lecciones");
    expect(contentLabel(null, 0)).toBe("Aún sin lecciones");
  });
});
