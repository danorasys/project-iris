import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { leaveLoginNotice, peekLoginNotice } from "@/shared/ui/loginNotice";
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
    <MemoryRouter initialEntries={[{ pathname: "/login/adult", state: { desde: "/guardian/portal" } }]}>
      <Routes>
        <Route path="/login/adult/*" element={<AdultAuthPage />} />
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
