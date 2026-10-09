import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { LessonProgress, UnitWithLessons } from "@iris/shared-types";
import UnitLessonsPage from "./UnitLessonsPage";
import UnitsPage from "./UnitsPage";

let units: UnitWithLessons[] = [];
let progress: LessonProgress[] = [];

vi.mock("@/shared/auth/useAuth", () => ({ useAuth: () => ({ session: null }) }));
vi.mock("@/shared/api/hooks/useClassroomsApi", () => ({
  useStudentClassrooms: () => ({ data: [{ id: "c1", name: "Ciencias naturales" }] }),
}));
vi.mock("@/shared/api/hooks/useLessonsApi", () => ({
  useClassroomUnits: () => ({ data: units, isLoading: false, isError: false }),
  useMyClassProgress: () => ({ data: progress }),
}));

function lesson(id: string, title: string) {
  return {
    id,
    classroom_id: "c1",
    unit_id: "u1",
    teacher_id: "t1",
    title,
    purpose: "Para aprender.",
    learning_goal: "Aprendo.",
    order_index: 0,
    status: "publicada" as const,
  };
}

function unit(id: string, title: string, lessons = [lesson(`${id}-l`, "Lección")]): UnitWithLessons {
  return { id, classroom_id: "c1", title, guiding_question: `¿Qué hay en ${title}?`, order_index: 0, lessons };
}

function renderAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/student/classrooms/:classroomId" element={<p>Espacio de la clase</p>} />
        <Route path="/student/classrooms/:classroomId/units" element={<UnitsPage />} />
        <Route path="/student/classrooms/:classroomId/units/:unitId" element={<UnitLessonsPage />} />
        <Route path="/student/lessons/:lessonId" element={<p>Lección abierta</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  units = [];
  progress = [];
});

describe("the units of a class (HU-104)", () => {
  it("shows each unit with its guiding question, three at a time", async () => {
    units = ["Animales", "Plantas", "Agua", "Suelo"].map((title, i) => unit(`u${i}`, title));
    renderAt("/student/classrooms/c1/units");

    expect(screen.getByRole("heading", { name: "Ciencias naturales" })).toBeTruthy();
    expect(screen.getByText("¿Qué hay en Animales?")).toBeTruthy();
    expect(screen.queryByText("Suelo")).toBeNull();
    expect(screen.getByText("Unidades 1 a 3 de 4")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Ver unidades siguientes" }));

    expect(screen.getByText("Suelo")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ver unidades siguientes" })).toHaveProperty("disabled", true);
  });

  it("without published lessons says so and goes back to the class", async () => {
    renderAt("/student/classrooms/c1/units");

    expect(screen.getByText(/todavía no ha publicado lecciones/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Volver a la clase/ }));
    expect(screen.getByText("Espacio de la clase")).toBeTruthy();
  });
});

describe("the lessons of a unit (HU-60)", () => {
  it("asks the guiding question and says how each lesson is going", async () => {
    units = [unit("u1", "Animales", [lesson("l1", "Animales terrestres"), lesson("l2", "Animales acuáticos")])];
    const main = {
      extra_id: null,
      title: "Animales terrestres",
      kind: "leccion" as const,
      total_pages: 4,
      pages_seen: 1,
      has_activity: true,
      attempts: [],
      percent: 20,
    };
    progress = [{ lesson_id: "l1", title: "Animales terrestres", unit_title: "Animales", main, extras: [] }];
    renderAt("/student/classrooms/c1/units/u1");

    expect(screen.getByText("¿Qué hay en Animales?")).toBeTruthy();
    expect(screen.getByText("Llevas 25 %")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Animales acuáticos/ }));

    expect(screen.getByText("Lección abierta")).toBeTruthy();
  });

  it("a unit that isn't there goes back to the units", () => {
    units = [unit("u1", "Animales")];
    renderAt("/student/classrooms/c1/units/u9");

    expect(screen.getByRole("heading", { name: "Ciencias naturales" })).toBeTruthy();
  });
});
