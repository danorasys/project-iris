// How the kid moves around IRIS on this device (HU-88): with their gaze (the
// default), or with the mouse or the keyboard when the camera can't be used.
// It's a choice of the device, not of the account, so it lives in localStorage.

export type InputMode = "gaze" | "mouse" | "keyboard";

const MODE_KEY = "iris_modo_entrada";
// What an older version saved when the kid went on with the mouse.
const LEGACY_MOUSE_KEY = "iris_gaze_manual_fallback";

function isInputMode(value: string | null): value is InputMode {
  return value === "gaze" || value === "mouse" || value === "keyboard";
}

export function getInputMode(): InputMode {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    if (isInputMode(saved)) return saved;
    return localStorage.getItem(LEGACY_MOUSE_KEY) === "1" ? "mouse" : "gaze";
  } catch {
    return "gaze";
  }
}

export function setInputMode(mode: InputMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
    localStorage.removeItem(LEGACY_MOUSE_KEY);
  } catch {
    // Storage unavailable (private mode): it'll just be asked again next time.
  }
}

/** Saves the mode and reloads the page, so /student/* starts again with the
 * right gaze source (it's chosen once, when the student area mounts). */
export function switchInputMode(mode: InputMode, to: string): void {
  setInputMode(mode);
  window.location.assign(to);
}
