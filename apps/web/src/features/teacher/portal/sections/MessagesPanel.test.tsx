import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ClassroomWithStudents, NotificationItem } from "@iris/shared-types";
import { MessagesPanel } from "./MessagesPanel";

let items: NotificationItem[] = [];
const send = vi.fn();
const markRead = vi.fn();

vi.mock("@/shared/api/hooks/useNotifications", () => ({
  useClassMessages: () => ({ data: { items, total: items.length }, isLoading: false, isError: false }),
  useMarkNotificationRead: () => ({ mutate: markRead }),
}));
vi.mock("@/shared/api/hooks/useClassroomsApi", () => ({
  useSendFamilyMessage: () => ({ mutateAsync: send, isPending: false }),
}));

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
      avatar_id: 1,
      status: "aceptada",
      guardian_name: "Ana Pérez",
      guardian_email: "ana@example.com",
      guardian_phone: "3000000000",
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
  it("shows what families wrote and what the teacher sent, and reads one when opened", async () => {
    items = [
      {
        ...base,
        id: "n1",
        event: "message.sent",
        subject: "Pregunta",
        body: "¿Hay tarea?",
        sender_name: "Ana Pérez",
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
    render(<MessagesPanel classroom={classroom} onToast={onToast} />);

    expect(screen.getByText("De Ana Pérez, familia de Sofía", { exact: false })).toBeTruthy();
    expect(screen.getByText("Para Sofía", { exact: false })).toBeTruthy();
    await userEvent.click(screen.getByText("Pregunta"));

    expect(markRead).toHaveBeenCalledWith("n1");
  });

  it("writes to a kid's family from a window", async () => {
    send.mockResolvedValue(undefined);
    render(<MessagesPanel classroom={classroom} onToast={onToast} />);

    await userEvent.click(screen.getByRole("button", { name: /Escribir un mensaje/ }));
    await userEvent.type(field("family-message-subject"), "Reunión");
    await userEvent.type(field("family-message-body"), "Hablemos el jueves.");
    await userEvent.click(screen.getByRole("button", { name: "Enviar mensaje" }));

    expect(send).toHaveBeenCalledWith({
      classroomId: "c1",
      enrollmentId: "e1",
      recipient: "guardian",
      subject: "Reunión",
      body: "Hablemos el jueves.",
    });
    expect(onToast).toHaveBeenCalledWith("Tu mensaje le llegó a Ana Pérez.");
  });

  it("without kids in the class there's nobody to write to", () => {
    render(<MessagesPanel classroom={{ ...classroom, students: [] }} onToast={onToast} />);

    expect(screen.getByRole("button", { name: /Escribir un mensaje/ })).toHaveProperty("disabled", true);
    expect(screen.getByText(/Cuando haya estudiantes en la clase/)).toBeTruthy();
  });
});
