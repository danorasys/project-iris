import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { ApiError } from "@/shared/api/httpClient";
import { PortalAccessProvider } from "./PortalAccessProvider";
import { useWithPortalAccess } from "./portalAccess";

const confirmCode = vi.fn();

vi.mock("@/shared/auth/AuthContext", () => ({
  useAuth: () => ({ discardSession: vi.fn() }),
}));

vi.mock("@/shared/api/hooks/useAuthApi", () => ({
  useConfirmarAccesoPortal: () => ({ mutateAsync: confirmCode, isPending: false }),
}));

const closedPortal = () => new ApiError(403, "acceso_portal_requerido", "no");

/** A button that saves through the portal and shows what happened. */
function SaveButton({ save }: { save: () => Promise<string> }) {
  const withPortalAccess = useWithPortalAccess();
  const [result, setResult] = useState("");
  return (
    <>
      <button
        type="button"
        onClick={() =>
          withPortalAccess(save).then(
            (value) => setResult(value),
            (error: Error) => setResult(`error: ${error.message}`),
          )
        }
      >
        Guardar
      </button>
      <p>{result}</p>
    </>
  );
}

function renderWith(save: () => Promise<string>) {
  return render(
    <MemoryRouter>
      <PortalAccessProvider>
        <SaveButton save={save} />
      </PortalAccessProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  confirmCode.mockReset();
});

describe("PortalAccessProvider", () => {
  it("does not ask for the code while the portal is open", async () => {
    const save = vi.fn().mockResolvedValue("guardado");
    const user = userEvent.setup();
    renderWith(save);

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("guardado")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("asks for the code when the portal closed and repeats the request", async () => {
    const save = vi.fn().mockRejectedValueOnce(closedPortal()).mockResolvedValueOnce("guardado");
    confirmCode.mockResolvedValue({ failed_attempts_before: 0 });
    const user = userEvent.setup();
    renderWith(save);

    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    await user.type(screen.getByLabelText("Dígito 1 de 6"), "123456");

    expect(await screen.findByText("guardado")).toBeTruthy();
    expect(confirmCode).toHaveBeenCalledWith({ code: "123456" });
    expect(save).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("gives the original error back when the guardian cancels", async () => {
    const save = vi.fn().mockRejectedValue(closedPortal());
    const user = userEvent.setup();
    renderWith(save);

    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await user.click(await screen.findByRole("button", { name: "Cancelar" }));

    expect(await screen.findByText("error: no")).toBeTruthy();
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the dialog open with the error when the code is wrong", async () => {
    const save = vi.fn().mockRejectedValue(closedPortal());
    confirmCode.mockRejectedValue(new ApiError(401, "codigo_totp_invalido", "no"));
    const user = userEvent.setup();
    renderWith(save);

    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await user.type(await screen.findByLabelText("Dígito 1 de 6"), "000000");

    expect((await screen.findByRole("alert")).textContent).toContain("no es correcto o ya expiró");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("does not open the dialog for other errors", async () => {
    const save = vi.fn().mockRejectedValue(new ApiError(422, "datos_invalidos", "otro"));
    const user = userEvent.setup();
    renderWith(save);

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("error: otro")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
