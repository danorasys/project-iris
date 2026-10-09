import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { NotificationItem } from "@iris/shared-types";
import { MessageThread } from "./MessageThread";
import { isOwnMessage, replySubject } from "./messageThreadRules";

let thread: NotificationItem[] = [];

vi.mock("@/shared/api/hooks/useNotifications", () => ({
  useThread: () => ({ data: thread }),
}));

const base = {
  classroom_id: "c1",
  enrollment_id: "e1",
  student_id: "s1",
  student_name: "Sofía",
  classroom_name: "Ciencias",
  thread_id: "t1",
};

type Message = Extract<NotificationItem, { event: "message.sent" | "teacher.message" }>;

const fromFamily: Message = {
  ...base,
  id: "n1",
  event: "message.sent",
  subject: "Tarea",
  body: "¿Hay tarea?",
  sender_name: "Ana Pérez",
  read: false,
  created_at: "2026-10-08T10:00:00Z",
};
const myAnswer: Message = {
  ...base,
  id: "n2",
  event: "teacher.message",
  subject: "Re: Tarea",
  body: "Sí, la página 3.",
  addressee: "guardian",
  sender_name: null,
  read: true,
  created_at: "2026-10-08T11:00:00Z",
};

function renderThread(onReply = vi.fn().mockResolvedValue(undefined)) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MessageThread role="teacher" message={fromFamily} otherName="Ana Pérez" onReply={onReply} />
    </QueryClientProvider>,
  );
  return onReply;
}

afterEach(() => {
  cleanup();
  thread = [];
});

describe("the rules of a conversation", () => {
  it("knows which messages are one's own copies", () => {
    expect(isOwnMessage("teacher", myAnswer)).toBe(true);
    expect(isOwnMessage("teacher", fromFamily)).toBe(false);
    expect(isOwnMessage("guardian", fromFamily)).toBe(true);
  });

  it("answers with a single Re:", () => {
    expect(replySubject("Tarea")).toBe("Re: Tarea");
    expect(replySubject("Re: Re: Tarea")).toBe("Re: Tarea");
    expect(replySubject(null)).toBe("Re: Mensaje");
  });
});

describe("a conversation (HU-51)", () => {
  it("shows every message in order, the own ones marked as sent", () => {
    thread = [fromFamily, myAnswer];
    renderThread();

    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining("¿Hay tarea?"),
      expect.stringContaining("Sí, la página 3."),
    ]);
    expect(items[1].textContent).toContain("Tú, para Ana Pérez");
    expect(screen.getByText("Conversación · 2 mensajes")).toBeTruthy();
  });

  it("answers in the same thread with Re: and the text", async () => {
    thread = [fromFamily];
    const onReply = renderThread();

    await userEvent.click(screen.getByRole("button", { name: "Responder" }));
    expect(onReply).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText(/Tu respuesta para Ana Pérez/), "Sí, la página 3.");
    await userEvent.click(screen.getByRole("button", { name: "Responder" }));

    expect(onReply).toHaveBeenCalledWith("Re: Tarea", "Sí, la página 3.");
    expect(await screen.findByText(/Queda en esta misma conversación/)).toBeTruthy();
  });
});
