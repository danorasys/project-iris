/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** "mouse" forces the mouse fallback instead of the real EyeGestures
   * engine, handy on dev machines without a camera. See
   * src/shared/gaze/GazeSource.ts. */
  readonly VITE_GAZE_SOURCE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}

declare module "*.css";
