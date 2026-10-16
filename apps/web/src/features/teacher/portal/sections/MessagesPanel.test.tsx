import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ClassroomWithStudents, NotificationItem } from "@iris/shared-types";
import { MessagesPanel } from "./MessagesPanel";

let items: NotificationItem[] = [];
const send = vi.fn();
const markRead = vi.fn();

vi.mock("@/shared/api/hooks/useNotifications", () => ({
  useClassMessages: () => ({
    data: { items, total: items.length, unread_count: items.filter((n) => !n.read).length, page: 1, page_size: 8 },
    isLoading: false,
    isError: false,
  }),
  useMarkNotificationRead: () => ({ mutateAsync: markRead }),
  useDeleteNotification: () => ({ mutateAsync: vi.fn() }),
  useDeleteNotifications: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useThread: () => ({ data: items.slice(0, 1) }),
}));
vi.mock("@/shared/api/hooks/useClassroomsApi", () => ({
  useSendFamilyMessage: () => ({ mutateAsync: send, isPending: false }),
}));

function renderPanel(room: ClassroomWithStudents = classroom, composeFor: string | null = null) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MessagesPanel classroom={room} onToast={onToast} composeFor={composeFor} />
    </QueryClientProvider>,
  );
}

const base = {
  classroom_id: "c1",
  enrollment_id: "e1",
  student_id: "s1",
  student_name: "Sofía",
  classroom_name: "Ciencias 1A",
  created_at: "2026-10-08T15:42:00Z",
};

const classroom = {
  id: "c1",
  name: "Ciencias 1A",
  students: [
    {
      enrollment_id: "e1",
      student_id: "s1",
      first_name: "Sofía",
      last_name: "Pérez",
      avatar_id: 1,
      status: "aceptada",
      guardian_name: "Ana Pérez",
      guardian_email: "ana@example.com",
      guardian_relationship: "Madre",
    },
  ],
} as unknown as ClassroomWithStudents;

const onToast = vi.fn();
const field = (id: string) => document.getElementById(id) as HTMLElement;

afterEach(() => {
  cleanup();
  items = [];
  vi.clearAllMocks();
});

describe("the messages of a class (HU-77)", () => {
  it("lists the messages like the inbox and opens one as a mail, marking it read", async () => {
    items = [
      {
        ...base,
        id: "n1",
        event: "message.sent",
        subject: "Pregunta",
        body: "¿Hay tarea?",
        sender_name: "Ana Pérez",
        thread_id: "t1",
        read: false,
      },
      {
        ...base,
        id: "n2",
        event: "teacher.message",
        subject: "Tarea",
        body: "Repasen.",
        sender_name: null,
        addressee: "student",
        read: true,
      },
    ];
    markRead.mockResolvedValue(undefined);
    renderPanel();

    expect(screen.getByText(/2 mensajes/)).toBeTruthy();
    expect(screen.getByText(/1 sin leer/)).toBeTruthy();
    expect(screen.getByText("Seleccionar todos")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^No leída:\s*Ana Pérez.*Pregunta/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Tú.*Tarea/ })).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: /^No leída:\s*Ana Pérez.*Pregunta/ }));

    expect(markRead).toHaveBeenCalledWith("n1");
    expect(screen.getByRole("button", { name: /Regresar a mensajes/ })).toBeTruthy();
    expect(screen.getByText("¿Hay tarea?")).toBeTruthy();
  });

  it("writes a new message in place, like a new mail, and goes back to the list", async () => {
    send.mockResolvedValue(undefined);
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: /Escribir un mensaje/ }));
    expect(screen.getByRole("heading", { name: "Mensaje nuevo" })).toBeTruthy();

    // Without anyone picked it says what's missing and sends nothing.
    await userEvent.click(screen.getByRole("button", { name: /Enviar/ }));
    expect(screen.getByText("Elige a quién le escribes.")).toBeTruthy();
    expect(send).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("combobox", { name: "Para" }));
    await userEvent.click(screen.getByRole("option", { name: "Ana Pérez (Madre) · familia de Sofía Pérez" }));
    await userEvent.type(field("compose-subject"), "Reunión");
    await userEvent.type(field("compose-body"), "Hablemos el jueves.");
    await userEvent.click(screen.getByRole("button", { name: /Enviar/ }));

    expect(send).toHaveBeenCalledWith({
      classroomId: "c1",
      enrollmentId: "e1",
      recipient: "guardian",
      subject: "Reunión",
      body: "Hablemos el jueves.",
    });
    expect(onToast).toHaveBeenCalledWith("Tu mensaje le llegó a Ana Pérez.");
    expect(await screen.findByRole("button", { name: /Escribir un mensaje/ })).toBeTruthy();
  });

  it("opens addressed to a kid's family when it comes from Miembros", () => {
    renderPanel(classroom, "e1");

    expect(screen.getByRole("combobox", { name: "Para" }).textContent).toContain("Ana Pérez (Madre) · familia de Sofía Pérez");
  });

  it("asks before throwing away what was written", async () => {
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: /Escribir un mensaje/ }));
    await userEvent.type(field("compose-body"), "Hola");
    await userEvent.click(screen.getByRole("button", { name: "Descartar el mensaje" }));
    expect(screen.getByText(/Lo que escribiste se va a perder/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Seguir escribiendo" }));
    expect((field("compose-body") as HTMLTextAreaElement).value).toBe("Hola");

    await userEvent.click(screen.getByRole("button", { name: /Regresar a mensajes/ }));
    await userEvent.click(screen.getByRole("button", { name: "Sí, descartar" }));
    expect(await screen.findByRole("button", { name: /Escribir un mensaje/ })).toBeTruthy();
  });

  it("without kids in the class there's nobody to write to", () => {
    renderPanel({ ...classroom, students: [] });

    expect(screen.getByRole("button", { name: /Escribir un mensaje/ })).toHaveProperty("disabled", true);
    expect(screen.getByText(/Cuando haya estudiantes en la clase/)).toBeTruthy();
  });
});
