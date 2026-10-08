import { useLayoutEffect } from "react";

// Puts the portals' palette on (see :root[data-theme="portal"] in theme.css)
// while the screen is open, and takes it off when leaving. A layout effect,
// so the first paint already has the right colors.
export function usePortalTheme() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = "portal";
    return () => {
      delete root.dataset.theme;
    };
  }, []);
}
