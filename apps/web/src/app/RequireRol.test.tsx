import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequireRol } from "./RequireRol";

const auth = vi.hoisted(() => ({ session: null as { role: string } | null }));

vi.mock("@/shared/auth/useAuth", () => ({
  useAuth: () => ({ session: auth.session, loading: false }),
}));

// Tries to open a page of the given role and shows where the guard sent us.
function openAs(role: "guardian" | "teacher" | "student", path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={<RequireRol role={role}><p>Página protegida</p></RequireRol>} />
        <Route path="/login" element={<p>Ingreso</p>} />
        <Route path="/kids" element={<p>Perfiles</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  auth.session = null;
});

describe("RequireRol", () => {
  it("sends an adult without a session to /login", () => {
    openAs("teacher", "/teacher/portal");
    expect(screen.getByText("Ingreso")).toBeTruthy();
  });

  it("sends a kid without a session back to the profile picker", () => {
    openAs("student", "/student/home");
    expect(screen.getByText("Perfiles")).toBeTruthy();
  });

  it("lets in a session with the right role", () => {
    auth.session = { role: "guardian" };
    openAs("guardian", "/guardian/portal");
    expect(screen.getByText("Página protegida")).toBeTruthy();
  });
});
