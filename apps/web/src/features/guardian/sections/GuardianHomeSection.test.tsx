import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { FamilyClassroom, NotificationItem, StudentProfile } from "@iris/shared-types";
import { ApiError } from "@/shared/api/httpClient";
import { GuardianHomeSection } from "./GuardianHomeSection";

function kid(id: string, first_name: string): StudentProfile {
  return { id, first_name, avatar_id: 1, date_of_birth: "2018-03-10" };
}

function classOf(student: StudentProfile, name: string, extra: Partial<FamilyClassroom> = {}): FamilyClassroom {
  return {
    enrollment_id: `${student.id}-${name}`,
    student_id: student.id,
    student_first_name: student.first_name,
    status: "aceptada",
    requested_at: "2026-10-04T10:00:00Z",
    classroom_id: `c-${name}`,
    name,
    description: "d",
    color: "green",
    area: "mathematics",
    grade: 2,
    area_other: null,
    teacher_name: "Laura Gómez",
    published_lessons: 3,
    ...extra,
  };
}

const sofia = kid("s1", "Sofía");
const tomas = kid("s2", "Tomás");

let kids: StudentProfile[] = [];
let classes: FamilyClassroom[] = [];
let familyError: unknown = null;
let notices: NotificationItem[] = [];
let unread = 0;

vi.mock("@/shared/api/hooks/useAuthApi", () => ({
  useEstudiantesDeTutor: () => ({ data: kids, isLoading: false, isError: false }),
  useMiPerfilTutor: () => ({ data: { first_name: "Daniel Orlando" } }),
  useAvatars: () => ({ data: [{ id: 1, name: "Búho" }] }),
}));
vi.mock("@/shared/api/hooks/useClassroomsApi", () => ({
  useFamilyClassrooms: () => ({ data: classes, isLoading: false, isError: Boolean(familyError), error: familyError }),
}));
vi.mock("@/shared/api/hooks/useNotifications", () => ({
  useBandejaNotificaciones: () => ({
    data: { items: notices, total: notices.length, unread_count: unread },
    isLoading: false,
    error: null,
  }),
}));

// The card of one count: its label, number and hint.
const stat = (label: string) => within(screen.getByText(label, { selector: "p" }).parentElement as HTMLElement);

const handlers = {
  onOpenStudent: vi.fn(),
  onOpenStudents: vi.fn(),
  onOpenNotifications: vi.fn(),
  onOpenNotification: vi.fn(),
};

