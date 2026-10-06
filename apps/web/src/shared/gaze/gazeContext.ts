import { createContext } from "react";
import type { GazeSource } from "./GazeSource";

// The gaze source the student's screens share. The providers live in
// GazeSourceContext.tsx and the hooks in useGazeSource.ts, apart, so Vite can
// reload the providers on their own while developing.
export const GazeSourceContext = createContext<GazeSource | null>(null);
