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
    expect(stat("Clases").getByText("de 1.° a 3.° grado")).toBeTruthy();
    expect(stat("Estudiantes").getByText("20")).toBeTruthy();
    expect(stat("Solicitudes").getByText("2")).toBeTruthy();
    expect(stat("Solicitudes").getByText("esperan tu respuesta")).toBeTruthy();
    expect(stat("Lecciones publicadas").getByText("5")).toBeTruthy();
    expect(stat("Lecciones publicadas").getByText("1 en borrador")).toBeTruthy();
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

    const tasks = within(screen.getByRole("region", { name: "Requiere tu atención" })).getAllByRole("button");
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

  it("without classes invites to create the first one and says everything is up to date", async () => {
    const user = userEvent.setup({ delay: null });
    render(<TeacherHomeSection {...handlers} />);

    expect(screen.getByText("Todavía no tienes clases")).toBeTruthy();
    expect(screen.getByText("Todo al día")).toBeTruthy();
    // Only one "Nueva clase", the one in the welcome.
    await user.click(screen.getByRole("button", { name: "Nueva clase" }));
    expect(handlers.onCreateClassroom).toHaveBeenCalledTimes(1);
  });

  it("each class shows how many of its lessons are published", async () => {
    const user = userEvent.setup({ delay: null });
    classrooms = [classroom("a", "Matemáticas", { student_count: 1 })];
    summary = [{ classroom_id: "a", units: 1, published_lessons: 1, draft_lessons: 2 }];
    render(<TeacherHomeSection {...handlers} />);

    const classes = within(screen.getByRole("region", { name: "Tus clases" }));
    const row = classes.getByRole("button", { name: /Matemáticas/ });
    expect(row.textContent).toContain("1 estudiante");
    expect(within(row).getByText("1 de 3 publicadas")).toBeTruthy();
    await user.click(row);
    expect(handlers.onOpenClassroom).toHaveBeenCalledWith("a");
  });
});
