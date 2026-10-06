import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/shared/api/httpClient";
import { AuthProvider } from "./AuthContext";
import { useAuth } from "./useAuth";

const apiFetch = vi.fn();

vi.mock("@/shared/api/httpClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/api/httpClient")>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  configureAuthHandlers: vi.fn(),
}));

// Shaped like a JWT so the app can read the role, but signed by nobody.
function fakeAccessToken(role: string): string {
  return `header.${btoa(JSON.stringify({ sub: "person-1", role, exp: 9999999999 }))}.signature`;
}

function SessionProbe() {
  const { session, loading, closeSession } = useAuth();
  if (loading) return <p>loading</p>;
  return (
    <div>
      <p>{session ? `signed in as ${session.role}` : "signed out"}</p>
      <button type="button" onClick={() => void closeSession()}>
        close
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <AuthProvider>
      <SessionProbe />
    </AuthProvider>,
  );
}

afterEach(() => {
  cleanup();
  apiFetch.mockReset();
});

describe("AuthProvider", () => {
  it("restores the session with the cookie, without sending any token itself", async () => {
    apiFetch.mockResolvedValue({ access_token: fakeAccessToken("guardian"), token_type: "bearer" });

    renderProvider();

    expect(await screen.findByText("signed in as guardian")).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledWith("/identity/auth/refresh", { method: "POST", auth: false });
  });

  it("stays signed out when there is no session to restore", async () => {
    apiFetch.mockRejectedValue(new ApiError(401, "token_invalido", "x"));

    renderProvider();

    expect(await screen.findByText("signed out")).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("tries once more when another tab just used the refresh token", async () => {
    apiFetch
      .mockRejectedValueOnce(new ApiError(401, "token_recien_usado", "x"))
      .mockResolvedValueOnce({ access_token: fakeAccessToken("teacher"), token_type: "bearer" });

    renderProvider();

    expect(await screen.findByText("signed in as teacher", {}, { timeout: 2000 })).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it("asks the server to close the session, since only it can delete the cookie", async () => {
    apiFetch.mockResolvedValueOnce({ access_token: fakeAccessToken("guardian"), token_type: "bearer" });
    apiFetch.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderProvider();
    await screen.findByText("signed in as guardian");

    await user.click(screen.getByRole("button", { name: "close" }));

    await waitFor(() => expect(screen.getByText("signed out")).toBeTruthy());
    expect(apiFetch).toHaveBeenLastCalledWith("/identity/auth/logout", { method: "POST", auth: false });
  });
});
