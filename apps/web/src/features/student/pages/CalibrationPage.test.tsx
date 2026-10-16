import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { GazeEngineState, GazeSource } from "@/shared/gaze/GazeSource";
import { GazeSourceProvider } from "@/shared/gaze/GazeSourceContext";
import CalibrationPage from "./CalibrationPage";

vi.mock("@/shared/auth/useAuth", () => ({ useAuth: () => ({ session: { subjectId: "tutor-1", role: "guardian" } }) }));

const activate = vi.fn();
const recalibrate = vi.fn();

// A gaze engine stuck in the state given, like a camera that never answers.
function engine(state: GazeEngineState): GazeSource {
  return {
    start: () => undefined,
    stop: () => undefined,
    subscribe: () => () => undefined,
    subscribeEngineState: () => () => undefined,
    getEngineState: () => state,
    activateEngine: activate,
    recalibrate,
  };
}

function renderCalibration(state: GazeEngineState, url = "/kids/calibration") {
  render(
    <MemoryRouter initialEntries={[url]}>
      <GazeSourceProvider fuente={engine(state)}>
        <Routes>
          <Route path="/kids/calibration" element={<CalibrationPage />} />
          <Route path="/student/calibration" element={<CalibrationPage />} />
          <Route path="/kids/profiles" element={<p>¿Quién eres?</p>} />
        </Routes>
      </GazeSourceProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

describe("CalibrationPage", () => {
  it("starts EyeGestures, whose own calibration goes over this screen", () => {
    renderCalibration("idle");

    expect(activate).toHaveBeenCalled();
    expect(screen.getByText(/mira cada círculo rojo/)).toBeTruthy();
  });

  it("from Ajustes, asks EyeGestures to calibrate again", () => {
    renderCalibration("ready", "/student/calibration");

    expect(recalibrate).toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
  });
});

describe("CalibrationPage without a camera", () => {
  it("when the camera fails, says so and lets them go on to the profiles", async () => {
    renderCalibration("error");

    expect(screen.getByText(/No pudimos activar tu cámara/)).toBeTruthy();
    // Nothing about choosing how to move: the kid always goes with the eyes.
    expect(screen.queryByText(/mouse|teclado/i)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.getByText("¿Quién eres?")).toBeTruthy();
  });

  it("the adult can go on without the camera while it waits", async () => {
    renderCalibration("calibrating");

    await userEvent.click(screen.getByRole("button", { name: /Continuar sin cámara/ }));

    expect(screen.getByText("¿Quién eres?")).toBeTruthy();
  });
});
