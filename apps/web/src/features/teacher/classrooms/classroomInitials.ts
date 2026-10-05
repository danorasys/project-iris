import type { ClassroomColor } from "@iris/shared-types";

/** The five colors of a classroom's avatar, in the order the form shows
 * them. Same list as the server (classrooms.color). */
export const CLASSROOM_COLORS: { value: ClassroomColor; label: string }[] = [
  { value: "blue", label: "Azul" },
  { value: "navy", label: "Azul oscuro" },
  { value: "orange", label: "Naranja" },
  { value: "green", label: "Verde" },
  { value: "gold", label: "Amarillo" },
];

// Small words that don't name the subject, skipped when there are others.
const CONNECTORS = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "en", "a", "para", "con", "por"]);

/** The letters on a classroom's avatar, at most two: the first letter of
 * its first two words ("Matemáticas Básicas" → "MB"), or the first two
 * letters of a single word ("Inglés" → "IN"). Connectors like "de" or "la"
 * are skipped ("Ciencias de la Naturaleza" → "CN"). */
export function classroomInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  const meaningful = words.filter((word) => !CONNECTORS.has(word.toLocaleLowerCase("es")));
  const picked = meaningful.length > 0 ? meaningful : words;
  if (picked.length === 0) return "?";
  const letters = picked.length === 1 ? picked[0].slice(0, 2) : picked[0][0] + picked[1][0];
  return letters.toLocaleUpperCase("es");
}
