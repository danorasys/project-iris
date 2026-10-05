import { flushSync } from "react-dom";

/** Applies a change with a short animation between the before and the
 * after (View Transitions), so a profile field grows and shrinks instead of
 * jumping. Without browser support, with less motion asked for, or with
 * `animate` false, it just changes at once. Either way the change is done
 * when this returns. */
export function withViewTransition(update: () => void, animate = true) {
  const lessMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!animate || typeof document.startViewTransition !== "function" || lessMotion) {
    flushSync(update);
    return;
  }
  // The browser takes a picture of the page, then runs this, and animates
  // from the picture to the new page. flushSync makes React draw inside it.
  document.startViewTransition(() => flushSync(update));
}

/** A name the browser uses to follow one element from before to after. */
export function transitionName(prefix: string, id: string): string {
  return `${prefix}-${id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}
