// How long a target takes to fill, per profile (`session.subjectId`), kept
// in localStorage. Older versions measured it with a calibration of their
// own; now the calibration is EyeGestures' only, and without a saved time
// every target uses the default one. What the kid already went through is
// in studentJourney.ts.

const DWELL_DURATION_PREFIX = "iris_dwell_ms_";

function isLocalStorageAvailable(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

export function saveDwellDurationMs(subjectId: string, durationMs: number): void {
  if (!isLocalStorageAvailable()) return;
  try {
    window.localStorage.setItem(DWELL_DURATION_PREFIX + subjectId, String(Math.round(durationMs)));
  } catch {
    /* not critical if it can't persist, the default value gets used */
  }
}

/** Returns the saved dwell duration for the profile, or `undefined` if it
 * doesn't exist or is invalid. In that case the dwell component just uses
 * its own default. */
export function getDwellDurationMs(subjectId: string): number | undefined {
  if (!isLocalStorageAvailable()) return undefined;
  try {
    const raw = window.localStorage.getItem(DWELL_DURATION_PREFIX + subjectId);
    if (!raw) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}
