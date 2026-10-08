/** A gap in the row of page numbers, shown as "…". */
export const GAP = "gap";

/** The pages to show in the pager: all of them when they're few, and when
 * there are many the first, the last and the ones around the current one,
 * with a gap where pages are left out. For 9 pages on page 5:
 * 1 … 4 5 6 … 9. */
export function pageNumbers(current: number, total: number): (number | typeof GAP)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const around = new Set([1, total, current - 1, current, current + 1].filter((p) => p >= 1 && p <= total));
  // Near an end, show a couple more so the row keeps its length.
  if (current <= 3) [2, 3, 4].forEach((p) => around.add(p));
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach((p) => around.add(p));

  const sorted = [...around].sort((a, b) => a - b);
  const result: (number | typeof GAP)[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) result.push(GAP);
    result.push(p);
  });
  return result;
}
