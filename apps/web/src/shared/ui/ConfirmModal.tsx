import type { ReactNode } from "react";
import { BigChoiceButton } from "./BigChoiceButton";
import styles from "./ConfirmModal.module.css";

interface ConfirmModalProps {
  message: ReactNode;
  preview?: ReactNode;
  acceptLabel: string;
  cancelLabel: string;
  onAccept: () => void;
  onCancel: () => void;
  disabled?: boolean;
}

/** Full-screen confirm/cancel modal, gaze-selectable like everything else
 * in the student experience, 2 large `BigChoiceButton`s, never a single
 * small click target. Reusable wherever a choice needs a second, explicit
 * confirmation step. */
export function ConfirmModal({
  message,
  preview,
  acceptLabel,
  cancelLabel,
  onAccept,
  onCancel,
  disabled = false,
}: ConfirmModalProps) {
  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true">
      <div className={styles.card}>
        <p className={styles.message}>{message}</p>
        {preview}
        <div className={styles.buttons}>
          <BigChoiceButton variant="hoja" onSelect={onAccept} disabled={disabled}>
            {acceptLabel}
          </BigChoiceButton>
          <BigChoiceButton variant="coral" onSelect={onCancel} disabled={disabled}>
            {cancelLabel}
          </BigChoiceButton>
        </div>
      </div>
    </div>
  );
}
