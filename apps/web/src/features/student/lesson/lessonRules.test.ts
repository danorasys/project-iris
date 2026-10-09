import { describe, expect, it } from "vitest";
import type { PartProgress } from "@iris/shared-types";
import { lessonNote, pagesOf, readPercent, resultMessage, resumePage, shuffled } from "./lessonRules";

function part(pages_seen: number, total_pages: number, tries = 0): PartProgress {
  const attempt = { correct: 1, total: 2, passed: true, created_at: "2026-10-08T10:00:00Z" };
  return {
    extra_id: null,
    title: "Animales",
    kind: "leccion",
    total_pages,
    pages_seen,
    has_activity: true,
    attempts: Array.from({ length: tries }, () => attempt),
    percent: 0,
  };
}

describe("the rules of a kid's lesson", () => {
  it("puts the blocks in their pages, even with gaps in the numbers", () => {
    const block = (id: string, page_index: number, order_index: number) => ({
      id,
      type: "texto" as const,
      text: id,
      page_index,
      order_index,
    });

    const pages = pagesOf([block("c", 3, 0), block("b", 0, 1), block("a", 0, 0)]);

    expect(pages.map((p) => p.map((b) => b.id))).toEqual([["a", "b"], ["c"]]);
  });

  it("counts the reading by the furthest page, never past the end", () => {
    expect(readPercent(0, 4)).toBe(0);
    expect(readPercent(3, 4)).toBe(75);
    expect(readPercent(9, 4)).toBe(100);
    expect(readPercent(0, 0)).toBe(0);
  });

  it("opens where the kid left, or the first page", () => {
    expect(resumePage(0, 5)).toBe(0);
    expect(resumePage(3, 5)).toBe(2);
    // The teacher took pages out since then.
    expect(resumePage(7, 2)).toBe(1);
  });

  it("says how each lesson is going (HU-60)", () => {
    expect(lessonNote(part(0, 4))).toBe("Sin empezar");
    expect(lessonNote(part(1, 4))).toBe("Llevas 25 %");
    expect(lessonNote(part(4, 4))).toBe("Ya leíste todo");
    expect(lessonNote(part(4, 4, 1))).toBe("Actividad hecha");
  });

  it("mixes the questions without losing any", () => {
    const always = (value: number) => () => value;

    expect(shuffled([1, 2, 3], always(0))).toEqual([2, 3, 1]);
    expect(shuffled([1, 2, 3], always(0.99))).toEqual([1, 2, 3]);
    expect(shuffled([1, 2, 3]).sort()).toEqual([1, 2, 3]);
  });

  it("cheers on with each result (HU-63)", () => {
    expect(resultMessage(1, 3, false)).toMatch(/Buen intento.*vuelve a intentarlo/);
    expect(resultMessage(2, 3, true)).toMatch(/aprobaste.*inténtalo otra vez/);
    expect(resultMessage(3, 3, true)).toMatch(/Acertaste todas/);
  });
});
