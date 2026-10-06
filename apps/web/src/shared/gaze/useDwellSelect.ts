import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { calculateProgress, isInsideRect, isProgressComplete } from "./dwellMath";
import { useGazeSourceOptional } from "./useGazeSource";

interface DwellSelectOptions {
  onSelect: () => void;
  durationMs?: number;
  active?: boolean;
}

interface DwellSelectResult<T extends HTMLElement> {
  ref: RefObject<T | null>;
  progress: number;
  focused: boolean;
}

// Must match --dwell-duration-default-ms in theme.css.
const DEFAULT_DURATION_MS = 900;

/** Sustained-gaze selection (dwell). Works the same over a mouse (dev/demo)
 * as over the EyeGestures engine once connected, it doesn't care where the
 * position comes from, it just consumes `useGazeSource()`. */
export function useDwellSelect<T extends HTMLElement>({
  onSelect,
  durationMs = DEFAULT_DURATION_MS,
  active = true,
}: DwellSelectOptions): DwellSelectResult<T> {
  const ref = useRef<T>(null);
  const [progress, setProgress] = useState(0);
  const [focused, setFocused] = useState(false);
  const source = useGazeSourceOptional();

  const dwellStartRef = useRef<number | null>(null);
  const selectedRef = useRef(false);
  // Always calls the newest onSelect, without starting the dwell over when
  // the parent passes a new function on each render.
  const onSelectRef = useRef(onSelect);
  useLayoutEffect(() => {
    onSelectRef.current = onSelect;
  });

  const enabled = active && source !== null;

  useEffect(() => {
    if (!enabled || !source) return;

    const unsubscribe = source.subscribe(({ x, y }) => {
      const element = ref.current;
      if (!element) return;

      const inside = isInsideRect(x, y, element.getBoundingClientRect());
      setFocused(inside);

      if (!inside) {
        dwellStartRef.current = null;
        selectedRef.current = false;
        setProgress(0);
        return;
      }

      if (dwellStartRef.current === null) {
        dwellStartRef.current = performance.now();
      }

      const elapsed = performance.now() - dwellStartRef.current;
      setProgress(calculateProgress(elapsed, durationMs));

      if (isProgressComplete(elapsed, durationMs) && !selectedRef.current) {
        selectedRef.current = true;
        onSelectRef.current();
      }
    });

    // Stops listening and leaves everything at zero, so a button that gets
    // turned back on starts from the beginning.
    return () => {
      unsubscribe();
      dwellStartRef.current = null;
      selectedRef.current = false;
      setProgress(0);
      setFocused(false);
    };
  }, [source, durationMs, enabled]);

  // While it's off it always reads as empty, whatever was left in the state.
  return { ref, progress: enabled ? progress : 0, focused: enabled && focused };
}
