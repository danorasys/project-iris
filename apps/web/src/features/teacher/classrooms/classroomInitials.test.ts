import { describe, expect, it } from "vitest";
import { classroomInitials } from "./classroomInitials";

describe("classroomInitials", () => {
  it("takes the first letter of the first two words", () => {
    expect(classroomInitials("Matemáticas Básicas")).toBe("MB");
    expect(classroomInitials("matemáticas 3A")).toBe("M3");
  });

  it("skips small connector words when there are others", () => {
    expect(classroomInitials("Ciencias de la Naturaleza")).toBe("CN");
    expect(classroomInitials("De la casa")).toBe("CA");
  });

  it("uses the first two letters of a single word", () => {
    expect(classroomInitials("Inglés")).toBe("IN");
    expect(classroomInitials("  ética  ")).toBe("ÉT");
  });

  it("ignores symbols and never comes back empty", () => {
    expect(classroomInitials("¡Arte & Música!")).toBe("AM");
    expect(classroomInitials("¿?")).toBe("?");
  });
});
