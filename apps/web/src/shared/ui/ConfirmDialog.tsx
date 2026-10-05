import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconAlert, IconInfo } from "@/shared/ui/icons";
import styles from "./ConfirmDialog.module.css";

// How long the closing animation takes. Same as dialog-out in the CSS.
const LEAVE_MS = 180;

interface ConfirmDialogProps {
  /** A short title on top, like "Cambios sin guardar". */
  title?: string;
  message: string;
  acceptLabel: string;
  cancelLabel: string;
  onAccept: () => void;
  onCancel: () => void;
  /** Something that can't be undone or loses what was typed (deleting,
   * leaving without saving, closing the session): a red warning sign and
   * a red accept button, instead of the blue ones. */
  danger?: boolean;
}

// Animations only where the browser can do them and the person didn't ask
// for less motion. Elsewhere (and in the tests) it closes at once.
function canAnimate(): boolean {
  return typeof window.matchMedia === "function" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The confirm/cancel dialog of both portals (leaving without saving,
 * cerrar sesión, deleting). The student side has its own one, made for
 * the eye tracking (ConfirmModal).
 *
 * It's drawn on <body> and not inside the card that opened it, because an
 * animated card keeps it inside its own box and the page around stays
 * usable. While it's open the app behind is inert. The focus starts on
 * "cancel", the safe choice, and Escape cancels. */
export function ConfirmDialog({
  title,
  message,
  acceptLabel,
  cancelLabel,
  onAccept,
  onCancel,
  danger = false,
}: ConfirmDialogProps) {
  const titleId = useId();
  const messageId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [leaving, setLeaving] = useState(false);

  // Plays the closing animation, then does what was chosen.
  function close(then: () => void) {
    if (leaving) return;
    if (!canAnimate()) {
      then();
      return;
    }
    setLeaving(true);
    window.setTimeout(then, LEAVE_MS);
  }

  // Freezes the app behind the dialog while it's open. When it closes, the
  // focus goes back to what had it before (the button that opened it).
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const app = document.getElementById("root");
    const wasInert = app?.inert ?? false;
    if (app) app.inert = true;
    return () => {
      if (app) app.inert = wasInert;
      if (before?.isConnected) before.focus();
    };
  }, []);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close(onCancel);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  const Icon = danger ? IconAlert : IconInfo;

  return createPortal(
    <div
      className={leaving ? `${styles.backdrop} ${styles.leaving}` : styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : messageId}
      aria-describedby={title ? messageId : undefined}
    >
      <div className={styles.card}>
        <span className={danger ? `${styles.badge} ${styles.badgeDanger}` : styles.badge} aria-hidden="true">
          <Icon width={28} height={28} />
        </span>
        {title && (
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
        )}
        <p id={messageId} className={styles.message}>
          {message}
        </p>
        <div className={styles.buttons}>
          <button ref={cancelRef} type="button" className={styles.cancelButton} onClick={() => close(onCancel)}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? styles.dangerButton : styles.acceptButton}
            onClick={() => close(onAccept)}
          >
            {acceptLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
