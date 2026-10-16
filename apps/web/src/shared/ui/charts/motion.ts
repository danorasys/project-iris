import { useEffect, useRef, useState } from "react";

// The charts move only where they can: a browser that animates (not jsdom,
// in the tests) and a person who didn't ask for less motion. Otherwise they
// show their final numbers right away.
export function canAnimate(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    typeof window.requestAnimationFrame === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** A number that counts up to its value when it appears, and from the old
 * value to the new one when it changes, slowing down at the end. */
export function useCountUp(target: number, durationMs = 900): number {
  const animate = canAnimate();
  const [value, setValue] = useState(animate ? 0 : target);
  const shown = useRef(animate ? 0 : target);

  useEffect(() => {
    if (!canAnimate()) return;
    const from = shown.current;
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - progress) ** 3;
      shown.current = Math.round(from + (target - from) * eased);
      setValue(shown.current);
      if (progress < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return animate ? value : target;
}
