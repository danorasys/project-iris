// How full the target under the gaze is, for the gaze cursor: every target
// (useDwellSelect) says how far it's gone, and the cursor fills with the
// one that's furthest, which is the one being looked at. Kept outside React
// so the cursor moves without re-rendering the screen.

type Listener = (progress: number) => void;

const progressByTarget = new Map<object, number>();
const listeners = new Set<Listener>();
let current = 0;

function emit(): void {
  let highest = 0;
  for (const value of progressByTarget.values()) highest = Math.max(highest, value);
  if (highest === current) return;
  current = highest;
  for (const listener of listeners) listener(current);
}

/** A target says how full it is (0 when the gaze left it or it's gone). */
export function reportDwellProgress(target: object, progress: number): void {
  if (progress > 0) progressByTarget.set(target, progress);
  else if (!progressByTarget.delete(target)) return;
  emit();
}

export function subscribeDwellProgress(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

// After choosing something, nothing starts filling until the gaze moves away
// from that spot: otherwise what comes next in the same place (the bar of
// the next screen, the same key) would be chosen by itself.
const MOVE_AWAY_PX = 60;
let heldAt: { x: number; y: number } | null = null;

/** A target was just chosen with the gaze at (x, y). */
export function holdAfterSelection(x: number, y: number): void {
  heldAt = { x, y };
}

/** Whether the gaze is still on the spot where something was just chosen. */
export function isHeldAfterSelection(x: number, y: number): boolean {
  if (!heldAt) return false;
  if (Math.hypot(x - heldAt.x, y - heldAt.y) > MOVE_AWAY_PX) {
    heldAt = null;
    return false;
  }
  return true;
}
