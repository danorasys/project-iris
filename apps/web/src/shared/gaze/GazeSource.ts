import { holdAfterSelection } from "./dwellProgress";
import { EyeGesturesGazeSource } from "./EyeGesturesGazeSource";

export interface GazePosition {
  x: number;
  y: number;
  /** Only `EyeGesturesGazeSource` sets this. Other sources leave it out,
   * treat `undefined` as "not applicable, always trustworthy". */
  calibrated?: boolean;
}

export type GazeSubscriber = (position: GazePosition) => void;

export type GazeEngineState = "idle" | "calibrating" | "ready" | "error";

// How often a still pointer says again where it is (about 30 times a second).
const REPEAT_MS = 33;

/** Source of "gaze" coordinates. Abstracts where the coordinates driving
 * GazeCursor and useDwellSelect actually come from: the real engine
 * (EyeGestures), the mouse (dev, tests, a device without camera) or the
 * landing hero's automated demo. */
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
  /** The engine's own calibration again (EyeGestures' `recalibrate()`). */
  recalibrate?(): void;
  /** Turns the engine off for now ("Continuar sin cámara"), back to idle. */
  stopEngine?(): void;
}

/** Pointer-based source (mouse/touch). Dev mode, tests, and the manual
 * fallback when the camera isn't available. While the pointer stays still
 * it keeps saying where it is, like the eyes do, so a target under a still
 * mouse goes on filling up until it's chosen. */
export class MouseGazeSource implements GazeSource {
  private subscribers = new Set<GazeSubscriber>();
  private last: GazePosition | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private handleMove = (e: PointerEvent): void => {
    this.last = { x: e.clientX, y: e.clientY };
    this.emit(this.last);
  };
  // Out of the window it isn't pointing at anything.
  private handleLeave = (): void => {
    this.last = null;
  };
  // A click chooses too: what comes next under the still mouse waits for it
  // to move, like after choosing with the eyes.
  private handleClick = (e: MouseEvent): void => {
    holdAfterSelection(e.clientX, e.clientY);
  };

  start(): void {
    window.addEventListener("pointermove", this.handleMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", this.handleLeave);
    window.addEventListener("click", this.handleClick, true);
    this.timer = setInterval(() => {
      if (this.last) this.emit(this.last);
    }, REPEAT_MS);
  }

  stop(): void {
    window.removeEventListener("pointermove", this.handleMove);
    document.documentElement.removeEventListener("pointerleave", this.handleLeave);
    window.removeEventListener("click", this.handleClick, true);
    clearInterval(this.timer);
    this.last = null;
  }

  subscribe(cb: GazeSubscriber): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  private emit(position: GazePosition): void {
    for (const cb of this.subscribers) cb(position);
  }
}

/** The kid always moves with the eyes (EyeGestures). While the camera isn't
 * ready (before calibrating, or a device without one) the mouse moves the
 * gaze cursor instead, so it still works without anyone choosing a mode.
 * Once the eyes are ready, they're the ones that count. */
export class EyesFirstGazeSource implements GazeSource {
  private eyes = new EyeGesturesGazeSource();
  private mouse = new MouseGazeSource();
  private subscribers = new Set<GazeSubscriber>();
  private unsubscribe: Array<() => void> = [];

  start(): void {
    this.eyes.start();
    this.mouse.start();
    this.unsubscribe = [
      this.eyes.subscribe((position) => this.emit(position)),
      this.mouse.subscribe((position) => {
        const state = this.eyes.getEngineState();
        if (state !== "ready" && state !== "calibrating") this.emit(position);
      }),
    ];
  }

  stop(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
    this.mouse.stop();
    this.eyes.stop();
  }

  subscribe(cb: GazeSubscriber): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  subscribeEngineState(cb: (state: GazeEngineState) => void): () => void {
    return this.eyes.subscribeEngineState(cb);
  }

  getEngineState(): GazeEngineState {
    return this.eyes.getEngineState();
  }

  activateEngine(): void {
    this.eyes.activateEngine();
  }

  recalibrate(): void {
    this.eyes.recalibrate();
  }

  stopEngine(): void {
    this.eyes.stopEngine();
  }

  private emit(position: GazePosition): void {
    for (const cb of this.subscribers) cb(position);
  }
}

/** The source for the kid's screens: the eyes first (see above).
 * VITE_GAZE_SOURCE=mouse leaves only the mouse, handy in dev. */
export function createGazeSource(): GazeSource {
  const onlyMouse = (import.meta.env.VITE_GAZE_SOURCE as string | undefined) === "mouse";
  return onlyMouse ? new MouseGazeSource() : new EyesFirstGazeSource();
}
