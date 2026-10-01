import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SuccessNotice } from "./SuccessNotice";

afterEach(cleanup);

describe("SuccessNotice", () => {
  it("is announced and closes with its X", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<SuccessNotice title="Contraseña actualizada" message="Usa la nueva para ingresar." onClose={onClose} />);

    const notice = screen.getByRole("status");
    expect(notice.textContent).toContain("Contraseña actualizada");
    expect(notice.textContent).toContain("Usa la nueva para ingresar.");

    await user.click(screen.getByRole("button", { name: "Cerrar mensaje" }));
    // First it plays the animation of going up, and closes when it ends.
    expect(onClose).not.toHaveBeenCalled();
    expect(notice.className).toMatch(/leaving/);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });
});
