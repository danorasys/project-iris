import { useContext } from "react";
import type { GazeSource } from "./GazeSource";
import { GazeSourceContext } from "./gazeContext";

export function useGazeSource(): GazeSource {
  const ctx = useContext(GazeSourceContext);
  if (!ctx) throw new Error("useGazeSource must be used inside <GazeSourceProvider>");
  return ctx;
}

/** Same as `useGazeSource`, but returns `null` instead of throwing when
 * there's no provider. For shared components (like `BigChoiceButton`) that
 * are also used outside the student routes, where dwell simply doesn't
 * apply. */
export function useGazeSourceOptional(): GazeSource | null {
  return useContext(GazeSourceContext);
}
