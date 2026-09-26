import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ApiError } from "@/shared/api/httpClient";
import GuardianVerify2faPage from "./GuardianVerify2faPage";

const mutateAsync = vi.fn();
const discardSession = vi.fn();

vi.mock("@/shared/auth/AuthContext", () => ({
  useAuth: () => ({ discardSession }),
}));

vi.mock("@/shared/api/hooks/useAuthApi", () => ({
  useConfirmarAccesoPortal: () => ({ mutateAsync, isPending: false }),
}));

function LoginStub() {
  const notice = (useLocation().state as { aviso?: string } | null)?.aviso;
  return <p>Login: {notice}</p>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/guardian/verify-2fa"]}>
      <Routes>
        <Route path="/guardian/verify-2fa" element={<GuardianVerify2faPage />} />
        <Route path="/guardian/portal" element={<p>Portal de padres</p>} />
        <Route path="/login/adult" element={<LoginStub />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  mutateAsync.mockReset();
  discardSession.mockReset();
});

describe("GuardianVerify2faPage", () => {
  it("sends the code and opens the portal when it is correct", async () => {
    mutateAsync.mockResolvedValue({ failed_attempts_before: 0 });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Dígito 1 de 6"), "123456");

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ code: "123456" }));
    expect(await screen.findByText("Portal de padres")).toBeTruthy();
  });

  it("shows the error and clears the boxes when the code is rejected", async () => {
    mutateAsync.mockRejectedValue(new ApiError(401, "codigo_totp_invalido", "no"));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Dígito 1 de 6"), "000000");

    expect((await screen.findByRole("alert")).textContent).toContain("no es correcto o ya expiró");
    expect((screen.getByLabelText("Dígito 1 de 6") as HTMLInputElement).value).toBe("");
    expect(screen.queryByText("Portal de padres")).toBeNull();
  });

  it("drops the local session and goes to the login when the server closed it for security", async () => {
    mutateAsync.mockRejectedValue(new ApiError(401, "sesion_cerrada_por_seguridad", "no"));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Dígito 1 de 6"), "000000");

    expect(await screen.findByText(/Cerramos tu sesión por seguridad/)).toBeTruthy();
    expect(discardSession).toHaveBeenCalledTimes(1);
  });

  it("shows the wait time and blocks the boxes when there were too many attempts", async () => {
    mutateAsync.mockRejectedValue(new ApiError(429, "limite_intentos_excedido", "no", { retry_after_seconds: 272 }));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Dígito 1 de 6"), "000000");

    expect((await screen.findByRole("timer")).textContent).toContain("4:32");
    expect((screen.getByLabelText("Dígito 1 de 6") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Continuar" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not send anything until the six digits are typed", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Dígito 1 de 6"), "123");

    expect(mutateAsync).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Continuar" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
