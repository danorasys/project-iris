import type { GazeEngineState, GazeSource, GazePosition, GazeSubscriber } from "./GazeSource";

// EyeGestures v4 (web). https://eyegestures.com / github.com/NativeSensors/EyeGestures
//
// These two files are vendored locally, in `apps/web/public/eyegestures/`,
// instead of loaded from eyegestures.com on every visit. This way we
// don't depend on a third-party CDN staying up or serving a different
// version than the one we tested.
//
// How the files find each other, read directly from their source:
// - `eyegestures.js` looks for `EyegesturesEngine.js` next to itself,
//   using `document.currentScript.src`. Since we serve both from the
//   same local folder, this works without extra setup.
// - `EyegesturesEngine.js` (the wasm-bindgen glue) finds
//   `EyegesturesEngine_bg.wasm` the same way, so the 4 files just need
//   to stay together in `apps/web/public/eyegestures/`.
// - `eyegestures.js` still loads its own MediaPipe FaceMesh dependencies
//   from a CDN. We don't need to load those ourselves, its own `init()`
//   already requests them.
const EYEGESTURES_CSS_PATH = "/eyegestures/eyegestures.css";
const EYEGESTURES_JS_PATH = "/eyegestures/eyegestures.js";

// Literally "video". The library's own render loop, the one feeding
// frames to MediaPipe, looks up the video with
// `document.getElementById('video')` no matter what id we pass to the
// constructor (the id we pass IS used elsewhere, to assign the camera).
const ENGINE_VIDEO_ID = "video";
// These two are also hardcoded lookups inside the library, "status" and
// "error", used by its own `updateStatus`/`showError` methods.
const ENGINE_STATUS_ID = "status";
const ENGINE_ERROR_ID = "error";

interface EyeGesturesInstance {
  start(): void;
  stop(): void;
  invisible(): void;
  visible(): void;
  recalibrate(): void;
}

type EyeGesturesClass = new (
  videoId: string,
  onGaze: (point: [number, number], calibrated: boolean) => void
) => EyeGesturesInstance;

declare global {
  interface Window {
    /** `eyegestures.js` declares `class EyeGestures` as a plain classic
     * script. That declaration lives in the global script scope, not as a
     * property of `window`/`globalThis`, so Vite's bundle (an ES module
     * with its own scope) can't see it directly. `__irisEyeGesturesClass`
     * is the name `bridgeGlobalClass()` uses to re-expose it as a real
     * `window` property this file can actually reach. */
    __irisEyeGesturesClass?: EyeGesturesClass | null;
  }
}

function loadScript(src: string): Promise<void> {
  const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existingScript) {
    return existingScript.dataset.cargado === "1" ? Promise.resolve() : waitForLoad(existingScript);
  }
  const script = document.createElement("script");
  script.src = src;
  script.async = false;
  const promise = waitForLoad(script);
  document.head.appendChild(script);
  return promise;
}

function waitForLoad(script: HTMLScriptElement): Promise<void> {
  return new Promise((resolve, reject) => {
    script.addEventListener("load", () => {
      script.dataset.cargado = "1";
      resolve();
    });
    script.addEventListener("error", () => reject(new Error(`Failed to load ${script.src}`)));
  });
}

/** Re-exposes `class EyeGestures` (global from the classic script
 * `eyegestures.js`) as `window.__irisEyeGesturesClass`, since an ES module
 * can't see a classic script's bare identifiers directly. Without this
 * bridge `window.EyeGestures` stays `undefined` even though the script
 * loaded fine, it's a scope issue, not a network failure. */
function bridgeGlobalClass(): void {
  const bridge = document.createElement("script");
  bridge.textContent =
    "window.__irisEyeGesturesClass = typeof EyeGestures !== 'undefined' ? EyeGestures : null;";
  document.head.appendChild(bridge);
  bridge.remove();
}

