import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BigChoiceButton } from "./BigChoiceButton";
import { useModalDialog } from "./useModalDialog";
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

/** Full-screen confirm/cancel window of the kid's side, gaze-selectable like
 * everything else there: 2 large `BigChoiceButton`s, never a small target.
 * Like the windows of the portals it goes on <body> with the page behind
 * inert, and the focus starts on its first button, so with the keyboard
 * (HU-88) Tab only moves between its two answers. */
export function ConfirmModal({
  message,
  preview,
  acceptLabel,
  cancelLabel,
  onAccept,
  onCancel,
  disabled = false,
}: ConfirmModalProps) {
  const messageId = useId();
  const { ref } = useModalDialog<HTMLDivElement>();

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [ref]);

  // Esc is the same as "cancel".
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !disabled) onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [disabled, onCancel]);

  return createPortal(
    <div ref={ref} className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby={messageId}>
      <div className={styles.card}>
        <p id={messageId} className={styles.message}>
          {message}
        </p>
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
    </div>,
    document.body,
  );
}
