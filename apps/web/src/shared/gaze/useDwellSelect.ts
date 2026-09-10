import { useEffect, useRef, useState, type RefObject } from "react";
import { calculateProgress, isInsideRect, isProgressComplete } from "./dwellMath";
import { useGazeSourceOptional } from "./GazeSourceContext";

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
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!active || !source) {
      setProgress(0);
      setFocused(false);
      return;
    }

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

    return unsubscribe;
  }, [source, durationMs, active]);

  return { ref, progress, focused };
}
