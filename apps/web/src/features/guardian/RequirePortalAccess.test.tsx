import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ApiError } from "@/shared/api/httpClient";
import { RequirePortalAccess } from "./RequirePortalAccess";

type AccessState = { isPending: boolean; isError: boolean; error: unknown };
let state: AccessState;

vi.mock("@/shared/api/hooks/useAuthApi", () => ({ useAccesoPortal: () => state }));
vi.mock("@/shared/ui/LoadingScreen", () => ({ LoadingScreen: () => <p>Cargando</p> }));

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={["/guardian/portal"]}>
      <Routes>
        <Route
          path="/guardian/portal"
          element={
            <RequirePortalAccess>
              <p>Portal de padres</p>
            </RequirePortalAccess>
          }
        />
        <Route path="/guardian/verify-2fa" element={<p>Pantalla del código</p>} />
        <Route path="/login/guardian/portal" element={<p>Selector de portal</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("RequirePortalAccess", () => {
  it("shows the portal when the server opened it", () => {
    state = { isPending: false, isError: false, error: null };
    renderGuard();
    expect(screen.getByText("Portal de padres")).toBeTruthy();
  });

  it("waits while the server is being asked", () => {
    state = { isPending: true, isError: false, error: null };
    renderGuard();
    expect(screen.getByText("Cargando")).toBeTruthy();
    expect(screen.queryByText("Portal de padres")).toBeNull();
  });

  it("sends the guardian to type the code when the portal is closed", () => {
    state = { isPending: false, isError: true, error: new ApiError(403, "acceso_portal_requerido", "no") };
    renderGuard();
    expect(screen.getByText("Pantalla del código")).toBeTruthy();
    expect(screen.queryByText("Portal de padres")).toBeNull();
  });

  it("goes back to the portal choice on any other error", () => {
    state = { isPending: false, isError: true, error: new ApiError(500, "error", "boom") };
    renderGuard();
    expect(screen.getByText("Selector de portal")).toBeTruthy();
  });
});
