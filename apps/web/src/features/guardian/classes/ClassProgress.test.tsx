import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { LessonProgress, PartProgress } from "@iris/shared-types";
import { ApiError } from "@/shared/api/httpClient";
import { ClassProgress } from "./ClassProgress";

function part(extra: Partial<PartProgress> = {}): PartProgress {
  return {
    extra_id: null,
    title: "Animales terrestres",
    kind: "leccion",
    total_pages: 2,
    pages_seen: 1,
    has_activity: true,
    attempts: [],
    percent: 33,
    ...extra,
  };
}

function lesson(
  title: string,
  unit: string,
  main: Partial<PartProgress> = {},
  extras: PartProgress[] = [],
): LessonProgress {
  return { lesson_id: title, title, unit_title: unit, main: part({ title, ...main }), extras };
}

let data: LessonProgress[] | undefined;
let error: unknown = null;

vi.mock("@/shared/api/hooks/useClassroomsApi", () => ({
  useFamilyProgress: () => ({ data, isLoading: false, isError: Boolean(error), error }),
}));

function renderProgress() {
  return render(
    <MemoryRouter>
      <ClassProgress enrollmentId="e1" firstName="Sofía" />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  data = undefined;
  error = null;
});

describe("ClassProgress", () => {
  it("groups the lessons by unit, with a bar and its percentage", () => {
    data = [
      lesson("Animales terrestres", "Los animales", { percent: 100, pages_seen: 2 }),
      lesson("Animales del mar", "Los animales", { percent: 33 }),
      lesson("Las flores", "Las plantas", { percent: 0, pages_seen: 0 }),
    ];
    renderProgress();

    expect(screen.getByText("1 de 3")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Los animales" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Las plantas" })).toBeTruthy();
    const bars = screen.getAllByRole("progressbar");
    expect(bars.map((bar) => bar.getAttribute("aria-valuenow"))).toEqual(["100", "33", "0"]);
    expect(screen.getByText("Leyó 1 de 2 páginas · Aún no intenta la actividad")).toBeTruthy();
  });

  it("shows every try with its score, the oldest first (HU-47)", () => {
    data = [
      lesson("Animales terrestres", "Los animales", {
        percent: 100,
        attempts: [
          { correct: 1, total: 4, passed: false, created_at: "2026-10-08T10:00:00Z" },
          { correct: 4, total: 4, passed: true, created_at: "2026-10-08T11:00:00Z" },
        ],
      }),
    ];
    renderProgress();

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell")[2].textContent)).toEqual([
      "1 de 4 (25%)",
      "4 de 4 (100%)",
    ]);
    expect(rows.map((row) => within(row).getAllByRole("cell")[3].textContent)).toEqual(["Para repasar", "Aprobó"]);
  });

  it("shows the extras of a lesson with the same bar", () => {
    data = [
      lesson("Animales terrestres", "Los animales", {}, [
        part({ extra_id: "x1", title: "Reto de animales", kind: "actividad", total_pages: 0, percent: 0 }),
      ]),
    ];
    renderProgress();

    const extras = screen.getByRole("list", { name: "Contenido extra de Animales terrestres" });
    expect(within(extras).getByText("Actividad extra")).toBeTruthy();
    expect(within(extras).getByRole("progressbar", { name: "Progreso de Reto de animales" })).toBeTruthy();
  });

  it("says so when the class has no lessons yet", () => {
    data = [];
    renderProgress();

    expect(screen.getByText(/todavía no tiene lecciones publicadas/)).toBeTruthy();
  });

  it("tells when the progress can't be loaded", () => {
    error = new ApiError(
      503,
      "progreso_no_disponible",
      "No pudimos cargar el progreso en este momento. Intenta de nuevo.",
    );
    renderProgress();

    expect(screen.getByRole("alert").textContent).toBe(
      "No pudimos cargar el progreso en este momento. Intenta de nuevo.",
    );
  });
});
