import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { leaveLoginNotice, peekLoginNotice } from "@/shared/ui/loginNotice";
import { OldLoginRedirect } from "@/app/AppRouter";
import AdultAuthPage from "./AdultAuthPage";

vi.mock("@/shared/auth/useAuth", () => ({
  useAuth: () => ({ setSession: vi.fn() }),
}));

vi.mock("@/shared/api/hooks/useAuthApi", () => ({
  useLogin: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function renderLogin() {
  // Arrives with the state the portal's guard leaves ({ desde }), like in the
  // real flow, where that redirect used to wipe the message.
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/login", state: { desde: "/guardian/portal" } }]}>
      <Routes>
        <Route path="/login" element={<AdultAuthPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("AdultAuthPage success notice", () => {
  it("shows the message left before the guard's redirect, only once", () => {
    leaveLoginNotice({ title: "Contraseña actualizada", message: "Usa la nueva para ingresar." });

    renderLogin();

    expect(screen.getByRole("status").textContent).toContain("Contraseña actualizada");
    // Already used: reloading the page doesn't show it again.
    expect(peekLoginNotice()).toBeNull();
  });

  it("shows nothing when there is no message", () => {
    renderLogin();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

// Opens the page at a path with the given history state, plus the old
// /login/adult route so the redirect can be followed.
function renderAt(pathname: string, state: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname, state }]}>
      <Routes>
        <Route path="/login" element={<AdultAuthPage />} />
        <Route path="/login/adult/*" element={<OldLoginRedirect />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AdultAuthPage state from other screens", () => {
  it("opens the sign up view and shows the notice it's given", () => {
    renderAt("/login", { vista: "elegirRegistro" });
    expect(screen.getByRole("heading", { name: "Crea tu cuenta" })).toBeTruthy();

    cleanup();
    renderAt("/login", { aviso: "Inicia sesión de nuevo." });
    expect(screen.getByRole("status").textContent).toBe("Inicia sesión de nuevo.");
  });

  it("ignores a state it doesn't know and just shows the login", () => {
    renderAt("/login", { vista: "otraCosa", aviso: { text: "no es texto" } });
    expect(screen.getByRole("heading", { name: "Iniciar sesión" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("sends the old /login/adult link to /login keeping its state", () => {
    renderAt("/login/adult", { vista: "elegirRegistro" });
    expect(screen.getByRole("heading", { name: "Crea tu cuenta" })).toBeTruthy();
  });
});
