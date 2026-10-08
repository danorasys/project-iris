import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "./ConfirmDialog";

afterEach(cleanup);

describe("ConfirmDialog", () => {
  it("starts on the safe choice and Escape cancels", async () => {
    const onCancel = vi.fn();
    const onAccept = vi.fn();
    const user = userEvent.setup({ delay: null });
    render(
      <ConfirmDialog
        message="¿Seguro?"
        acceptLabel="Sí"
        cancelLabel="Cancelar"
        onAccept={onAccept}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole("dialog", { name: "¿Seguro?" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancelar" }));
    await user.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("is named by its title and described by its message, with a warning sign when it's risky", () => {
    render(
      <ConfirmDialog
        title="Cambios sin guardar"
        message="Se perderán si continúas."
        acceptLabel="Continuar sin guardar"
        cancelLabel="Cancelar"
        danger
        onAccept={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Cambios sin guardar" });
    expect(dialog.getAttribute("aria-describedby")).toBe(screen.getByText("Se perderán si continúas.").id);
    expect(screen.getByRole("heading", { level: 2, name: "Cambios sin guardar" })).toBeTruthy();
  });
});
