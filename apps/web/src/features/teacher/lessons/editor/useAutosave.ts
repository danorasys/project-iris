import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ApiError } from "@/shared/api/httpClient";

export type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  /** missing: what a published lesson still needs before it can be saved. */
  | { status: "error"; message: string; missing: string[] };

// Pause after the last change before saving, so typing doesn't send a
// request per letter.
const DELAY_MS = 900;

/** Saves `value` a moment after it stops changing (HU-79), one save at a
 * time. `ready` false holds it back (say, a required field is empty), and
 * the value just loaded is never saved again. */
export function useAutosave<T>(value: T, save: (value: T) => Promise<unknown>, ready = true): SaveState {
  const [state, setState] = useState<SaveState>({ status: "idle" });
  const serialized = JSON.stringify(value);
  const lastSaved = useRef(serialized);
  const saving = useRef(false);
  const latest = useRef({ value, serialized, save, ready });
  // The newest value and save function, for a save that runs later.
  useLayoutEffect(() => {
    latest.current = { value, serialized, save, ready };
  });

  useEffect(() => {
    if (serialized === lastSaved.current || !ready) return;
    const timer = window.setTimeout(function run() {
      if (saving.current) {
        // Tries again once the current save is done.
        window.setTimeout(run, DELAY_MS);
        return;
      }
      const { value: current, serialized: currentSerialized, save: currentSave } = latest.current;
      if (currentSerialized === lastSaved.current || !latest.current.ready) return;
      saving.current = true;
      setState({ status: "saving" });
      currentSave(current)
        .then(() => {
          lastSaved.current = currentSerialized;
          setState({ status: "saved" });
        })
        .catch((error: unknown) => {
          const missing =
            error instanceof ApiError && Array.isArray(error.details?.missing)
              ? (error.details.missing as string[])
              : [];
          const message = error instanceof Error ? error.message : "No se pudo guardar.";
          setState({ status: "error", message, missing });
        })
        .finally(() => {
          saving.current = false;
        });
    }, DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [serialized, ready]);

  // Leaving the editor with a change still waiting: it's saved right away,
  // so nothing typed is lost.
  useEffect(
    () => () => {
      const pending = latest.current;
      if (pending.ready && !saving.current && pending.serialized !== lastSaved.current) {
        void pending.save(pending.value).catch(() => undefined);
      }
    },
    [],
  );

  return state;
}

/** One state for several autosaves: saving if any is, error if any failed. */
export function combineSaveStates(states: SaveState[]): SaveState {
  return (
    states.find((state) => state.status === "error") ??
    states.find((state) => state.status === "saving") ??
    states.find((state) => state.status === "saved") ?? { status: "idle" }
  );
}
