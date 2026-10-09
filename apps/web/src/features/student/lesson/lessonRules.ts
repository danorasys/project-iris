import type { ContentBlock, PartProgress } from "@iris/shared-types";

// The small rules of a kid's lesson, apart from the screens so they can be
// tested on their own (HU-60 to HU-64).

/** The blocks of each page, in order. Page numbers can have gaps. */
export function pagesOf(blocks: ContentBlock[]): ContentBlock[][] {
  const byPage = new Map<number, ContentBlock[]>();
  for (const block of blocks) byPage.set(block.page_index, [...(byPage.get(block.page_index) ?? []), block]);
  return [...byPage.keys()]
    .sort((a, b) => a - b)
    .map((index) => (byPage.get(index) ?? []).sort((a, b) => a.order_index - b.order_index));
}

/** How much of the reading is done, from 0 to 100: the furthest page out of
 * all of them. It's what opens the activity (HU-61). */
export function readPercent(pagesSeen: number, totalPages: number): number {
  if (totalPages === 0) return 0;
  return Math.round((100 * Math.min(pagesSeen, totalPages)) / totalPages);
}

/** The page to open (from 0): the one where they left, if it still exists. */
export function resumePage(lastPage: number, totalPages: number): number {
  return Math.min(Math.max(lastPage - 1, 0), Math.max(totalPages - 1, 0));
}

/** What the list of lessons says under each one (HU-60). */
export function lessonNote(main: PartProgress): string {
  if (main.attempts.length > 0) return "Actividad hecha";
  const percent = readPercent(main.pages_seen, main.total_pages);
  if (percent === 100) return "Ya leíste todo";
  if (percent > 0) return `Llevas ${percent} %`;
  return "Sin empezar";
}

/** A new order for the questions of each try (HU-63). `random` is only
 * there for the tests. */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** What IRIS says when the activity ends: always something that cheers them
 * on, whether they passed, passed without all of them, or got them all. */
export function resultMessage(correct: number, total: number, passed: boolean): string {
  if (correct === total) return `¡Increíble! Acertaste todas: ${correct} de ${total}. ¡Lo hiciste perfecto!`;
  if (passed)
    return `¡Muy bien, aprobaste! Acertaste ${correct} de ${total}. Si quieres, inténtalo otra vez para acertar todas.`;
  return `¡Buen intento! Acertaste ${correct} de ${total}. Repasa un poco y vuelve a intentarlo, ¡tú puedes!`;
}
