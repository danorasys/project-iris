import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
        <Route path="/login" element={<AdultAuthPage view="login" />} />
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

// Opens the page at a path with the given history state, with the same
// routes as the app, so the links and the old /login/adult can be followed.
function renderAt(pathname: string, state: unknown = null) {
  return render(
    <MemoryRouter initialEntries={[{ pathname, state }]}>
      <Routes>
        <Route path="/login" element={<AdultAuthPage view="login" />} />
        <Route path="/register" element={<AdultAuthPage view="register" />} />
        <Route path="/login/adult/*" element={<OldLoginRedirect />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AdultAuthPage routes", () => {
  it("has its own route for the login and for the sign up", async () => {
    const user = userEvent.setup();
    renderAt("/register");
    expect(screen.getByRole("heading", { name: "Crea tu cuenta" })).toBeTruthy();

    await user.click(screen.getByRole("link", { name: "Inicia sesión" }));
    expect(screen.getByRole("heading", { name: "Iniciar sesión" })).toBeTruthy();

    await user.click(screen.getByRole("link", { name: "Regístrate" }));
    expect(screen.getByRole("heading", { name: "Crea tu cuenta" })).toBeTruthy();
  });

  it("shows the notice another screen leaves, but only if it's a text", () => {
    renderAt("/login", { aviso: "Inicia sesión de nuevo." });
    expect(screen.getByRole("status").textContent).toBe("Inicia sesión de nuevo.");

    cleanup();
    renderAt("/login", { aviso: { text: "no es texto" } });
    expect(screen.getByRole("heading", { name: "Iniciar sesión" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("sends the old /login/adult link to /login keeping its notice", () => {
    renderAt("/login/adult", { aviso: "Inicia sesión de nuevo." });
    expect(screen.getByRole("heading", { name: "Iniciar sesión" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Inicia sesión de nuevo.");
  });
});
