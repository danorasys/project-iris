import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import * as inputMode from "@/shared/gaze/inputMode";
import SettingsPage from "./SettingsPage";

vi.mock("@/shared/auth/useAuth", () => ({ useAuth: () => ({ session: { subjectId: "kid-1" } }) }));

function renderSettings() {
  render(
    <MemoryRouter initialEntries={["/student/settings"]}>
      <Routes>
        <Route path="/student/settings" element={<SettingsPage />} />
        <Route path="/student/tour" element={<p>Recorrido</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("SettingsPage", () => {
  it("opens the tour again (HU-89)", async () => {
    renderSettings();

    await userEvent.click(screen.getByRole("button", { name: /Ver el recorrido otra vez/ }));

    expect(screen.getByText("Recorrido")).toBeTruthy();
  });

  it("says how the kid moves now and changes it (HU-88)", async () => {
    const switchMode = vi.spyOn(inputMode, "switchInputMode").mockImplementation(() => undefined);
    renderSettings();

    expect(screen.getByText("Ahora con la mirada")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Cómo me muevo/ }));
    // Never more than four things to choose.
    expect(screen.getAllByRole("button")).toHaveLength(4);
    await userEvent.click(screen.getByRole("button", { name: /Con el teclado/ }));

    expect(switchMode).toHaveBeenCalledWith("keyboard", "/student/home");
  });

  it("going back to the gaze asks for a calibration", async () => {
    inputMode.setInputMode("mouse");
    const switchMode = vi.spyOn(inputMode, "switchInputMode").mockImplementation(() => undefined);
    renderSettings();

    await userEvent.click(screen.getByRole("button", { name: /Cómo me muevo/ }));
    await userEvent.click(screen.getByRole("button", { name: /Con la mirada/ }));

    expect(switchMode).toHaveBeenCalledWith("gaze", "/student/calibration");
  });
});
