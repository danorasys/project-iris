import { useLayoutEffect, useRef } from "react";

// One entrance for every change of view in IRIS, so moving around never
// feels abrupt. It also says where you went: going deeper (a kid, an
// option, the next notification) the new view comes from the right, going
// back it comes from the left, and next to it (another section) it just
// fades in with a light zoom.
const DURATION_MS = 340;
const EASING = "cubic-bezier(0.2, 0, 0, 1)";

export type EnterMotion = "forward" | "back" | "through" | "fade";

const KEYFRAMES: Record<EnterMotion, Keyframe[]> = {
  forward: [
    { opacity: 0, transform: "translateX(24px)" },
    { opacity: 1, transform: "none" },
  ],
  back: [
    { opacity: 0, transform: "translateX(-24px)" },
    { opacity: 1, transform: "none" },
  ],
  through: [
    { opacity: 0, transform: "scale(0.98)" },
    { opacity: 1, transform: "none" },
  ],
  fade: [{ opacity: 0 }, { opacity: 1 }],
};

// Nothing has been shown yet, so the first view also gets the entrance.
const NOTHING_SHOWN = Symbol("nothing shown");

function prefersLessMotion() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Plays the entrance once on an element. Nothing happens when the person
 * asked for less motion or the browser can't animate (jsdom, in the tests). */
export function playEnter(element: HTMLElement | null, motion: EnterMotion) {
  if (!element || typeof element.animate !== "function" || prefersLessMotion()) return null;
  return element.animate(KEYFRAMES[motion], { duration: DURATION_MS, easing: EASING });
}

export interface EnterOptions {
  /** How deep (or how far right) the view is: the list 0, what opens from
   * it 1, a tab its position… Going up comes from the right, going down
   * from the left, the same level fades with a zoom. */
  level?: number;
  /** Also plays it the first time. */
  onMount?: boolean;
}

/** Plays the entrance on the element of the ref every time `view` changes.
 * It doesn't remount anything, so what's typed or open inside is kept, and
 * it ends with no transform left, so dialogs inside keep their place. */
export function useEnterAnimation<T extends HTMLElement>(
  view: unknown,
  { level = 0, onMount = false }: EnterOptions = {},
) {
  const ref = useRef<T>(null);
  const shown = useRef<{ view: unknown; level: number }>({ view: onMount ? NOTHING_SHOWN : view, level });
  const running = useRef<Animation | null>(null);

  // Before the paint, so the new view never flashes in its final place.
  useLayoutEffect(() => {
    // Same view with a new level (like a notification whose place in the
    // tray arrives later): just remember it, the next change goes from there.
    if (Object.is(shown.current.view, view)) {
      shown.current.level = level;
      return;
    }
    const from = shown.current.level;
    shown.current = { view, level };
    running.current?.cancel();
    running.current = playEnter(ref.current, level > from ? "forward" : level < from ? "back" : "through");
  }, [view, level]);

  return ref;
}
