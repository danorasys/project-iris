import type { ClassroomArea } from "@iris/shared-types";

/** The areas a classroom can be about: the nine mandatory areas of basic
 * education (Ley 115 de 1994, art. 23) plus "Otra". Same list and order as
 * the server (classrooms.area). `short` is for the cards, where space is tight. */
export const CLASSROOM_AREAS: { value: ClassroomArea; label: string; short: string }[] = [
  { value: "natural_sciences", label: "Ciencias naturales y educación ambiental", short: "Ciencias naturales" },
  { value: "social_sciences", label: "Ciencias sociales, historia y geografía", short: "Ciencias sociales" },
  { value: "arts", label: "Educación artística", short: "Artística" },
  { value: "ethics", label: "Ética y valores humanos", short: "Ética y valores" },
  { value: "physical_education", label: "Educación física, recreación y deportes", short: "Educación física" },
  { value: "religion", label: "Educación religiosa", short: "Religión" },
  { value: "humanities", label: "Humanidades: lengua castellana e idiomas", short: "Lenguaje e idiomas" },
  { value: "mathematics", label: "Matemáticas", short: "Matemáticas" },
  { value: "technology", label: "Tecnología e informática", short: "Tecnología" },
  { value: "other", label: "Otra", short: "Otra área" },
];

/** First to fifth grade, the primary school kids IRIS is made for. A class
 * is for one grade, like the DBA, which go grade by grade. */
export const CLASSROOM_GRADES: { value: number; label: string }[] = [
  { value: 1, label: "1.°" },
  { value: 2, label: "2.°" },
  { value: 3, label: "3.°" },
  { value: 4, label: "4.°" },
  { value: 5, label: "5.°" },
];

/** How long the area written with "Otra" can be. Same as the server. */
export const AREA_OTHER_MAX = 60;

/** The short line under a classroom's name, like "Matemáticas · 2.°", or
 * "Música · 2.°" when the teacher wrote the area with "Otra". Empty for an
 * older class that doesn't have them yet. */
export function classroomAudience(
  area: ClassroomArea | null | undefined,
  grade: number | null | undefined,
  areaOther?: string | null,
): string {
  const areaLabel =
    area === "other" && areaOther ? areaOther : CLASSROOM_AREAS.find((option) => option.value === area)?.short;
  const gradeLabel = CLASSROOM_GRADES.find((option) => option.value === grade)?.label;
  return [areaLabel, gradeLabel].filter(Boolean).join(" · ");
}
