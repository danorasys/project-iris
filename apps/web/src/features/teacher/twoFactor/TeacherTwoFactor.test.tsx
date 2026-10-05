import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequireTeacherVerified } from "./RequireTeacherVerified";
import TeacherVerify2faPage from "./TeacherVerify2faPage";

const auth = {
  session: null as { mfaVerified: boolean } | null,
  setSession: vi.fn(),
  closeSession: vi.fn(),
  discardSession: vi.fn(),
};
const status = vi.fn();
const confirm = vi.fn();

vi.mock("@/shared/auth/AuthContext", () => ({
  useAuth: () => auth,
}));

vi.mock("@/shared/api/hooks/useTeacherTwoFactorApi", () => ({
  useEstado2faDocente: () => status(),
  useConfirmarSesionDocente: () => ({ mutateAsync: confirm, isPending: false }),
}));

function renderPanel() {
  return render(
    <MemoryRouter initialEntries={["/teacher/portal"]}>
      <Routes>
        <Route
          path="/teacher/portal"
          element={
            <RequireTeacherVerified>
              <p>Panel docente</p>
            </RequireTeacherVerified>
          }
        />
        <Route path="/teacher/verify-2fa" element={<p>Escribe el código</p>} />
        <Route path="/teacher/setup-2fa" element={<p>Configura el 2FA</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  status.mockReset();
  confirm.mockReset();
  auth.setSession.mockReset();
});

describe("RequireTeacherVerified", () => {
  it("lets in a session that already passed the code", () => {
    auth.session = { mfaVerified: true };

    renderPanel();

    expect(screen.getByText("Panel docente")).toBeTruthy();
  });

  it("asks for the code when the teacher already has 2FA", () => {
    auth.session = { mfaVerified: false };
    status.mockReturnValue({ isPending: false, isError: false, data: { enabled: true } });

    renderPanel();

    expect(screen.getByText("Escribe el código")).toBeTruthy();
  });

  it("sends a teacher who never set it up to do it", () => {
    auth.session = { mfaVerified: false };
    status.mockReturnValue({ isPending: false, isError: false, data: { enabled: false } });

    renderPanel();

    expect(screen.getByText("Configura el 2FA")).toBeTruthy();
  });
});

describe("TeacherVerify2faPage", () => {
  it("with a good code keeps the verified session and goes to the panel", async () => {
    confirm.mockResolvedValue({ access_token: "verificado", token_type: "bearer" });
    const user = userEvent.setup({ delay: null });
    render(
      <MemoryRouter initialEntries={[{ pathname: "/teacher/verify-2fa", state: { desde: "/teacher/profile" } }]}>
        <Routes>
          <Route path="/teacher/verify-2fa" element={<TeacherVerify2faPage />} />
          <Route path="/teacher/profile" element={<p>Mi perfil docente</p>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText(/para entrar a tu panel docente/)).toBeTruthy();
    expect(screen.getByText("Google Authenticator")).toBeTruthy();
    await user.type(screen.getByLabelText(/Dígito 1/), "123456");

    expect(confirm).toHaveBeenCalledWith({ code: "123456" });
    expect(auth.setSession).toHaveBeenCalledWith({ access_token: "verificado", token_type: "bearer" });
    expect(await screen.findByText("Mi perfil docente")).toBeTruthy();
  });
});
