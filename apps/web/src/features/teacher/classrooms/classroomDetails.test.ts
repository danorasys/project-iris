import { describe, expect, it } from "vitest";
import { classroomAudience } from "./classroomDetails";

describe("classroomAudience", () => {
  it("puts the area and the grade together, or whichever there is", () => {
    expect(classroomAudience("mathematics", 2)).toBe("Matemáticas · 2.°");
    expect(classroomAudience("natural_sciences", null)).toBe("Ciencias naturales");
    expect(classroomAudience(null, 5)).toBe("5.°");
    expect(classroomAudience(undefined, undefined)).toBe("");
  });

  it("uses the area the teacher wrote with Otra", () => {
    expect(classroomAudience("other", 3, "Música")).toBe("Música · 3.°");
    expect(classroomAudience("other", 3, null)).toBe("Otra área · 3.°");
  });

  it("ignores a grade that isn't from first to fifth", () => {
    expect(classroomAudience("arts", 0)).toBe("Artística");
  });
});
