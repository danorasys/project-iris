import { EyeGesturesGazeSource } from "./EyeGesturesGazeSource";
import { getInputMode } from "./inputMode";

export interface GazePosition {
  x: number;
  y: number;
  /** Only `EyeGesturesGazeSource` sets this. Other sources leave it out,
   * treat `undefined` as "not applicable, always trustworthy". */
  calibrated?: boolean;
}

export type GazeSubscriber = (position: GazePosition) => void;

export type GazeEngineState = "idle" | "calibrating" | "ready" | "error";

/** Source of "gaze" coordinates. Abstracts where the coordinates driving
 * GazeCursor and useDwellSelect actually come from, so we can switch between
 * the real engine (EyeGestures) and a mouse mode (dev, tests, and the
 * landing hero's automated demo). */
export interface GazeSource {
  /** Called automatically when `GazeSourceProvider` mounts, once per
   * /student/* session. Mouse/Scripted start listening right away, cheap
   * and harmless. `EyeGesturesGazeSource` deliberately does NOT start the
   * real engine here. Its calibration UI takes over the whole screen as
   * soon as it starts, so doing it here would show it during the tour,
   * before the student even reaches calibration. See `activateEngine()`. */
  start(): void;
  stop(): void;
  subscribe(cb: GazeSubscriber): () => void;
  /** Only implemented by sources with a real calibration process
   * (`EyeGesturesGazeSource`). Consumers should treat its absence as
   * "nothing to calibrate, already ready". */
  subscribeEngineState?(cb: (state: GazeEngineState) => void): () => void;
  /** Current state without waiting for the next change, so a screen that
   * mounts after the engine already calibrated doesn't sit around waiting
   * for something that already happened. */
  getEngineState?(): GazeEngineState;
  /** Actually starts the real engine (loads dependencies, `new
   * EyeGestures(...)`, `.start()`). Called explicitly by `CalibrationPage`
   * on mount, never by `start()`. Idempotent, does nothing if already
   * active or ready. */
  activateEngine?(): void;
}

/** Pointer-based source (mouse/touch). Dev mode, tests, and the manual
 * fallback when the camera isn't available. */
export class MouseGazeSource implements GazeSource {
  private subscribers = new Set<GazeSubscriber>();
  private handleMove = (e: PointerEvent): void => {
    this.emit({ x: e.clientX, y: e.clientY });
  };

  start(): void {
    window.addEventListener("pointermove", this.handleMove, { passive: true });
  }

  stop(): void {
    window.removeEventListener("pointermove", this.handleMove);
  }

  subscribe(cb: GazeSubscriber): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  private emit(position: GazePosition): void {
    for (const cb of this.subscribers) cb(position);
  }
}

/** Keyboard mode (HU-88): nothing points anywhere, so no button fills up by
 * itself. The kid moves with Tab and chooses with Enter, like any button. */
export class KeyboardGazeSource implements GazeSource {
  start(): void {}
  stop(): void {}
  subscribe(): () => void {
    return () => undefined;
  }
}

/** The source for /student/*, from how the kid moves on this device (see
 * inputMode.ts). VITE_GAZE_SOURCE=mouse forces the mouse, handy in dev. */
export function createGazeSource(): GazeSource {
  const forceMouse = (import.meta.env.VITE_GAZE_SOURCE as string | undefined) === "mouse";
  const mode = forceMouse ? "mouse" : getInputMode();
  if (mode === "mouse") return new MouseGazeSource();
  if (mode === "keyboard") return new KeyboardGazeSource();
  return new EyeGesturesGazeSource();
}
