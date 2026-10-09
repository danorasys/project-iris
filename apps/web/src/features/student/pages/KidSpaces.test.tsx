import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Classroom, LessonProgress } from "@iris/shared-types";
import ClassSpacePage from "./ClassSpacePage";
import HomePage from "./HomePage";
import ProgressPage from "./ProgressPage";

let classrooms: Partial<Classroom>[] = [];
let progress: LessonProgress[] = [];
let unread = 0;

vi.mock("@/shared/auth/useAuth", () => ({ useAuth: () => ({ session: null }) }));
vi.mock("@/features/teacher/classrooms/ClassroomAvatar", () => ({ ClassroomAvatar: () => null }));
vi.mock("@/shared/api/hooks/useClassroomsApi", () => ({
  useStudentClassrooms: () => ({ data: classrooms, isLoading: false, isError: false }),
}));
vi.mock("@/shared/api/hooks/useNotifications", () => ({
  useUnreadNotifications: () => ({ data: unread }),
  useKidClassUnread: () => ({ data: unread }),
}));
vi.mock("@/shared/api/hooks/useLessonsApi", () => ({
  useMyClassProgress: () => ({ data: progress, isLoading: false, isError: false }),
}));

function classroom(id: string, name: string): Partial<Classroom> {
  return { id, name, color: "blue", logo_file: null };
}

function renderAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/student/home" element={<HomePage />} />
        <Route path="/student/notifications" element={<p>Bandeja</p>} />
        <Route path="/student/settings" element={<p>Ajustes del peque</p>} />
        <Route path="/student/classrooms/:classroomId" element={<ClassSpacePage />} />
        <Route path="/student/classrooms/:classroomId/notifications" element={<p>Bandeja de la clase</p>} />
        <Route path="/student/classrooms/:classroomId/units" element={<p>Unidades</p>} />
        <Route path="/student/classrooms/:classroomId/progress" element={<ProgressPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const attempt = (correct: number, passed: boolean, day: number) => ({
  correct,
  total: 3,
  passed,
  created_at: `2026-10-0${day}T10:00:00Z`,
});

function part(fields: Partial<LessonProgress["main"]>): LessonProgress["main"] {
  return {
    extra_id: null,
    title: "Animales",
    kind: "leccion",
    total_pages: 3,
    pages_seen: 3,
    has_activity: true,
    attempts: [],
    percent: 100,
    ...fields,
  };
}

afterEach(() => {
  cleanup();
  classrooms = [];
  progress = [];
  unread = 0;
});

describe("the kid's home (HU-53)", () => {
  it("has the tray first, with how many are new, then one per class", async () => {
    classrooms = [classroom("c1", "Ciencias naturales"), classroom("c2", "Matemáticas")];
    unread = 2;
    renderAt("/student/home");

    const buttons = screen.getAllByRole("button").map((b) => b.textContent);
    expect(buttons.slice(0, 3)).toEqual(["Notificaciones2, 2 nuevas", "Ciencias naturales", "Matemáticas"]);
    expect(screen.getByRole("button", { name: /Ajustes/ })).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: /Ciencias naturales/ }));
    expect(screen.getByRole("heading", { name: "Ciencias naturales" })).toBeTruthy();
  });

  it("without classes says the family signs them up", () => {
    renderAt("/student/home");

    expect(screen.getByText(/Tu familia te inscribe desde su portal/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Notificaciones/ })).toBeTruthy();
  });
});

describe("the space of a class (HU-57)", () => {
  it("has notifications with the new ones of the class, lessons, progress and the way back", async () => {
    classrooms = [classroom("c1", "Ciencias naturales")];
    unread = 1;
    renderAt("/student/classrooms/c1");

    expect(screen.getByRole("button", { name: "Notificaciones, 1 nueva" })).toBeTruthy();
    for (const name of [/Lecciones/, /Mi progreso/, /Volver al inicio/]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    await userEvent.click(screen.getByRole("button", { name: /Notificaciones/ }));
    expect(screen.getByText("Bandeja de la clase")).toBeTruthy();
  });

  it("a class that isn't theirs goes back home", () => {
    renderAt("/student/classrooms/c9");

    expect(screen.getByText(/A dónde quieres ir|ninguna clase/)).toBeTruthy();
  });
});

describe("the kid's progress (HU-58, HU-59)", () => {
  it("shows each lesson with its bar and every try, and the extras the same way", async () => {
    classrooms = [classroom("c1", "Ciencias naturales")];
    progress = [
      {
        lesson_id: "l1",
        title: "Animales terrestres",
        unit_title: "Unidad 1",
        main: part({ attempts: [attempt(1, false, 1), attempt(3, true, 2)] }),
        extras: [part({ extra_id: "x1", title: "Juego", kind: "actividad", percent: 0, has_activity: true })],
      },
      {
        lesson_id: "l2",
        title: "Animales acuáticos",
        unit_title: "Unidad 1",
        main: part({ percent: 40, pages_seen: 1 }),
        extras: [],
      },
    ];
    renderAt("/student/classrooms/c1/progress");

    expect(screen.getByRole("heading", { name: "Mi progreso en Ciencias naturales" })).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Avance de La lección" }).getAttribute("aria-valuenow")).toBe("100");
    expect(screen.getByText("Para repasar")).toBeTruthy();
    expect(screen.getByText("¡Aprobado!")).toBeTruthy();
    expect(screen.getByText(/Juego · actividad/)).toBeTruthy();
    expect(screen.getAllByText("Aún no has hecho la actividad.")).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Lección siguiente" }));
    expect(screen.getByRole("heading", { name: "Animales acuáticos" })).toBeTruthy();
    expect(screen.getByText("Lección 2 de 2")).toBeTruthy();
  });

  it("without lessons says so, with the way back to the class", () => {
    classrooms = [classroom("c1", "Ciencias naturales")];
    renderAt("/student/classrooms/c1/progress");

    expect(screen.getByText(/todavía no ha publicado lecciones/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Volver a la clase/ })).toBeTruthy();
  });
});
