import { describe, expect, it } from "vitest";
import { classroomAudience, DBA_DOCUMENTS, dbaLabel, hasDba } from "./classroomDetails";

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

describe("the DBA of a lesson", () => {
  it("only the areas with DBA ask for it", () => {
    expect(["mathematics", "humanities", "natural_sciences", "social_sciences"].every((a) => hasDba(a as never))).toBe(
      true,
    );
    expect(hasDba("arts")).toBe(false);
    expect(hasDba("other")).toBe(false);
    expect(hasDba(null)).toBe(false);
  });

  it("names it with the subject of its DBA and the grade", () => {
    expect(dbaLabel({ subject: "natural_sciences", grade: 1, number: 3 })).toBe("DBA 3 · Ciencias naturales · 1.°");
    // Humanities has the DBA of Lenguaje and of Inglés.
    expect(dbaLabel({ subject: "language", grade: 4, number: 2 })).toBe("DBA 2 · Lenguaje · 4.°");
    expect(dbaLabel({ subject: "english", grade: 4, number: 2 })).toBe("DBA 2 · Inglés · 4.°");
  });

  it("links to the MEN's page of each set of DBA, never a copy", () => {
    expect(DBA_DOCUMENTS.natural_sciences.url).toBe(
      "https://colombiaaprende.edu.co/recurso-coleccion/derechos-basicos-de-aprendizaje-dba-ciencias-naturales",
    );
    expect(
      Object.values(DBA_DOCUMENTS).every((document) => document.url.startsWith("https://colombiaaprende.edu.co/")),
    ).toBe(true);
  });
});
