/** Pure math for the dwell-select mechanism. No React or real DOM
 * dependencies, so it's trivial to test. */

export interface TargetRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function isInsideRect(x: number, y: number, rect: TargetRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/** Progress from 0 to 1 based on how long the gaze has held on the target. */
export function calculateProgress(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return 1;
  return Math.min(1, Math.max(0, elapsedMs / durationMs));
}

export function isProgressComplete(elapsedMs: number, durationMs: number): boolean {
  return calculateProgress(elapsedMs, durationMs) >= 1;
}
