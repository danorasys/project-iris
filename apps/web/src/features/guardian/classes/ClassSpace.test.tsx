import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FamilyClassroomDetail, NotificationItem, NotificationPage } from "@iris/shared-types";
import { ApiError } from "@/shared/api/httpClient";
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
const remove = vi.fn();
const removeMany = vi.fn();
let page: NotificationPage = { items: [notice], total: 1, unread_count: 1, page: 1, page_size: 8 };
let family: { data: FamilyClassroomDetail | undefined; error: unknown } = { data: detail, error: null };

vi.mock("@/shared/api/hooks/useClassroomsApi", () => ({
  classroomKeys: { family: ["aulas", "familia"] },
  useFamilyClassroom: () => ({ ...family, isLoading: false }),
  useLeaveClassroom: () => ({ mutateAsync: leave, isPending: false }),
  useSendTeacherMessage: () => ({ mutateAsync: send, isPending: false }),
}));
vi.mock("@/shared/api/hooks/useNotifications", () => ({
  useClassNotifications: () => ({ data: page, isLoading: false, isError: false, error: null }),
  // The whole tray isn't asked for inside a class.
  useBandejaNotificaciones: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
  useMarcarNotificacionLeida: () => ({ mutateAsync: markRead }),
  useEliminarNotificacion: () => ({ mutateAsync: remove }),
  useEliminarNotificaciones: () => ({ mutateAsync: removeMany, isPending: false }),
}));

const onOption = vi.fn();
const onLeft = vi.fn();
const onToast = vi.fn();

function renderSpace(option: ClassOption | null = null) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ClassSpace
          enrollmentId="e1"
          firstName="Sofía"
          option={option}
          onOption={onOption}
          onLeft={onLeft}
          onToast={onToast}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  page = { items: [notice], total: 1, unread_count: 1, page: 1, page_size: 8 };
  family = { data: detail, error: null };
});

describe("ClassSpace", () => {
  it("shows the class, its teacher and its options with the unread count", async () => {
    renderSpace();

    expect(screen.getByRole("heading", { name: "Matemáticas" })).toBeTruthy();
    expect(screen.getByText("Matemáticas · 2.° · con Laura Gómez")).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: "Notificaciones, 1 sin leer. Las novedades de esta clase sobre tu peque." }),
    );
    expect(onOption).toHaveBeenCalledWith("notificaciones");
  });

  it("shows how the class is organized as one more option", async () => {
    renderSpace();

    await userEvent.click(
      screen.getByRole("button", {
        name: "Estructura de la clase. Sus unidades y lecciones, y lo que Sofía aprende en cada una.",
      }),
    );
    expect(onOption).toHaveBeenCalledWith("estructura");
  });

  it("an archived class says so and takes no messages, but keeps the progress (HU-106)", () => {
    family = { data: { ...detail, archived_at: "2026-10-09T15:00:00Z" }, error: null };
    renderSpace();

    expect(screen.getByText("Archivada")).toBeTruthy();
    expect(screen.getByText(/Laura Gómez archivó esta clase el/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Progreso/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Estructura de la clase/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Contactar al docente/ })).toBeNull();
  });

  it("explains a class that was deleted while the list was open", () => {
    family = {
      data: undefined,
      error: new ApiError(404, "inscripcion_no_encontrada", "La solicitud de ingreso no existe."),
    };
    renderSpace();

    expect(screen.getByRole("alert").textContent).toMatch(
      /Esta clase ya no existe: puede que el docente la haya eliminado/,
    );
    expect(screen.queryByText("La solicitud de ingreso no existe.")).toBeNull();
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

  it("shows the class notifications in the same tray as Notificaciones, and opens one as a mail", async () => {
    markRead.mockResolvedValue(undefined);
    renderSpace("notificaciones");

    expect(screen.getByRole("heading", { name: "Notificaciones de la clase" })).toBeTruthy();
    const list = screen.getByRole("list", { name: "Lista de notificaciones" });
    expect(within(list).getByRole("checkbox", { name: /^Seleccionar: Solicitud de ingreso aceptada/ })).toBeTruthy();

    await userEvent.click(within(list).getByRole("button", { name: /^No leída:/ }));

    expect(screen.getByText(/Laura Gómez aceptó la solicitud de Sofía/)).toBeTruthy();
    expect(markRead).toHaveBeenCalledWith("n1");
  });

  it("deletes a class notification after confirming, like the main tray", async () => {
    remove.mockResolvedValue(undefined);
    renderSpace("notificaciones");

    await userEvent.click(screen.getByRole("button", { name: "Eliminar: Solicitud de ingreso aceptada" }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Eliminar notificación" })).getByRole("button", {
        name: "Sí, eliminar",
      }),
    );

    expect(remove).toHaveBeenCalledWith("n1");
  });

  it("says when the class hasn't sent anything yet", () => {
    page = { items: [], total: 0, unread_count: 0, page: 1, page_size: 8 };
    renderSpace("notificaciones");

    expect(screen.getByText("Esta clase todavía no te ha enviado notificaciones")).toBeTruthy();
  });

  it("shows the teacher's profile with who declared it", () => {
    renderSpace("docente");

    expect(screen.getByRole("region", { name: "Perfil de Laura Gómez" })).toBeTruthy();
    expect(screen.getByText("Docente de primaria.")).toBeTruthy();
    expect(screen.getByText("Esta información la escribió el docente en su perfil.")).toBeTruthy();
  });
});
