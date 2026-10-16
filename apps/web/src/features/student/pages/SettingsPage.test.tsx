import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import SettingsPage from "./SettingsPage";

vi.mock("@/shared/auth/useAuth", () => ({ useAuth: () => ({ session: { subjectId: "kid-1" } }) }));

function renderSettings() {
  render(
    <MemoryRouter initialEntries={["/student/settings"]}>
      <Routes>
        <Route path="/student/settings" element={<SettingsPage />} />
        <Route path="/student/tour" element={<p>Recorrido</p>} />
        <Route path="/student/calibration" element={<p>Calibración</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("SettingsPage", () => {
  it("opens the tour again (HU-89)", async () => {
    renderSettings();

    await userEvent.click(screen.getByRole("button", { name: /Ver el recorrido otra vez/ }));

    expect(screen.getByText("Recorrido")).toBeTruthy();
  });

  it("calibrates the eyes again, and says nothing about other ways to move", async () => {
    renderSettings();

    expect(screen.queryByText(/mouse|teclado|Cómo me muevo/i)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Calibrar mis ojos otra vez/ }));

    expect(screen.getByText("Calibración")).toBeTruthy();
  });
});
