import { afterEach, describe, expect, it, vi } from "vitest";
import { createGazeSource, KeyboardGazeSource, MouseGazeSource } from "./GazeSource";
import { getInputMode, setInputMode } from "./inputMode";

// The real engine needs a camera and its own scripts, never in a test.
vi.mock("./EyeGesturesGazeSource", () => ({ EyeGesturesGazeSource: class {} }));

afterEach(() => localStorage.clear());

describe("input mode (HU-88)", () => {
  it("is the gaze until the device chooses something else", () => {
    expect(getInputMode()).toBe("gaze");

    setInputMode("keyboard");
    expect(getInputMode()).toBe("keyboard");
  });

  it("reads what an older version saved for the mouse, and cleans it", () => {
    localStorage.setItem("iris_gaze_manual_fallback", "1");
    expect(getInputMode()).toBe("mouse");

    setInputMode("gaze");
    expect(localStorage.getItem("iris_gaze_manual_fallback")).toBeNull();
    expect(getInputMode()).toBe("gaze");
  });

  it("ignores a value it doesn't know", () => {
    localStorage.setItem("iris_modo_entrada", "telepatia");
    expect(getInputMode()).toBe("gaze");
  });

  it("starts the source of the mode", () => {
    setInputMode("mouse");
    expect(createGazeSource()).toBeInstanceOf(MouseGazeSource);

    setInputMode("keyboard");
    const keyboard = createGazeSource();
    expect(keyboard).toBeInstanceOf(KeyboardGazeSource);
    // Nothing points anywhere, so no button fills up by itself.
    const seen = vi.fn();
    keyboard.start();
    keyboard.subscribe(seen);
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 10, clientY: 10 }));
    expect(seen).not.toHaveBeenCalled();
  });
});
