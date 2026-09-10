// Gaze preferences saved in localStorage per student profile
// (`session.subjectId`): whether the tour was already seen, and the custom
// dwell duration measured at /student/calibration.

const TOUR_SEEN_PREFIX = "iris_recorrido_visto_";
const DWELL_DURATION_PREFIX = "iris_dwell_ms_";

/** Average time (ms) the student took to complete each calibration target.
 * Pure, no DOM dependencies, so it can be tested without simulating real
 * gaze events. */
export function calculateAverageDwellMs(timesMs: number[]): number {
  if (timesMs.length === 0) return 0;
  const sum = timesMs.reduce((acc, t) => acc + t, 0);
  return Math.round(sum / timesMs.length);
}

function isLocalStorageAvailable(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

export function markTourSeen(subjectId: string): void {
  if (!isLocalStorageAvailable()) return;
  try {
    window.localStorage.setItem(TOUR_SEEN_PREFIX + subjectId, "1");
  } catch {
    /* storage unavailable (private mode, quota full), not critical */
  }
}

export function isTourSeen(subjectId: string): boolean {
  if (!isLocalStorageAvailable()) return false;
  try {
    return window.localStorage.getItem(TOUR_SEEN_PREFIX + subjectId) === "1";
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