function renderHome() {
  return render(
    <MemoryRouter initialEntries={["/guardian/portal"]}>
      <Routes>
        <Route path="/guardian/portal" element={<GuardianHomeSection {...handlers} />} />
        <Route path="/guardian/verify-2fa" element={<p>Pantalla del código</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  kids = [];
  classes = [];
  familyError = null;
  notices = [];
  unread = 0;
  for (const handler of Object.values(handlers)) handler.mockReset();
});

describe("GuardianHomeSection", () => {
  it("adds up kids, classes, requests waiting and the lessons ready to learn", () => {
    kids = [sofia, tomas];
    classes = [
      classOf(sofia, "Matemáticas", { published_lessons: 3 }),
      classOf(sofia, "Arte", { published_lessons: 2 }),
      classOf(tomas, "Ciencias", { status: "pendiente", published_lessons: 5 }),
    ];
    renderHome();

    expect(stat("Peques").getByText("2")).toBeTruthy();
    expect(stat("Clases").getByText("2")).toBeTruthy();
    expect(stat("Solicitudes en espera").getByText("1")).toBeTruthy();
    // Only the lessons of the classes they're already in.
    expect(stat("Lecciones para aprender").getByText("5")).toBeTruthy();
    // Just the label and the number, no line under it.
    for (const hint of ["con perfil en IRIS", "aún en ninguna", "ninguna en espera", "listas en sus clases"]) {
      expect(screen.queryByText(hint)).toBeNull();
    }
  });

  it("gives each kid one row with a button to their classes, however many they have", async () => {
    const user = userEvent.setup({ delay: null });
    kids = [sofia, tomas];
    classes = [
      classOf(sofia, "Matemáticas"),
      classOf(sofia, "Arte"),
      classOf(sofia, "Lenguaje"),
      classOf(sofia, "Ciencias", { status: "pendiente" }),
    ];
    renderHome();

    // The classes themselves aren't listed here, only how many.
    expect(screen.queryByText("Matemáticas")).toBeNull();
    const sofiaClasses = screen.getByRole("button", { name: "Clases de Sofía: 3 clases, 1 en espera" });
    expect(screen.getByRole("button", { name: "Clases de Tomás: Sin clases aún" })).toBeTruthy();

    await user.click(sofiaClasses);
    expect(handlers.onOpenStudent).toHaveBeenCalledWith("s1", "clases");
  });

  it("shows three kids at most and a link to all of them", async () => {
    const user = userEvent.setup({ delay: null });
    kids = ["a", "b", "c", "d", "e", "f", "g"].map((id) => kid(id, `Peque ${id}`));
    renderHome();

    expect(screen.getAllByRole("button", { name: /^Clases de Peque/ })).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "Ver todos los 7 peques" }));
    expect(handlers.onOpenStudents).toHaveBeenCalled();
  });

  it("lists what's worth a look and opens the kid or the notifications", async () => {
    const user = userEvent.setup({ delay: null });
    kids = [sofia, tomas];
    classes = [classOf(sofia, "Ciencias", { status: "pendiente" })];
    unread = 2;
    renderHome();

    const tasks = within(screen.getByRole("region", { name: "Para tener en cuenta" }));
    const buttons = tasks.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual([
      expect.stringContaining("Tienes 2 notificaciones sin leer"),
      expect.stringContaining("Sofía espera entrar a Ciencias"),
      expect.stringContaining("Tomás aún no está en una clase"),
    ]);

    await user.click(buttons[0]);
    expect(handlers.onOpenNotifications).toHaveBeenCalled();
    await user.click(buttons[2]);
    expect(handlers.onOpenStudent).toHaveBeenCalledWith("s2", "clases");

    await user.click(screen.getByRole("button", { name: /Sofía.*Ver su espacio/ }));
    expect(handlers.onOpenStudent).toHaveBeenCalledWith("s1");
  });

  it("opens a recent notification when it's clicked", async () => {
    const user = userEvent.setup({ delay: null });
    const notice: NotificationItem = {
      id: "n1",
      event: "request.resolved",
      decision: "aceptada",
      classroom_id: "c1",
      enrollment_id: "e1",
      student_id: "s1",
      student_name: "Sofía",
      classroom_name: "Matemáticas",
      sender_name: "Laura Gómez",
      read: false,
      created_at: "2026-10-03T15:42:00Z",
    };
    kids = [sofia];
    notices = [notice];
    renderHome();

    const recent = within(screen.getByRole("region", { name: "Notificaciones recientes" }));
    await user.click(recent.getByRole("button", { name: /Solicitud de ingreso aceptada · Sofía/ }));
    expect(handlers.onOpenNotification).toHaveBeenCalledWith(notice);
  });

  it("welcomes the guardian by name", () => {
    kids = [sofia, tomas];
    renderHome();

    const welcome = within(screen.getByRole("region", { name: "Bienvenida" }));
    expect(welcome.getByRole("heading", { level: 1, name: "Te damos la bienvenida, Daniel Orlando" })).toBeTruthy();
  });

  it("is all up to date when nothing waits, and gives the tips for a session with the gaze", () => {
    kids = [sofia];
    classes = [classOf(sofia, "Matemáticas")];
    renderHome();

    expect(screen.getByText("Todo al día")).toBeTruthy();
    const notifications = within(screen.getByRole("region", { name: "Notificaciones recientes" }));
    expect(notifications.getByText("No tienes notificaciones por ahora")).toBeTruthy();
    const tips = within(screen.getByRole("region", { name: "Antes de cada sesión de tu peque con IRIS" }));
    expect(tips.getByText("A la distancia de un brazo")).toBeTruthy();
    expect(tips.getByText("Calibrar con paciencia")).toBeTruthy();
  });

  it("says the classes didn't load instead of saying there are none", () => {
    kids = [sofia];
    familyError = new Error("sin red");
    renderHome();

    expect(screen.getByText("Clases no disponibles")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Clases de Sofía/ })).toBeNull();
  });

  it("goes to the code screen when the portal closed", () => {
    kids = [sofia];
    familyError = new ApiError(403, "acceso_portal_requerido", "Confirma tu código");
    renderHome();

    expect(screen.getByText("Pantalla del código")).toBeTruthy();
  });
});
