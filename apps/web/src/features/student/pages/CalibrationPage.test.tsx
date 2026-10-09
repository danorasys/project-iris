import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { GazeEngineState, GazeSource } from "@/shared/gaze/GazeSource";
import { GazeSourceProvider } from "@/shared/gaze/GazeSourceContext";
import * as inputMode from "@/shared/gaze/inputMode";
import CalibrationPage from "./CalibrationPage";

vi.mock("@/shared/auth/useAuth", () => ({ useAuth: () => ({ session: { subjectId: "kid-1" } }) }));

// A gaze engine stuck in the state given, like a camera that never answers.
function engine(state: GazeEngineState): GazeSource {
  return {
    start: () => undefined,
    stop: () => undefined,
    subscribe: () => () => undefined,
    subscribeEngineState: () => () => undefined,
    getEngineState: () => state,
    activateEngine: () => undefined,
  };
}

function renderCalibration(state: GazeEngineState) {
  render(
    <MemoryRouter initialEntries={["/student/calibration"]}>
      <GazeSourceProvider fuente={engine(state)}>
        <Routes>
          <Route path="/student/calibration" element={<CalibrationPage />} />
          <Route path="/student/tour" element={<p>Recorrido</p>} />
        </Routes>
      </GazeSourceProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("CalibrationPage without a camera (HU-88)", () => {
  it("when the camera fails, offers the mouse and the keyboard", async () => {
    const switchMode = vi.spyOn(inputMode, "switchInputMode").mockImplementation(() => undefined);
    renderCalibration("error");

    expect(screen.getByText(/No pudimos activar tu cámara/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Usar el teclado/ }));

    // The first time, the tour comes next.
    expect(switchMode).toHaveBeenCalledWith("keyboard", "/student/tour");
  });

  it("the adult can say there's no camera while it waits", async () => {
    const switchMode = vi.spyOn(inputMode, "switchInputMode").mockImplementation(() => undefined);
    renderCalibration("calibrating");

    await userEvent.click(screen.getByRole("button", { name: /No tienes cámara/ }));
    await userEvent.click(screen.getByRole("button", { name: /Usar el mouse/ }));

    expect(switchMode).toHaveBeenCalledWith("mouse", "/student/tour");
  });

  it("with the keyboard there's nothing to calibrate", () => {
    inputMode.setInputMode("keyboard");
    renderCalibration("calibrating");

    expect(screen.getByText("Recorrido")).toBeTruthy();
  });
});