function insertStyle(href: string): void {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

/** Creates a hidden `tag`/`id` element if it doesn't exist yet. The
 * library's reference HTML includes `<div id="status">` and
 * `<div id="error">` next to the `<video>`, and they're not just
 * decoration. `EyeGestures`'s own constructor writes `textContent` into
 * them directly, skip them and it throws `Cannot set properties of null`
 * before it even gets to requesting the camera. */
function createHiddenElement(id: string, tag: string): HTMLElement {
  let element = document.getElementById(id);
  if (element) return element;
  element = document.createElement(tag);
  element.id = id;
  element.style.display = "none";
  document.body.appendChild(element);
  return element;
}

function createHiddenVideo(): HTMLVideoElement {
  let video = document.getElementById(ENGINE_VIDEO_ID) as HTMLVideoElement | null;
  createHiddenElement(ENGINE_STATUS_ID, "div");
  createHiddenElement(ENGINE_ERROR_ID, "div");
  if (video) return video;
  video = document.createElement("video");
  video.id = ENGINE_VIDEO_ID;
  video.autoplay = true;
  video.muted = true;
  video.setAttribute("playsinline", "true");
  // Same dimensions and hiding technique as the official reference HTML.
  // The library's own calibration UI does math involving this element, so
  // a real size (not an offscreen 1x1px trick) is what actually works.
  video.width = 640;
  video.height = 480;
  video.style.display = "none";
  document.body.appendChild(video);
  return video;
}

/** Gaze source backed by the real EyeGestures v4 engine. Loads it,
 * forwards its points as `GazePosition`, and on first calibration calls
 * `.invisible()` plus manually hides `#calib_cursor`, since the library
 * leaves that circle visible after calibrating by design. */
export class EyeGesturesGazeSource implements GazeSource {
  private subscribers = new Set<GazeSubscriber>();
  private stateSubscribers = new Set<(state: GazeEngineState) => void>();
  private dependenciesLoad: Promise<void> | null = null;
  private instance: EyeGesturesInstance | null = null;
  private alreadyCalibrated = false;
  private state: GazeEngineState = "idle";

  getEngineState(): GazeEngineState {
    return this.state;
  }

  start(): void {
    // Deliberately a no-op, see the `start()` comment on the `GazeSource`
    // interface. Starting the real engine here would show its full-screen
    // calibration UI during the tour, before the student even reaches
    // `/student/calibration`.
  }

  /** The real startup. Called by `CalibrationPage` when it mounts. */
  activateEngine(): void {
    if (this.state === "calibrating" || this.state === "ready") return; // already in progress or already ready
    this.notifyState("calibrating");

    this.loadDependencies()
      .then(() => this.startEngine())
      .catch((error: unknown) => {
        console.error("Failed to load the EyeGestures engine:", error);
        this.notifyState("error");
      });
  }

  stop(): void {
    this.subscribers.clear();
    this.stateSubscribers.clear();
    this.instance?.stop();
  }

  subscribe(cb: GazeSubscriber): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  subscribeEngineState(cb: (state: GazeEngineState) => void): () => void {
    this.stateSubscribers.add(cb);
    return () => this.stateSubscribers.delete(cb);
  }

  private loadDependencies(): Promise<void> {
    if (!this.dependenciesLoad) {
      insertStyle(EYEGESTURES_CSS_PATH);
      this.dependenciesLoad = loadScript(EYEGESTURES_JS_PATH).then(() => bridgeGlobalClass());
    }
    return this.dependenciesLoad;
  }

  private startEngine(): void {
    createHiddenVideo();
    const EngineClass = window.__irisEyeGesturesClass;
    if (!EngineClass) {
      console.error("The EyeGestures script loaded but didn't expose the EyeGestures class.");
      this.notifyState("error");
      return;
    }
    if (!this.instance) {
      // The EyeGestures constructor already kicks off its own init (WASM
      // engine, MediaPipe FaceMesh, camera request). `.start()` just shows
      // its calibration instructions overlay and starts calling this
      // callback with real points.
      this.instance = new EngineClass(ENGINE_VIDEO_ID, (point: [number, number], calibrated: boolean) => {
        this.emit({ x: point[0], y: point[1], calibrated });
        if (calibrated && !this.alreadyCalibrated) {
          this.alreadyCalibrated = true;
          this.instance?.invisible();
          document.getElementById("calib_cursor")?.style.setProperty("display", "none");
          this.notifyState("ready");
        }
      });
    }
    this.instance.start();
  }

  private emit(position: GazePosition): void {
    for (const cb of this.subscribers) cb(position);
  }

  private notifyState(state: GazeEngineState): void {
    this.state = state;
    for (const cb of this.stateSubscribers) cb(state);
  }
}
