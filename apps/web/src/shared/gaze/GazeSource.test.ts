import { describe, expect, it, vi } from "vitest";
import { createGazeSource, EyesFirstGazeSource, type GazeEngineState } from "./GazeSource";

// The real engine needs a camera and its own scripts, never in a test.
let engineState: GazeEngineState = "idle";
vi.mock("./EyeGesturesGazeSource", () => ({
  EyeGesturesGazeSource: class {
    start() {}
    stop() {}
    subscribe() {
      return () => undefined;
    }
    subscribeEngineState() {
      return () => undefined;
    }
    getEngineState() {
      return engineState;
    }
    activateEngine() {}
  },
}));

describe("the kid's gaze source", () => {
  it("is always the eyes, with the mouse moving the cursor while they aren't ready", () => {
    const source = createGazeSource();
    expect(source).toBeInstanceOf(EyesFirstGazeSource);

    const seen = vi.fn();
    source.start();
    source.subscribe(seen);
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 10, clientY: 20 }));
    expect(seen).toHaveBeenCalledWith({ x: 10, y: 20 });

    // Once the eyes are ready, the mouse doesn't move it anymore.
    seen.mockClear();
    engineState = "ready";
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 30, clientY: 40 }));
    expect(seen).not.toHaveBeenCalled();
    source.stop();
  });
});
