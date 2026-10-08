import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { TeacherClassroom } from "@iris/shared-types";
import TeacherPortalPage from "./TeacherPortalPage";

const closeSession = vi.fn();

function classroom(id: string, pending: number): TeacherClassroom {
  return {
    id,
    teacher_id: "t1",
    name: `Clase ${id}`,
    description: "d",
    logo_file: null,
    color: "blue",
    enrollment_code: "1234567",
    created_at: "2026-10-04T10:00:00Z",
    pending_requests: pending,
    student_count: 0,
  };
}

let classrooms: TeacherClassroom[] = [];

vi.mock("@/shared/auth/useAuth", () => ({ useAuth: () => ({ closeSession }) }));
vi.mock("@/shared/api/hooks/useClassroomsApi", () => ({
  useTeacherClassrooms: () => ({ data: classrooms, isLoading: false, isError: false }),
}));
vi.mock("@/shared/api/hooks/useNotifications", () => ({
  useUnreadNotifications: () => ({ data: 3 }),
}));
vi.mock("@/shared/api/hooks/useTeacherProfileApi", () => ({
  useMyTeacherAccount: () => ({ data: { first_name: "Carlos", last_name: "Ruiz", email: "carlos@example.com" } }),
}));
// The sections have their own tests.
vi.mock("./sections/TeacherHomeSection", () => ({ TeacherHomeSection: () => <p>Sección inicio</p> }));
vi.mock("./sections/ClassroomsSection", () => ({ ClassroomsSection: () => <p>Sección mis clases</p> }));
vi.mock("./sections/TeacherProfileSection", () => ({ TeacherProfileSection: () => <p>Sección mi perfil</p> }));
vi.mock("./sections/TeacherNotificationsSection", () => ({
  TeacherNotificationsSection: () => <p>Sección notificaciones</p>,
}));

function renderPortal() {
  return render(
    <MemoryRouter initialEntries={["/teacher/portal"]}>
      <Routes>
        <Route path="/teacher/portal" element={<TeacherPortalPage />} />
        <Route path="/login/adult" element={<p>Inicio de sesión</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  classrooms = [];
  closeSession.mockReset();
});

describe("Portal Docente", () => {
  it("opens on Inicio, with the menu of HU-68, the unread count and who is signed in", () => {
    renderPortal();

    for (const option of ["Inicio", "Mis clases", "Notificaciones", "Mi perfil", "Cerrar sesión"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${option}`) })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: /Notificaciones 3 sin leer/ })).toBeTruthy();
    expect(screen.getByText("carlos@example.com")).toBeTruthy();
    // The greeting is in Inicio's own banner now, the bar only says where you are.
    expect(screen.queryByRole("heading", { level: 1, name: /Carlos/ })).toBeNull();
    expect(screen.getByText("Sección inicio")).toBeTruthy();
  });

  it("puts what the teacher comes to do on top and Mi perfil down with the account", () => {
    renderPortal();

    const menu = within(screen.getByRole("navigation", { name: "Opciones del portal docente" }));
    expect(menu.getAllByRole("button").map((b) => b.textContent?.replace(/\d+.*$/, "").trim())).toEqual([
      "Inicio",
      "Mis clases",
      "Notificaciones",
    ]);
    // Still there, next to "Cerrar sesión".
    expect(screen.getByRole("button", { name: /^Mi perfil/ })).toBeTruthy();
  });

  it("the bell of the top bar opens the notifications", async () => {
    const user = userEvent.setup({ delay: null });
    renderPortal();

    await user.click(screen.getByRole("button", { name: "Ver notificaciones, 3 sin leer" }));

    expect(screen.getByText("Sección notificaciones")).toBeTruthy();
  });

  it("the initials of the top bar and the account card open Mi perfil", async () => {
    const user = userEvent.setup({ delay: null });
    renderPortal();

    await user.click(screen.getByRole("button", { name: "Ir a Mi perfil, Carlos" }));
    expect(screen.getByText("Sección mi perfil")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /^Inicio/ }));
    await user.click(screen.getByRole("button", { name: /^Ir a Mi perfil, Carlos, carlos@example.com/ }));
    expect(screen.getByText("Sección mi perfil")).toBeTruthy();
  });

  it("adds up the pending requests of every classroom in a notice, except on Inicio", async () => {
    classrooms = [classroom("a", 2), classroom("b", 0), classroom("c", 1)];
    const user = userEvent.setup({ delay: null });
    renderPortal();

    // Inicio already lists them among what needs attention.
    expect(screen.queryByText(/esperando tu respuesta/)).toBeNull();
    await user.click(screen.getByRole("button", { name: /^Mis clases/ }));
    expect(screen.getByText(/Tienes 3 solicitudes de ingreso esperando tu respuesta/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Revisar" }));
    expect(screen.getByText("Sección notificaciones")).toBeTruthy();
  });

  it("has no notice when nothing waits", async () => {
    classrooms = [classroom("a", 0)];
    const user = userEvent.setup({ delay: null });
    renderPortal();

    await user.click(screen.getByRole("button", { name: /^Mis clases/ }));
    expect(screen.queryByText(/esperando tu respuesta/)).toBeNull();
  });

  it("asks before signing out, and staying keeps the panel", async () => {
    closeSession.mockResolvedValue(undefined);
    const user = userEvent.setup({ delay: null });
    renderPortal();

    await user.click(screen.getByRole("button", { name: /Cerrar sesión/ }));
    expect(screen.getByText("¿Estás seguro de cerrar sesión?")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(closeSession).not.toHaveBeenCalled();
    expect(screen.getByText("Sección inicio")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Cerrar sesión/ }));
    await user.click(screen.getByRole("button", { name: "Sí, cerrar sesión" }));
    expect(closeSession).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Inicio de sesión")).toBeTruthy();
  });
});
