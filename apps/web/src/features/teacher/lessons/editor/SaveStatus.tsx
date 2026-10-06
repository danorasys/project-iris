import { IconAlert, IconCheck } from "@/shared/ui/icons";
import type { SaveState } from "./useAutosave";
import styles from "./SaveStatus.module.css";

/** What the autosave is doing, read by screen readers when it changes:
 * saving, saved, or why it couldn't save (with what's missing, if any). */
export function SaveStatus({ state }: { state: SaveState }) {
  return (
    <div className={styles.status} aria-live="polite">
      {state.status === "saving" && <span className={styles.saving}>Guardando…</span>}
      {state.status === "saved" && (
        <span className={styles.saved}>
          <IconCheck width={16} height={16} />
          Cambios guardados
        </span>
      )}
      {state.status === "error" && (
        <div className={styles.error} role="alert">
          <span className={styles.errorTitle}>
            <IconAlert width={16} height={16} />
            {state.message}
          </span>
          {state.missing.length > 0 && (
            <ul className={styles.missing}>
              {state.missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
