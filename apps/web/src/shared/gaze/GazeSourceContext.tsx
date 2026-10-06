import { useEffect, useMemo, type ReactNode } from "react";
import { createGazeSource, type GazeSource } from "./GazeSource";
import { GazeSourceContext } from "./gazeContext";

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
