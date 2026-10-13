import { useCallback, useState } from "react";

// How many class tiles fit in a page and how to search them by name, for
// the grids of ClassTiles.tsx.

// At least this many tiles per page, then up to the end of the last row, so
// a page never leaves half a row empty. The "add" tile counts as one.
const MIN_TILES_PER_PAGE = 8;

// How many columns the grid has right now. It changes with the width of
// the window, so it's measured again on every resize.
export function useGridColumns(): [(grid: HTMLUListElement | null) => (() => void) | undefined, number] {
  const [columns, setColumns] = useState(0);
  const ref = useCallback((grid: HTMLUListElement | null) => {
    if (!grid || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => setColumns(getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length);
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    measure();
    return () => observer.disconnect();
  }, []);
  return [ref, columns];
}

// Whole rows only: 6 columns give 12 tiles, 4 give 8, 3 give 9.
export function tilesPerPage(columns: number): number {
  if (columns < 1) return MIN_TILES_PER_PAGE;
  return columns * Math.max(2, Math.ceil(MIN_TILES_PER_PAGE / columns));
}

// Lowercase and without accents, so "matematicas" finds "Matemáticas".
export function searchable(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
