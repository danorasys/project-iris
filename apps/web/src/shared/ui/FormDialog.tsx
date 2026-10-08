import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconClose } from "@/shared/ui/icons";
import styles from "./FormDialog.module.css";

// How long the closing animation takes. Same as dialog-out in the CSS.
const LEAVE_MS = 180;

interface FormDialogProps {
  /** Small word on top, like "Unidades". */
  eyebrow: string;
  title: string;
  intro: string;
  icon: ReactNode;
  children: ReactNode;
  submitLabel: string;
  saving: boolean;
  /** Shown above the buttons when saving failed. */
  error?: string | null;
  /** Resolves true when it was saved, then the dialog closes by itself. */
  onSubmit: () => Promise<boolean>;
  onClose: () => void;
}

// Same check as ConfirmDialog: no animation when the person asked for less
// motion, or where the browser can't tell (the tests).
function canAnimate(): boolean {
  return typeof window.matchMedia === "function" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A small form in a window, like the new class one. Drawn on <body> with
 * the app behind inert; focus starts on the first field, goes back to the
 * opener when it closes, and Escape closes it unless it's saving. */
export function FormDialog({
  eyebrow,
  title,
  intro,
  icon,
  children,
  submitLabel,
  saving,
  error,
  onSubmit,
  onClose,
}: FormDialogProps) {
  const titleId = useId();
  const introId = useId();
  const [leaving, setLeaving] = useState(false);

  function close() {
    if (leaving) return;
    if (!canAnimate()) {
      onClose();
      return;
    }
    setLeaving(true);
    window.setTimeout(onClose, LEAVE_MS);
  }

  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const app = document.getElementById("root");
    const wasInert = app?.inert ?? false;
    if (app) app.inert = true;
    document
      .querySelector<HTMLElement>(
        `[data-form-dialog="${titleId}"] input, [data-form-dialog="${titleId}"] textarea, [data-form-dialog="${titleId}"] select`,
      )
      ?.focus();
    return () => {
      if (app) app.inert = wasInert;
      if (before?.isConnected) before.focus();
    };
  }, [titleId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) close();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await onSubmit()) close();
  }

  return createPortal(
    <div
      className={leaving ? `${styles.backdrop} ${styles.leaving}` : styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={introId}
      data-form-dialog={titleId}
    >
      <form className={styles.card} onSubmit={submit} noValidate>
        <header className={styles.header}>
          <span className={styles.badge} aria-hidden="true">
            {icon}
          </span>
          <div className={styles.headerText}>
            <p className={styles.eyebrow}>{eyebrow}</p>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            <p id={introId} className={styles.intro}>
              {intro}
            </p>
          </div>
          <button type="button" className={styles.closeButton} onClick={close} disabled={saving} aria-label="Cerrar">
            <IconClose width={20} height={20} />
          </button>
        </header>

        <div className={styles.body}>{children}</div>

        <footer className={styles.footer}>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <div className={styles.buttons}>
            <button type="button" className={styles.cancelButton} onClick={close} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className={styles.saveButton} disabled={saving}>
              {saving ? "Guardando…" : submitLabel}
            </button>
          </div>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
