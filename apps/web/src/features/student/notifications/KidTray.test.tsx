import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NotificationItem, NotificationPage } from "@iris/shared-types";
import { KidTray } from "./KidTray";

const markRead = vi.fn();
const remove = vi.fn();

vi.mock("@/shared/api/hooks/useNotifications", () => ({
  useMarkNotificationRead: () => ({ mutate: markRead }),
  useDeleteNotification: () => ({ mutateAsync: remove, isPending: false }),
}));

const base = {
  classroom_id: "c1",
  enrollment_id: "e1",
  student_id: "s1",
  student_name: "Sofía",
  classroom_name: "Ciencias naturales",
  sender_name: "Laura Gómez",
  created_at: "2026-10-08T15:42:00Z",
};

function message(id: string, subject: string, body: string, read = false): NotificationItem {
  return { ...base, id, event: "teacher.message", subject, body, addressee: "student", read };
}

const lesson: NotificationItem = {
  ...base,
  id: "n2",
  event: "lesson.published",
  lesson_id: "l1",
  lesson_title: "Animales acuáticos",
  extra_title: null,
  read: true,
};

function page(items: NotificationItem[], total = items.length): NotificationPage {
  return { items, total, unread_count: items.filter((n) => !n.read).length, page: 1, page_size: 3 };
}

const onBack = vi.fn();
const onScreen = vi.fn();

function renderTray(data: NotificationPage, screenIndex = 0) {
  render(
    <KidTray
      tray={{ data, isLoading: false, isError: false }}
      screen={screenIndex}
      onScreen={onScreen}
      title="Mis notificaciones"
      backLabel="Volver al inicio"
      onBack={onBack}
    />,
  );
}

afterEach(() => {
  cleanup();
  for (const mock of [markRead, remove, onBack, onScreen]) mock.mockReset();
});

describe("the kid's tray (HU-54)", () => {
  it("shows each one with its subject, class and first words, the new ones marked", () => {
    renderTray(page([message("n1", "¡Muy bien!", "Te fue muy bien."), lesson]));

    expect(screen.getByText("Tienes 1 notificación nueva. Mírala para leerla.")).toBeTruthy();
    expect(screen.getByText("¡Muy bien!")).toBeTruthy();
    expect(screen.getByText("¡Hay una lección nueva!")).toBeTruthy();
    expect(screen.getAllByText("Ciencias naturales")).toHaveLength(2);
    expect(screen.getAllByText("Nueva")).toHaveLength(1);
  });

  it("goes through the screens with the big arrows when there are more", async () => {
    renderTray(page([message("n1", "a", "a"), message("n3", "b", "b"), message("n4", "c", "c")], 7));

    expect(screen.getByText("Notificaciones 1 a 3 de 7")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Ver notificaciones siguientes" }));

    expect(onScreen).toHaveBeenCalledWith(1);
  });

  it("without any says so, with the way back", async () => {
    renderTray(page([]));

    expect(screen.getByText(/No tienes notificaciones por ahora/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Volver al inicio/ }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});

describe("reading one (HU-55) and deleting it (HU-56)", () => {
  it("opens it whole, marks it as read and reads a long one in parts", async () => {
    const long = Array.from({ length: 90 }, (_, i) => `palabra${i}`).join(" ");
    renderTray(page([message("n1", "Tarea", long)]));

    await userEvent.click(screen.getByRole("button", { name: /Tarea/ }));

    expect(markRead).toHaveBeenCalledWith("n1");
    expect(screen.getByRole("heading", { name: "Tarea" })).toBeTruthy();
    expect(screen.getByText(/De Laura Gómez · Ciencias naturales/)).toBeTruthy();
    expect(screen.getByText(/^Parte 1 de \d$/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Parte siguiente del mensaje" }));
    expect(screen.getByText(/^Parte 2 de \d$/)).toBeTruthy();
  });

  it("an already read one isn't marked again", async () => {
    renderTray(page([lesson]));

    await userEvent.click(screen.getByRole("button", { name: /Hay una lección nueva/ }));

    expect(markRead).not.toHaveBeenCalled();
  });

  it("asks before deleting: cancel leaves it, confirm deletes it", async () => {
    remove.mockResolvedValue(undefined);
    renderTray(page([message("n1", "Tarea", "Repasa la lección.")]));
    await userEvent.click(screen.getByRole("button", { name: /Tarea/ }));

    await userEvent.click(screen.getByRole("button", { name: /Eliminar/ }));
    expect(screen.getByRole("dialog", { name: /Seguro que quieres eliminar/ })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "No, dejarla" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(remove).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /Eliminar/ }));
    await userEvent.click(screen.getByRole("button", { name: "Sí, eliminarla" }));

    expect(remove).toHaveBeenCalledWith("n1");
    // Back to the list.
    expect(screen.getByRole("heading", { name: "Mis notificaciones" })).toBeTruthy();
  });
});
