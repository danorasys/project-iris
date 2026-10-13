import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ClassroomContentSummary, NotificationItem, TeacherClassroom } from "@iris/shared-types";
import { TeacherHomeSection } from "./TeacherHomeSection";

function classroom(id: string, name: string, extra: Partial<TeacherClassroom> = {}): TeacherClassroom {
  return {
    id,
    teacher_id: "t1",
    name,
    description: "d",
    logo_file: null,
    color: "blue",
    area: "mathematics",
    grade: 3,
    enrollment_code: "1234567",
    created_at: "2026-10-04T10:00:00Z",
    pending_requests: 0,
    student_count: 0,
    ...extra,
  };
}

let classrooms: TeacherClassroom[] = [];
let summary: ClassroomContentSummary[] = [];
let notices: NotificationItem[] = [];

vi.mock("@/shared/api/hooks/useClassroomsApi", () => ({
  useTeacherClassrooms: () => ({ data: classrooms, isLoading: false, isError: false }),
}));
vi.mock("@/shared/api/hooks/useLessonsApi", () => ({
  useContentSummary: () => ({ data: summary, isLoading: false }),
}));
vi.mock("@/shared/api/hooks/useNotifications", () => ({
  useNotificationTray: () => ({ data: { items: notices, total: notices.length, unread_count: 0 }, isLoading: false }),
}));

// The card of one count: its label, number and hint.
const stat = (label: string) => within(screen.getByText(label, { selector: "p" }).parentElement as HTMLElement);

const handlers = {
  onOpenClassroom: vi.fn(),
  onOpenClassrooms: vi.fn(),
  onCreateClassroom: vi.fn(),
  onOpenNotifications: vi.fn(),
  onOpenNotification: vi.fn(),
};

afterEach(() => {
  cleanup();
  classrooms = [];
  summary = [];
  notices = [];
  for (const handler of Object.values(handlers)) handler.mockReset();
});

describe("TeacherHomeSection", () => {
  it("adds up classes, students, requests and lessons from the real data", () => {
    classrooms = [
      classroom("a", "Matemáticas", { student_count: 12, pending_requests: 2, grade: 3 }),
      classroom("b", "Ciencias", { student_count: 8, grade: 1 }),
    ];
    summary = [
      { classroom_id: "a", units: 2, published_lessons: 4, draft_lessons: 1 },
      { classroom_id: "b", units: 1, published_lessons: 1, draft_lessons: 0 },
    ];
    render(<TeacherHomeSection {...handlers} />);

    expect(stat("Clases").getByText("2")).toBeTruthy();
    expect(stat("Estudiantes").getByText("20")).toBeTruthy();
    expect(stat("Solicitudes").getByText("2")).toBeTruthy();
    expect(stat("Lecciones publicadas").getByText("5")).toBeTruthy();
    // Just the number, like the parents' counts: no line under it.
    expect(screen.getByText("Clases", { selector: "p" }).parentElement?.textContent).toBe("Clases2");
  });

  it("lists what needs the teacher: requests first, then classes without units and drafts", async () => {
    const user = userEvent.setup({ delay: null });
    classrooms = [
      classroom("a", "Matemáticas", { pending_requests: 1 }),
      classroom("b", "Lenguaje"),
      classroom("c", "Ciencias"),
    ];
    summary = [
      { classroom_id: "a", units: 1, published_lessons: 1, draft_lessons: 0 },
      { classroom_id: "c", units: 1, published_lessons: 0, draft_lessons: 2 },
    ];
    render(<TeacherHomeSection {...handlers} />);

    const tasks = within(screen.getByRole("region", { name: "Para tener en cuenta" })).getAllByRole("button");
    expect(tasks.map((task) => task.textContent)).toEqual([
      "1 solicitud de ingresoMatemáticas",
      "Aún no tiene unidadesLenguaje",
      "2 lecciones en borradorCiencias",
    ]);
    await user.click(tasks[0]);
    expect(handlers.onOpenClassroom).toHaveBeenCalledWith("a", "miembros");
    await user.click(tasks[2]);
    expect(handlers.onOpenClassroom).toHaveBeenCalledWith("c", "lecciones");
  });

  it("shows 3 classes at most and one Ver todas for the rest, like the kids on the parents' Inicio", async () => {
    const user = userEvent.setup({ delay: null });
    classrooms = ["a", "b", "c", "d"].map((id) => classroom(id, `Clase ${id}`));
    render(<TeacherHomeSection {...handlers} />);

    const classes = within(screen.getByRole("region", { name: "Tus clases" }));
    expect(classes.getAllByRole("button", { name: /^Clase/ })).toHaveLength(3);
    // Only the panel's own link, no second one under the list.
    expect(classes.getAllByRole("button", { name: /^Ver todas/ })).toHaveLength(1);
    await user.click(classes.getByRole("button", { name: "Ver todas" }));
    expect(handlers.onOpenClassrooms).toHaveBeenCalledTimes(1);
  });

  it("shows at most 4 things to keep in mind, like the parents' Inicio", () => {
    // Five classes without units: only the first four fit.
    classrooms = ["a", "b", "c", "d", "e"].map((id) => classroom(id, `Clase ${id}`));
    render(<TeacherHomeSection {...handlers} />);

    const tasks = within(screen.getByRole("region", { name: "Para tener en cuenta" })).getAllByRole("button");
    expect(tasks).toHaveLength(4);
  });

  it("without classes invites to create the first one and says everything is up to date", async () => {
    const user = userEvent.setup({ delay: null });
    render(<TeacherHomeSection {...handlers} />);

    expect(screen.getByText("Todavía no tienes clases")).toBeTruthy();
    expect(screen.getByText("Todo al día")).toBeTruthy();
    // The tips are there with or without classes, like the parents' ones.
    const tips = within(screen.getByRole("region", { name: "Para enseñar con IRIS" }));
    expect(tips.getAllByRole("listitem")).toHaveLength(4);
    // Only one "Nueva clase", the one in the empty classes panel.
    await user.click(screen.getByRole("button", { name: "Nueva clase" }));
    expect(handlers.onCreateClassroom).toHaveBeenCalledTimes(1);
  });

  it("each class shows who it's for and its students, not its units or lessons", async () => {
    const user = userEvent.setup({ delay: null });
    classrooms = [classroom("a", "Matemáticas", { student_count: 1 }), classroom("b", "Ciencias")];
    summary = [{ classroom_id: "a", units: 2, published_lessons: 1, draft_lessons: 2 }];
    render(<TeacherHomeSection {...handlers} />);

    // With classes, new ones are made from "Mis clases", not from Inicio.
    expect(screen.queryByRole("button", { name: "Nueva clase" })).toBeNull();
    const classes = within(screen.getByRole("region", { name: "Tus clases" }));
    const row = classes.getByRole("button", { name: /^Matemáticas/ });
    // The units are in the class, the row stays as thin as a kid's.
    expect(row.textContent).not.toMatch(/unidad|publicada|lecci/i);
    // A class with nobody yet says so.
    expect(classes.getByRole("button", { name: "Estudiantes de Ciencias: Sin estudiantes" })).toBeTruthy();
    await user.click(row);
    expect(handlers.onOpenClassroom).toHaveBeenCalledWith("a");
    // Its students button opens Miembros, like a kid's classes button.
    await user.click(classes.getByRole("button", { name: "Estudiantes de Matemáticas: 1 estudiante" }));
    expect(handlers.onOpenClassroom).toHaveBeenCalledWith("a", "miembros");
  });
});
