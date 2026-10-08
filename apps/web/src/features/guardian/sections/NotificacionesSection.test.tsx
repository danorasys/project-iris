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
const removeMany = vi.fn();

vi.mock("@/shared/api/hooks/useNotifications", () => ({
  useBandejaNotificaciones: (page: number, pageSize: number) => trayQuery(page, pageSize),
  useMarcarNotificacionLeida: () => ({ mutateAsync: markRead }),
  useEliminarNotificacion: () => ({ mutateAsync: remove }),
  useEliminarNotificaciones: () => ({ mutateAsync: removeMany, isPending: false }),
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

function renderSection(initialNotification: NotificationItem | null = null) {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<NotificacionesSection initialNotification={initialNotification} />} />
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
  removeMany.mockReset();
});

describe("NotificacionesSection", () => {
  it("lists them newest first like a mail inbox: who, subject, start of the message and when", () => {
    trayReturns(page([accepted, sent]));

    renderSection();

    const rows = within(screen.getByRole("list", { name: "Lista de notificaciones" })).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Carlos Ruiz");
    expect(rows[0].textContent).toContain("Solicitud de ingreso aceptada");
    expect(rows[0].textContent).toContain("Carlos Ruiz aceptó la solicitud de Sofía");
    // A short date, with the full one on hover.
    const time = rows[0].querySelector("time");
    expect(time?.getAttribute("dateTime")).toBe(accepted.created_at);
    expect(time?.getAttribute("title")).toMatch(/2026/);
    expect(rows[1].textContent).toContain("Solicitud de ingreso enviada");
    // The header says how many there are in all and how many are unread.
    expect(screen.getByText("2 notificaciones")).toBeTruthy();
    expect(screen.getByText("1 sin leer")).toBeTruthy();
  });

  it("says which ones are unread, not only with color", () => {
    trayReturns(page([accepted, sent]));

    renderSection();

    expect(
      screen.getByRole("button", { name: /^No leída:\s*Carlos Ruiz\s*Solicitud de ingreso aceptada/ }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Sofía\s*Solicitud de ingreso enviada/ })).toBeTruthy();
  });

  it("opens one to read it in full and marks it as read", async () => {
    trayReturns(page([accepted, sent]));
    markRead.mockResolvedValue({ ...accepted, read: true });
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: /^No leída:\s*Carlos Ruiz\s*Solicitud de ingreso aceptada/ }));

    expect(markRead).toHaveBeenCalledWith("n1");
    const detail = screen.getByRole("article");
    expect(within(detail).getByRole("heading", { name: "Solicitud de ingreso aceptada" })).toBeTruthy();
    expect(detail.textContent).toContain("Desde ahora Sofía ya puede entrar a la clase y ver sus lecciones.");
    expect(detail.textContent).toContain("De parte de Carlos Ruiz");

    await user.click(screen.getByRole("button", { name: "Regresar a notificaciones" }));
    expect(screen.getByRole("list", { name: "Lista de notificaciones" })).toBeTruthy();
  });

  it("opens right on the one clicked in Inicio and marks it as read once", async () => {
    trayReturns(page([accepted, sent]));
    markRead.mockResolvedValue({ ...accepted, read: true });
    const user = userEvent.setup();
    renderSection(accepted);

    const detail = screen.getByRole("article");
    expect(within(detail).getByRole("heading", { name: "Solicitud de ingreso aceptada" })).toBeTruthy();
    await waitFor(() => expect(markRead).toHaveBeenCalledWith("n1"));
    expect(markRead).toHaveBeenCalledTimes(1);

    // Back goes to the whole tray.
    await user.click(screen.getByRole("button", { name: "Regresar a notificaciones" }));
    expect(screen.getByRole("list", { name: "Lista de notificaciones" })).toBeTruthy();
  });

  it("goes to the one after and before from inside one, with the ends turned off", async () => {
    trayReturns(page([accepted, sent]));
    markRead.mockResolvedValue({ ...accepted, read: true });
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: /^No leída:\s*Carlos Ruiz\s*Solicitud de ingreso aceptada/ }));
    expect(screen.getByText("1 de 2")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Notificación anterior" }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole("button", { name: "Notificación siguiente" }));
    expect(screen.getByRole("heading", { level: 1, name: "Solicitud de ingreso enviada" })).toBeTruthy();
    expect(screen.getByText("2 de 2")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Notificación siguiente" }) as HTMLButtonElement).disabled).toBe(true);
    // It was already read, so it isn't marked again.
    expect(markRead).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Notificación anterior" }));
    expect(screen.getByRole("heading", { level: 1, name: "Solicitud de ingreso aceptada" })).toBeTruthy();
  });

  it("past the last one of the page it goes on to the first one of the next page", async () => {
    const firstPage = Array.from({ length: 8 }, (_, i) => ({ ...sent, id: `p1-${i}` }));
    const nextPage = [{ ...accepted, id: "p2-0", classroom_name: "Ciencias" }];
    trayQuery.mockImplementation((p: number) => ({
      data: page(p === 1 ? firstPage : nextPage, { total: 9, page: p }),
      isLoading: false,
      isError: false,
    }));
    markRead.mockResolvedValue({ ...accepted, read: true });
    const user = userEvent.setup();
    renderSection();

    const rows = screen.getAllByRole("button", { name: /^Sofía\s*Solicitud de ingreso enviada/ });
    await user.click(rows[rows.length - 1]);
    expect(screen.getByText("8 de 9")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Notificación siguiente" }));
    expect(await screen.findByText("9 de 9")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Solicitud de ingreso aceptada" })).toBeTruthy();
  });

  it("doesn't mark again one that was already read", async () => {
    trayReturns(page([sent]));
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: /^Sofía\s*Solicitud de ingreso enviada/ }));

    expect(markRead).not.toHaveBeenCalled();
  });

  it("picks several with the boxes and deletes them at once, after confirming", async () => {
    trayReturns(page([accepted, sent]));
    removeMany.mockResolvedValue({ deleted: 2 });
    const user = userEvent.setup();
    renderSection();

    expect(screen.queryByRole("button", { name: "Eliminar" })).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: /^Seleccionar: Solicitud de ingreso aceptada/ }));
    expect(screen.getByText("1 seleccionada")).toBeTruthy();
    await user.click(screen.getByRole("checkbox", { name: /^Seleccionar: Solicitud de ingreso enviada/ }));
    expect(screen.getByText("2 seleccionadas")).toBeTruthy();
    // With every row picked, the box of the bar is checked too.
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Seleccionar todas las notificaciones de esta página",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(removeMany).not.toHaveBeenCalled();
    expect(
      screen.getByText("¿Quieres eliminar las 2 notificaciones seleccionadas? No se puede deshacer."),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Sí, eliminar" }));

    await waitFor(() => expect(removeMany).toHaveBeenCalledWith(["n1", "n2"]));
    expect(await screen.findByText("Se eliminaron 2 notificaciones.")).toBeTruthy();
  });

  it("the box of the bar picks the whole page and unpicks it", async () => {
    trayReturns(page([accepted, sent]));
    const user = userEvent.setup();
    renderSection();
    const all = screen.getByRole("checkbox", { name: "Seleccionar todas las notificaciones de esta página" });

    await user.click(all);
    expect(screen.getByText("2 seleccionadas")).toBeTruthy();
    await user.click(all);
    expect(screen.queryByText(/seleccionada/)).toBeNull();
    expect(screen.getByText("Seleccionar todas")).toBeTruthy();
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

  it("shows which ones are on the page and moves with the numbers and the arrows on top", async () => {
    trayReturns(page([accepted, sent], { total: 26 }));
    const user = userEvent.setup();
    renderSection();

    expect(screen.getByText("1–2 de 26")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Página 1" }).getAttribute("aria-current")).toBe("page");
    expect((screen.getByRole("button", { name: "Página anterior" }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole("button", { name: "Página 3" }));
    expect(trayQuery).toHaveBeenLastCalledWith(3, 8);
    expect(screen.getByRole("button", { name: "Página 3" }).getAttribute("aria-current")).toBe("page");

    await user.click(screen.getByRole("button", { name: "Página siguiente" }));
    expect(trayQuery).toHaveBeenLastCalledWith(4, 8);
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

  it("has no back button on the list, the menu is right there", () => {
    trayReturns(page([accepted]));
    renderSection();

    expect(screen.queryByRole("button", { name: "Regresar" })).toBeNull();
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
