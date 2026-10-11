import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { NotificationItem } from "@iris/shared-types";
import { MessageThread } from "./MessageThread";
import { initialsOf, isOwnMessage, replySubject, threadSubject } from "./messageThreadRules";

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

  it("names a conversation like its first email and takes the initials", () => {
    expect(threadSubject("Re: Re: Tarea")).toBe("Tarea");
    expect(initialsOf("Laura Gómez")).toBe("LG");
    expect(initialsOf("Sofía")).toBe("S");
  });
});

describe("a conversation (HU-51), read like a mail thread", () => {
  const later: Message = {
    ...fromFamily,
    id: "n3",
    subject: "Re: Tarea",
    body: "Listo, gracias.",
    created_at: "2026-10-08T12:00:00Z",
  };

  it("shows every email oldest first, with who sent it and to whom", () => {
    // Out of order on purpose: it sorts them by date.
    thread = [myAnswer, fromFamily];
    renderThread();

    expect(screen.getByRole("region", { name: "Conversación de 2 correos" })).toBeTruthy();
    const emails = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(emails[0].textContent).toContain("Ana Pérez");
    expect(emails[0].textContent).toContain("para ti");
    expect(emails[0].textContent).toContain("¿Hay tarea?");
    // The teacher's own copy says to whom it went.
    expect(emails[1].textContent).toContain("Tú");
    expect(emails[1].textContent).toContain("para Ana Pérez");
    expect(emails[1].textContent).toContain("Sí, la página 3.");
  });

  it("opens the one being read and the newest, the others show one line and open with a click", async () => {
    thread = [fromFamily, myAnswer, later];
    renderThread();

    const [first, middle, last] = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(within(first).getByRole("button").getAttribute("aria-expanded")).toBe("true");
    expect(within(last).getByRole("button").getAttribute("aria-expanded")).toBe("true");
    const closed = within(middle).getByRole("button");
    expect(closed.getAttribute("aria-expanded")).toBe("false");
    // Closed, only its first words, in its line.
    expect(middle.querySelector("p")).toBeNull();

    await userEvent.click(closed);
    expect(closed.getAttribute("aria-expanded")).toBe("true");
    expect(within(middle).getByText("Sí, la página 3.").tagName).toBe("P");
  });

  it("a single email stays open, with nothing to fold", () => {
    thread = [];
    renderThread();

    expect(screen.getByRole("region", { name: "Correo" })).toBeTruthy();
    expect(screen.getByText("¿Hay tarea?")).toBeTruthy();
    expect(within(screen.getByRole("list")).queryByRole("button")).toBeNull();
  });

  it("answers in the same thread: Responder opens the box, Enviar sends it with Re:", async () => {
    thread = [fromFamily];
    const onReply = renderThread();

    await userEvent.click(screen.getByRole("button", { name: "Responder" }));
    const box = screen.getByRole("form", { name: "Responder a Ana Pérez" });
    expect(document.activeElement).toBe(within(box).getByLabelText(/Tu respuesta para Ana Pérez/));

    await userEvent.click(within(box).getByRole("button", { name: "Enviar" }));
    expect(onReply).not.toHaveBeenCalled();
    await userEvent.type(within(box).getByLabelText(/Tu respuesta para Ana Pérez/), "Sí, la página 3.");
    await userEvent.click(within(box).getByRole("button", { name: "Enviar" }));

    expect(onReply).toHaveBeenCalledWith("Re: Tarea", "Sí, la página 3.");
    expect(await screen.findByText(/Aparecerá en esta conversación/)).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull();
  });

  it("discards an answer without sending it", async () => {
    thread = [fromFamily];
    const onReply = renderThread();

    await userEvent.click(screen.getByRole("button", { name: "Responder" }));
    await userEvent.type(screen.getByLabelText(/Tu respuesta para Ana Pérez/), "Borrador");
    await userEvent.click(screen.getByRole("button", { name: "Descartar" }));

    expect(screen.queryByRole("form")).toBeNull();
    expect(onReply).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Responder" }));
    expect((screen.getByLabelText(/Tu respuesta para Ana Pérez/) as HTMLTextAreaElement).value).toBe("");
  });
});
