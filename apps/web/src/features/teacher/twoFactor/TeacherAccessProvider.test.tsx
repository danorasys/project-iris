import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { apiFetch } from "@/shared/api/httpClient";
import { TeacherAccessProvider } from "./TeacherAccessProvider";

const confirmCode = vi.fn();
const setSession = vi.fn();

vi.mock("@/shared/auth/useAuth", () => ({
  useAuth: () => ({ setSession, discardSession: vi.fn() }),
}));

vi.mock("@/shared/api/hooks/useTeacherTwoFactorApi", () => ({
  useConfirmarSesionDocente: () => ({ mutateAsync: confirmCode, isPending: false }),
}));

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const closedPanel = () =>
  json(403, { error: { code: "verificacion_2fa_requerida", message: "Confirma tu identidad." } });

/** A button that loads something through the API and shows the answer. */
function LoadButton() {
  const [result, setResult] = useState("");
  return (
    <>
      <button
        type="button"
        onClick={() =>
          apiFetch<{ name: string }>("/classrooms/1").then(
            (data) => setResult(data.name),
            (error: Error) => setResult(`error: ${error.message}`),
          )
        }
      >
        Cargar
      </button>
      <p>{result}</p>
    </>
  );
}

function renderPanel() {
  return render(
    <MemoryRouter initialEntries={["/teacher/portal"]}>
      <Routes>
        <Route
          path="/teacher/portal"
          element={
            <TeacherAccessProvider>
              <LoadButton />
            </TeacherAccessProvider>
          }
        />
        <Route path="/teacher/verify-2fa" element={<p>Pantalla del código</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  confirmCode.mockReset();
  setSession.mockReset();
});

describe("TeacherAccessProvider", () => {
  it("asks for the code when the panel closed, and then makes the request again", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(closedPanel()).mockResolvedValueOnce(json(200, { name: "MB" }));
    vi.stubGlobal("fetch", fetchMock);
    confirmCode.mockResolvedValue({ access_token: "nuevo", token_type: "bearer" });
    const user = userEvent.setup({ delay: null });
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Cargar" }));
    expect(await screen.findByText(/Pasó un tiempo sin actividad en tu panel docente/)).toBeTruthy();
    await user.keyboard("123456");

    // The code, the new session and the retry take a few steps: on a busy
    // machine (CI) they can need more than the default second.
    expect(await screen.findByText("MB", undefined, { timeout: 5000 })).toBeTruthy();
    expect(confirmCode).toHaveBeenCalledWith({ code: "123456" });
    expect(setSession).toHaveBeenCalledWith({ access_token: "nuevo", token_type: "bearer" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("cancelling goes to the full code screen", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(closedPanel())));
    const user = userEvent.setup({ delay: null });
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Cargar" }));
    await screen.findByText(/Pasó un tiempo sin actividad/);
    await user.keyboard("{Escape}");

    expect(await screen.findByText("Pantalla del código")).toBeTruthy();
  });

  it("the requests the page makes by itself say so", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json(200, {})));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/classrooms", { background: true });
    await apiFetch("/classrooms/1");

    const headers = (call: number) => new Headers((fetchMock.mock.calls[call][1] as RequestInit).headers);
    expect(headers(0).get("X-Iris-Activity")).toBe("background");
    expect(headers(1).get("X-Iris-Activity")).toBeNull();
  });
});
