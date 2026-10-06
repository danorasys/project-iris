import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
  it("has the menu of HU-68, with the unread count and who is signed in", () => {
    renderPortal();

    for (const option of ["Notificaciones", "Mi perfil", "Mis clases", "Cerrar sesión"]) {
      expect(screen.getByRole("button", { name: new RegExp(option) })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: /Notificaciones 3 sin leer/ })).toBeTruthy();
    expect(screen.getByText("carlos@example.com")).toBeTruthy();
    expect(screen.getByText("Sección mis clases")).toBeTruthy();
  });

  it("adds up the pending requests of every classroom in a notice", async () => {
    classrooms = [classroom("a", 2), classroom("b", 0), classroom("c", 1)];
    const user = userEvent.setup({ delay: null });
    renderPortal();

    expect(screen.getByText(/Tienes 3 solicitudes de ingreso esperando tu respuesta/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Revisar" }));
    expect(screen.getByText("Sección notificaciones")).toBeTruthy();
  });

  it("has no notice when nothing waits", () => {
    classrooms = [classroom("a", 0)];
    renderPortal();

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
    expect(screen.getByText("Sección mis clases")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Cerrar sesión/ }));
    await user.click(screen.getByRole("button", { name: "Sí, cerrar sesión" }));
    expect(closeSession).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Inicio de sesión")).toBeTruthy();
  });
});
