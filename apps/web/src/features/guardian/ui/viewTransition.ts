import { flushSync } from "react-dom";

/** Makes a change on screen with a short animation between how the page
 * looked before and after (the browser's View Transitions). Used when a
 * profile field opens to be edited and when it closes, so it grows and
 * shrinks instead of jumping. Where the browser can't do it, or the person
 * asked the system for less movement, or `animate` is false, the change is
 * just made at once.
 * The change is applied before this returns the control to the browser's
 * next step, so the caller can use the new elements right after `update`. */
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
