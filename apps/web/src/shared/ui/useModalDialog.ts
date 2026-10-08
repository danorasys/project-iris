import { useLayoutEffect, useRef, useState } from "react";

// How long the closing animation takes. Same as dialog-out in the CSS.
const LEAVE_MS = 180;

// No closing animation when the person asked for less motion, or where the
// browser can't tell (the tests). Then it just closes at once.
function canAnimate(): boolean {
  return typeof window.matchMedia === "function" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** What every window of the portals does the same way. It goes on <body>
 * (createPortal) with `ref` on its backdrop. While open, the rest of <body>
 * is inert, even a window under it (the PIN one under the 2FA code). On
 * close the focus goes back to whoever opened it. `close` plays the closing
 * animation and then runs `then`. */
export function useModalDialog<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [leaving, setLeaving] = useState(false);

  // A layout effect, so it runs before the effects inside the window (like
  // the code boxes taking the focus) and still sees who opened it.
  useLayoutEffect(() => {
    const dialog = ref.current;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Only the ones not inert yet, so closing gives back exactly what it took.
    const frozen = Array.from(document.body.children).filter(
      (element): element is HTMLElement => element instanceof HTMLElement && element !== dialog && !element.inert,
    );
    frozen.forEach((element) => (element.inert = true));
    return () => {
      frozen.forEach((element) => (element.inert = false));
      if (before?.isConnected) before.focus();
    };
  }, []);

  function close(then: () => void) {
    if (leaving) return;
    if (!canAnimate()) {
      then();
      return;
    }
    setLeaving(true);
    window.setTimeout(then, LEAVE_MS);
  }

  return { ref, leaving, close };
}
