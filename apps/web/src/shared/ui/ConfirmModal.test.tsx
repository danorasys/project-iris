import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmModal } from "./ConfirmModal";

afterEach(cleanup);

describe("ConfirmModal (the kid's)", () => {
  it("takes the focus and leaves the page behind out of reach (HU-88)", () => {
    const { container } = render(
      <>
        <button type="button">Detrás</button>
        <ConfirmModal message="¿Confirmas?" acceptLabel="Sí" cancelLabel="No" onAccept={vi.fn()} onCancel={vi.fn()} />
      </>,
    );

    expect(screen.getByRole("dialog", { name: "¿Confirmas?" })).toBeTruthy();
    expect(document.activeElement?.textContent).toBe("Sí");
    expect(container.inert).toBe(true);
  });

  it("Esc cancels", async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmModal message="¿Confirmas?" acceptLabel="Sí" cancelLabel="No" onAccept={vi.fn()} onCancel={onCancel} />,
    );

    await userEvent.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalledOnce();
  });
});
