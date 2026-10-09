import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ClassStatistics, KidInLesson, LessonStatistics } from "@iris/shared-types";
import { StatisticsPanel } from "./StatisticsPanel";
import { classTotals, passRate, performance, scoreText } from "./statisticsView";

let data: ClassStatistics | undefined;

vi.mock("@/shared/api/hooks/useClassroomsApi", () => ({
  useClassStatistics: () => ({ data, isLoading: false, isError: false, error: null }),
}));

function kid(name: string, percent: number, tries: number, best: number | null, passed: boolean): KidInLesson {
  return {
    student_id: name,
    first_name: name,
    avatar_id: 1,
    percent,
    tries,
    best_correct: best,
    best_total: best === null ? null : 3,
    passed,
  };
}

// Already in the server's order: best first, the ones who didn't try last.
const animals: LessonStatistics = {
  lesson_id: "l1",
  title: "Animales terrestres",
  unit_title: "Unidad 1",
  has_activity: true,
  average_percent: 55,
  completed: 2,
  in_progress: 1,
  not_started: 1,
  passed: 2,
  tried_not_passed: 1,
  kids: [
    kid("Ana", 100, 1, 3, true),
    kid("Beto", 100, 2, 2, true),
    kid("Caro", 67, 1, 1, false),
    kid("Dani", 0, 0, null, false),
  ],
};

const statistics: ClassStatistics = {
  kids: 4,
  lessons: [animals],
  completed_percent: 50,
  average_percent: 55,
  by_kid: [
    { student_id: "Ana", first_name: "Ana", avatar_id: 1, average_percent: 100, completed_lessons: 1 },
    { student_id: "Dani", first_name: "Dani", avatar_id: 1, average_percent: 0, completed_lessons: 0 },
  ],
};

afterEach(() => {
  cleanup();
  data = undefined;
});

describe("the view of the statistics", () => {
  it("splits the best and the lowest, never the same kid twice", () => {
    const { best, lowest, notTried } = performance(animals, 2);

    expect(best.map((k) => k.first_name)).toEqual(["Ana", "Beto"]);
    expect(lowest.map((k) => k.first_name)).toEqual(["Caro"]);
    expect(notTried.map((k) => k.first_name)).toEqual(["Dani"]);
    expect(performance({ ...animals, kids: [animals.kids[0]] }).lowest).toEqual([]);
  });

  it("counts the pass rate, the score and the totals of the class", () => {
    expect(passRate(animals)).toBe(50);
    expect(scoreText(animals.kids[1])).toBe("2 de 3");
    expect(scoreText(animals.kids[3])).toBe("—");
    expect(classTotals(statistics)).toEqual({ completed: 2, inProgress: 1, notStarted: 1 });
  });
});

describe("Estadísticas of a class (HU-87) and of a lesson (HU-86)", () => {
  it("shows the class with its charts, and a lesson with its pie and rankings", async () => {
    data = statistics;
    render(<StatisticsPanel classroomId="c1" />);

    expect(screen.getByText("de las lecciones completadas")).toBeTruthy();
    const donut = screen.getByRole("figure", { name: "Lecciones de tus estudiantes" });
    expect(within(donut).getByText(/Completadas/).textContent).toBe("Completadas: 2");
    expect(screen.getByRole("progressbar", { name: "Ana" }).getAttribute("aria-valuenow")).toBe("100");

    await userEvent.click(screen.getByRole("button", { name: /Animales terrestres/ }));

    expect(screen.getByText("aprobaron la actividad")).toBeTruthy();
    const best = screen.getByRole("region", { name: "Mejor rendimiento" });
    expect(within(best).getByText("Ana")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Rendimiento más bajo" })).getByText("Caro")).toBeTruthy();
    expect(screen.getByText("Todavía sin intentarla:").parentElement?.textContent).toContain("Dani");
    await userEvent.click(screen.getByRole("button", { name: /Regresar a las estadísticas de la clase/ }));
    expect(screen.getByText("Por lección")).toBeTruthy();
  });

  it("without kids or lessons says when it will have numbers", () => {
    data = { ...statistics, kids: 0, lessons: [], by_kid: [] };
    render(<StatisticsPanel classroomId="c1" />);

    expect(screen.getByText("Aún no hay estadísticas")).toBeTruthy();
    expect(screen.getByText(/Cuando haya estudiantes en la clase/)).toBeTruthy();
  });
});
