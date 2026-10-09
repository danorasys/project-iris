/** How many lessons a class has ready, in words: "Aún sin lecciones",
 * "1 lección", "4 lecciones". */
export function lessonsLabel(count: number): string {
  if (count === 0) return "Aún sin lecciones";
  return count === 1 ? "1 lección" : `${count} lecciones`;
}

/** What a class has ready, units and lessons in one line: "2 unidades · 6
 * lecciones", or "Aún sin unidades ni lecciones". Without the units count
 * (content-service didn't send it), just the lessons. */
export function contentLabel(units: number | null, lessons: number): string {
  if (units === null) return lessonsLabel(lessons);
  // A unit only counts once it has a published lesson, so no lessons means no units.
  if (lessons === 0 || units === 0) return "Aún sin unidades ni lecciones";
  return `${units === 1 ? "1 unidad" : `${units} unidades`} · ${lessonsLabel(lessons)}`;
}
