import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { createGazeSource, type GazeSource } from "./GazeSource";

const GazeSourceContext = createContext<GazeSource | null>(null);

/** Provides an already-built gaze source. Whoever instantiates it decides
 * if it's the real engine/mouse (`createGazeSource()`, see
 * `StudentGazeProvider`) or any other `GazeSource` implementation, like
 * a scripted one for a demo. */
export function GazeSourceProvider({ fuente, children }: { fuente: GazeSource; children: ReactNode }) {
  useEffect(() => {
    fuente.start();
    return () => fuente.stop();
  }, [fuente]);

  return <GazeSourceContext.Provider value={fuente}>{children}</GazeSourceContext.Provider>;
}

/** Real gaze source (EyeGestures, unless the manual fallback or
 * `VITE_GAZE_SOURCE=mouse` kicks in). Wrap the `/student/*` routes with
 * this. */
export function StudentGazeProvider({ children }: { children: ReactNode }) {
  const fuente = useMemo(() => createGazeSource(), []);
  return <GazeSourceProvider fuente={fuente}>{children}</GazeSourceProvider>;
}

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
