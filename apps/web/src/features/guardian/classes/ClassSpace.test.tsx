import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { FamilyClassroomDetail, NotificationItem, NotificationPage } from "@iris/shared-types";
import { ClassSpace, type ClassOption } from "./ClassSpace";

const detail: FamilyClassroomDetail = {
  enrollment_id: "e1",
  student_id: "s1",
  student_first_name: "Sofía",
  status: "aceptada",
  requested_at: "2026-10-04T10:00:00Z",
  resolved_at: "2026-10-04T12:00:00Z",
  classroom_id: "c1",
  name: "Matemáticas",
  description: "d",
  logo_file: null,
  color: "green",
  area: "mathematics",
  area_other: null,
  grade: 2,
  teacher_name: "Laura Gómez",
  published_lessons: 3,
  published_units: 1,
  teacher: {
    first_name: "Laura",
    last_name: "Gómez",
    institution: null,
    about: "Docente de primaria.",
    studies: [],
    experiences: [],
  },
};

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
  created_at: "2026-10-04T12:00:00Z",
};

const leave = vi.fn();
const send = vi.fn();
const markRead = vi.fn();
let page: NotificationPage = { items: [notice], total: 1, unread_count: 1, page: 1, page_size: 8 };

vi.mock("@/shared/api/hooks/useClassroomsApi", () => ({
  useFamilyClassroom: () => ({ data: detail, isLoading: false, error: null }),
  useLeaveClassroom: () => ({ mutateAsync: leave, isPending: false }),
  useSendTeacherMessage: () => ({ mutateAsync: send, isPending: false }),
}));
vi.mock("@/shared/api/hooks/useNotifications", () => ({
  useClassNotifications: () => ({ data: page, isLoading: false, isError: false, error: null }),
  useMarkNotificationRead: () => ({ mutateAsync: markRead }),
}));

const onOption = vi.fn();
const onLeft = vi.fn();
const onToast = vi.fn();

function renderSpace(option: ClassOption | null = null) {
  return render(
    <MemoryRouter>
      <ClassSpace
        enrollmentId="e1"
        firstName="Sofía"
        option={option}
        onOption={onOption}
        onLeft={onLeft}
        onToast={onToast}
      />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  page = { items: [notice], total: 1, unread_count: 1, page: 1, page_size: 8 };
});

describe("ClassSpace", () => {
  it("shows the class, its teacher and its options with the unread count", async () => {
    renderSpace();

    expect(screen.getByRole("heading", { name: "Matemáticas" })).toBeTruthy();
    expect(screen.getByText("Matemáticas · 2.° · con Laura Gómez")).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: "Notificaciones, 1 sin leer. Los avisos de esta clase sobre tu peque." }),
    );
    expect(onOption).toHaveBeenCalledWith("notificaciones");
  });

  it("takes the kid out only after confirming, then tells who left", async () => {
    leave.mockResolvedValue(undefined);
    renderSpace();

    await userEvent.click(screen.getByRole("button", { name: "Retirar de la clase" }));
    const dialog = screen.getByRole("dialog", { name: "Retirar de la clase" });
    expect(dialog.textContent).toContain('¿Seguro que quieres retirar a Sofía de "Matemáticas"?');
    await userEvent.click(within(dialog).getByRole("button", { name: "Retirar" }));

    expect(leave).toHaveBeenCalledWith("e1");
    expect(onLeft).toHaveBeenCalledWith("Matemáticas");
  });

  it("cancelling the question changes nothing", async () => {
    renderSpace();

    await userEvent.click(screen.getByRole("button", { name: "Retirar de la clase" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));

    expect(leave).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("writes to the teacher with a subject and a message", async () => {
    send.mockResolvedValue(undefined);
    renderSpace("contacto");

    await userEvent.click(screen.getByRole("button", { name: "Enviar mensaje" }));
    expect(screen.getByText("Escribe el asunto del mensaje.")).toBeTruthy();
    expect(send).not.toHaveBeenCalled();

    await userEvent.type(screen.getByRole("textbox", { name: /^Asunto/ }), "  Tarea de sumas ");
    await userEvent.type(screen.getByRole("textbox", { name: /^Mensaje/ }), "Hola profe, Sofía no pudo entrar ayer.");
    await userEvent.click(screen.getByRole("button", { name: "Enviar mensaje" }));

    expect(send).toHaveBeenCalledWith({
      enrollmentId: "e1",
      subject: "Tarea de sumas",
      body: "Hola profe, Sofía no pudo entrar ayer.",
    });
    expect(onToast).toHaveBeenCalledWith("Le enviamos tu mensaje a Laura Gómez.");
    expect(onOption).toHaveBeenCalledWith(null);
  });

  it("opens a notification of the class right there and marks it read", async () => {
    markRead.mockResolvedValue(undefined);
    renderSpace("notificaciones");

    const head = screen.getByRole("button", { name: /Solicitud de ingreso aceptada/ });
    await userEvent.click(head);

    expect(head.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/Laura Gómez aceptó la solicitud de Sofía/)).toBeTruthy();
    expect(markRead).toHaveBeenCalledWith("n1");
  });

  it("says when the class hasn't sent anything yet", () => {
    page = { items: [], total: 0, unread_count: 0, page: 1, page_size: 8 };
    renderSpace("notificaciones");

    expect(screen.getByText("Esta clase todavía no te ha enviado notificaciones.")).toBeTruthy();
  });

  it("shows the teacher's profile with who declared it", () => {
    renderSpace("docente");

    expect(screen.getByRole("region", { name: "Perfil de Laura Gómez" })).toBeTruthy();
    expect(screen.getByText("Docente de primaria.")).toBeTruthy();
    expect(screen.getByText("Esta información la escribió el docente en su perfil.")).toBeTruthy();
  });
});
