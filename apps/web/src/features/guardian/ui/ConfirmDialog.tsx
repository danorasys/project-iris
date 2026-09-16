import styles from "./ConfirmDialog.module.css";

interface ConfirmDialogProps {
  message: string;
  acceptLabel: string;
  cancelLabel: string;
  onAccept: () => void;
  onCancel: () => void;
  /** Tints the accept button red for a destructive action (e.g. cerrar
   * sesión), instead of the usual amber. */
  danger?: boolean;
}

/** A simple confirm/cancel dialog for the parents' portal, used for things
 * like "regresar" and "cerrar sesión". The student side already has its
 * own dialog based on eye tracking (shared/ui/ConfirmModal.tsx) with big
 * tiles you look at to select, which would not make sense here since this
 * screen is used with a mouse and keyboard. */
export function ConfirmDialog({ message, acceptLabel, cancelLabel, onAccept, onCancel, danger = false }: ConfirmDialogProps) {
  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true">
      <div className={styles.card}>
        <p className={styles.message}>{message}</p>
        <div className={styles.buttons}>
          <button type="button" className={styles.cancelButton} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? styles.dangerButton : styles.acceptButton}
            onClick={onAccept}
          >
            {acceptLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
