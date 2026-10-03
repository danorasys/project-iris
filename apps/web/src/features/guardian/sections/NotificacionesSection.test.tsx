import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { NotificationItem, NotificationPage } from "@iris/shared-types";
import { ApiError } from "@/shared/api/httpClient";
import { NotificacionesSection } from "./NotificacionesSection";

const trayQuery = vi.fn();
const markRead = vi.fn();
const remove = vi.fn();
const onBack = vi.fn();

vi.mock("@/shared/api/hooks/useNotifications", () => ({
  useBandejaNotificaciones: (page: number, pageSize: number) => trayQuery(page, pageSize),
  useMarcarNotificacionLeida: () => ({ mutateAsync: markRead }),
  useEliminarNotificacion: () => ({ mutateAsync: remove }),
}));

const accepted: NotificationItem = {
  id: "n1",
  event: "request.resolved",
  decision: "aceptada",
  classroom_id: "c1",
  enrollment_id: "e1",
  student_id: "s1",
  student_name: "Sofía",
  classroom_name: "Matemáticas 3A",
  sender_name: "Carlos Ruiz",
  read: false,
  created_at: "2026-10-03T15:42:00Z",
};

const sent: NotificationItem = {
  ...accepted,
  id: "n2",
  event: "request.created",
  sender_name: "Sofía",
  read: true,
  created_at: "2026-10-02T09:10:00Z",
};

function page(items: NotificationItem[], extra: Partial<NotificationPage> = {}): NotificationPage {
  return {
    items,
    total: items.length,
    unread_count: items.filter((n) => !n.read).length,
    page: 1,
    page_size: 8,
    ...extra,
  };
}

function trayReturns(data: NotificationPage) {
  trayQuery.mockReturnValue({ data, isLoading: false, isError: false });
}

function renderSection() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<NotificacionesSection onBack={onBack} />} />
        <Route path="/guardian/verify-2fa" element={<p>Pantalla del código</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  trayQuery.mockReset();
  markRead.mockReset();
  remove.mockReset();
  onBack.mockReset();
});

describe("NotificacionesSection", () => {
  it("lists them newest first, with the kid, the class, who sent it and when", () => {
    trayReturns(page([accepted, sent]));

    renderSection();

    const rows = within(screen.getByRole("list", { name: "Lista de notificaciones" })).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Solicitud de ingreso aceptada");
    expect(rows[0].textContent).toContain("Carlos Ruiz aceptó la solicitud de Sofía");
    expect(rows[0].textContent).toContain("Peque: Sofía");
    expect(rows[0].textContent).toContain("Clase: Matemáticas 3A");
    expect(rows[0].textContent).toContain("De: Carlos Ruiz");
    expect(within(rows[0]).getByText(/2026/)).toBeTruthy();
    expect(rows[1].textContent).toContain("Solicitud de ingreso enviada");
    expect(screen.getByText("1 sin leer")).toBeTruthy();
  });

  it("says which ones are unread, not only with color", () => {
    trayReturns(page([accepted, sent]));

    renderSection();

    expect(screen.getByRole("button", { name: /^No leída:\s*Solicitud de ingreso aceptada/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Solicitud de ingreso enviada/ })).toBeTruthy();
  });

  it("opens one to read it in full and marks it as read", async () => {
    trayReturns(page([accepted, sent]));
    markRead.mockResolvedValue({ ...accepted, read: true });
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: /^No leída:\s*Solicitud de ingreso aceptada/ }));

    expect(markRead).toHaveBeenCalledWith("n1");
    const detail = screen.getByRole("article");
    expect(within(detail).getByRole("heading", { name: "Solicitud de ingreso aceptada" })).toBeTruthy();
    expect(detail.textContent).toContain("Desde ahora Sofía ya puede entrar a la clase y ver sus lecciones.");
    expect(detail.textContent).toContain("De parte deCarlos Ruiz");

    await user.click(screen.getByRole("button", { name: "Regresar a notificaciones" }));
    expect(screen.getByRole("list", { name: "Lista de notificaciones" })).toBeTruthy();
  });

  it("doesn't mark again one that was already read", async () => {
    trayReturns(page([sent]));
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: /^Solicitud de ingreso enviada/ }));

    expect(markRead).not.toHaveBeenCalled();
  });

  it("deletes one with the trash, after confirming", async () => {
    trayReturns(page([accepted, sent]));
    remove.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: "Eliminar: Solicitud de ingreso enviada" }));
    expect(remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Sí, eliminar" }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith("n2"));
    expect(await screen.findByText("La notificación se eliminó.")).toBeTruthy();
  });

  it("keeps it when the deletion is cancelled", async () => {
    trayReturns(page([accepted]));
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: "Eliminar: Solicitud de ingreso aceptada" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(remove).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("moves between pages", async () => {
    trayReturns(page([accepted, sent], { total: 10 }));
    const user = userEvent.setup();
    renderSection();

    expect(screen.getByText("Página 1 de 2")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Anterior/ }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: /Siguiente/ }));

    expect(trayQuery).toHaveBeenLastCalledWith(2, 8);
    expect(screen.getByText("Página 2 de 2")).toBeTruthy();
  });

  it("has no page buttons when everything fits in one", () => {
    trayReturns(page([accepted]));

    renderSection();

    expect(screen.queryByRole("navigation", { name: "Páginas de notificaciones" })).toBeNull();
  });

  it("says when there are none yet", () => {
    trayReturns(page([]));

    renderSection();

    expect(screen.getByText("No tienes notificaciones por ahora")).toBeTruthy();
  });

  it("goes back to the section before", async () => {
    trayReturns(page([accepted]));
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: "Regresar" }));

    expect(onBack).toHaveBeenCalled();
  });

  it("goes to the code screen when the portal access ran out", () => {
    trayQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError(403, "acceso_portal_requerido", "x"),
    });

    renderSection();

    expect(screen.getByText("Pantalla del código")).toBeTruthy();
  });
});
