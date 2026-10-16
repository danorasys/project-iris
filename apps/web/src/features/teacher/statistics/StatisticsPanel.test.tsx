import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ClassStatistics, KidInLesson, LessonStatistics } from "@iris/shared-types";
import { StatisticsPanel } from "./StatisticsPanel";
import { byUnit, classTotals, fullName, passRate, performance, scoreText } from "./statisticsView";

let data: ClassStatistics | undefined;

vi.mock("@/shared/api/hooks/useClassroomsApi", () => ({
  useClassStatistics: () => ({ data, isLoading: false, isError: false, error: null }),
}));
// The avatars have their own tests, here only the names matter.
vi.mock("@/shared/ui/StudentAvatarImage", () => ({ StudentAvatarImage: () => null }));

function kid(name: string, percent: number, tries: number, best: number | null, passed: boolean): KidInLesson {
  return {
    student_id: name,
    first_name: name,
    last_name: "Ruiz",
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
  unit_id: "u1",
  unit_title: "Los seres vivos",
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
    { student_id: "Ana", first_name: "Ana", last_name: "Ruiz", avatar_id: 1, average_percent: 100, completed_lessons: 1 },
    { student_id: "Dani", first_name: "Dani", last_name: "Ruiz", avatar_id: 1, average_percent: 0, completed_lessons: 0 },
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

  it("groups the lessons by unit in their order, with the progress of each unit", () => {
    const plants: LessonStatistics = { ...animals, lesson_id: "l2", title: "Plantas", average_percent: 25, completed: 0, passed: 1 };
    const rocks: LessonStatistics = { ...animals, lesson_id: "l3", unit_id: "u2", unit_title: "La Tierra", title: "Rocas" };
    const units = byUnit({ ...statistics, lessons: [animals, plants, rocks] });

    expect(units.map((u) => [u.title, u.lessons.map((l) => l.title)])).toEqual([
      ["Los seres vivos", ["Animales terrestres", "Plantas"]],
      ["La Tierra", ["Rocas"]],
    ]);
    // (55 + 25) / 2, and of 4 kids in 2 lessons, 2 completed and 3 passed.
    expect(units[0]).toMatchObject({ averagePercent: 40, completed: 2, passed: 3, pairs: 8 });
  });

  it("writes the full name without an empty or missing last name", () => {
    expect(fullName({ first_name: "Emma Lucía", last_name: "Herrera Salazar" })).toBe("Emma Lucía Herrera Salazar");
    expect(fullName({ first_name: "Emma", last_name: "" })).toBe("Emma");
    expect(fullName({ first_name: "Emma" } as { first_name: string; last_name: string })).toBe("Emma");
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
    // Each part of the legend with how many and what part of the whole.
    const done = within(donut).getByText("Completadas").closest("li") as HTMLElement;
    expect(within(done).getByText("2")).toBeTruthy();
    expect(within(done).getByText("50 %")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ver los resultados de Ana Ruiz: 100 %" })).toBeTruthy();

    const unit = screen.getByRole("region", { name: "Los seres vivos" });
    // Its counts as tags: lessons, completed and passed.
    expect(within(unit).getByText("1 lección")).toBeTruthy();
    expect(within(unit).getByText("2 de 4 completadas")).toBeTruthy();
    expect(within(unit).getByText("2 aprobaron", { selector: "span" })).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Avance de la unidad Los seres vivos" }).getAttribute("aria-valuenow")).toBe("55");

    await userEvent.click(screen.getByRole("button", { name: /Animales terrestres/ }));

    expect(screen.getByText("aprobaron la actividad")).toBeTruthy();
    const best = screen.getByRole("region", { name: "Mejor rendimiento" });
    expect(within(best).getByText("Ana Ruiz")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Rendimiento más bajo" })).getByText("Caro Ruiz")).toBeTruthy();
    const notTried = screen.getByRole("region", { name: "Todavía sin intentarla" });
    expect(within(notTried).getByText("Dani Ruiz")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Regresar a las estadísticas de la clase/ }));
    expect(screen.getByText("Por unidad")).toBeTruthy();
  });

  it("shows the first kids, every kid with a search, and one kid's results", async () => {
    const many = ["Ana", "Beto", "Caro", "Dani", "Eva", "Fede", "Gabi"].map((name, index) => ({
      student_id: name,
      first_name: name,
      last_name: "Ruiz",
      avatar_id: 1,
      average_percent: 100 - index * 10,
      completed_lessons: 1,
    }));
    data = { ...statistics, kids: 7, by_kid: many };
    render(<StatisticsPanel classroomId="c1" />);

    // The card has the first five, best first, and says how many more.
    const card = screen.getByRole("region", { name: "Avance de cada estudiante" });
    expect(within(card).getAllByRole("button", { name: /^Ver los resultados de/ })).toHaveLength(5);
    expect(within(card).getByText(/y 2 más en/)).toBeTruthy();

    await userEvent.click(within(card).getByRole("button", { name: /Ver todos/ }));
    expect(screen.getAllByRole("button", { name: /^Ver los resultados de/ })).toHaveLength(7);
    await userEvent.type(screen.getByRole("searchbox", { name: "Buscar un estudiante por su nombre" }), "gabi ruiz");
    expect(screen.getAllByRole("button", { name: /^Ver los resultados de/ })).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: /Ver los resultados de Gabi Ruiz/ }));
    expect(screen.getByRole("heading", { name: "Gabi Ruiz" })).toBeTruthy();
    expect(screen.getByText("lecciones completadas")).toBeTruthy();
    // Gabi isn't in the numbers of the lesson, so it hasn't started.
    expect(screen.getByText("Sin empezar")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Regresar a todos los estudiantes/ }));
    expect(screen.getByRole("heading", { name: "Avance de cada estudiante" })).toBeTruthy();
  });

  it("shows a lesson's kids by progress and every one of them in Ver todos", async () => {
    data = statistics;
    render(<StatisticsPanel classroomId="c1" />);

    await userEvent.click(screen.getByRole("button", { name: /Animales terrestres/ }));
    const card = screen.getByRole("region", { name: "Avance de cada estudiante" });
    const names = within(card)
      .getAllByRole("button", { name: /^Ver los resultados de/ })
      .map((row) => row.getAttribute("aria-label"));
    // The furthest first: Ana and Beto at 100 %, Caro at 67 %, Dani at 0 %.
    expect(names).toEqual([
      "Ver los resultados de Ana Ruiz: 100 %",
      "Ver los resultados de Beto Ruiz: 100 %",
      "Ver los resultados de Caro Ruiz: 67 %",
      "Ver los resultados de Dani Ruiz: 0 %",
    ]);

    await userEvent.click(within(card).getByRole("button", { name: /Ver todos/ }));
    expect(screen.getByRole("heading", { name: "Avance en “Animales terrestres”" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Regresar a la lección/ }));
    expect(screen.getByText("aprobaron la actividad")).toBeTruthy();
  });

  it("opens a kid's results from a lesson, lesson by lesson", async () => {
    data = statistics;
    render(<StatisticsPanel classroomId="c1" />);

    await userEvent.click(screen.getByRole("button", { name: /Animales terrestres/ }));
    await userEvent.click(screen.getByRole("button", { name: "Ver los resultados de Ana Ruiz: 100 %" }));

    expect(screen.getByRole("heading", { name: "Ana Ruiz" })).toBeTruthy();
    expect(screen.getByText("Completada")).toBeTruthy();
    expect(screen.getByText(/Mejor intento: 3 de 3 · aprobó · 1 intento/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Regresar a la lección/ }));
    expect(screen.getByText("aprobaron la actividad")).toBeTruthy();
  });

  it("without kids or lessons says when it will have numbers", () => {
    data = { ...statistics, kids: 0, lessons: [], by_kid: [] };
    render(<StatisticsPanel classroomId="c1" />);

    expect(screen.getByText("Aún no hay estadísticas")).toBeTruthy();
    expect(screen.getByText(/Cuando haya estudiantes en la clase/)).toBeTruthy();
  });
});
