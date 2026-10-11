import { useEffect, useId, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconClose } from "@/shared/ui/icons";
import { useModalDialog } from "./useModalDialog";
import styles from "./FormDialog.module.css";

interface FormDialogProps {
  /** Small word on top, like "Unidades". */
  eyebrow?: string;
  title: string;
  intro: string;
  icon: ReactNode;
  children: ReactNode;
  submitLabel: string;
  /** What the button says while it works, "Guardando…" if not given. */
  savingLabel?: string;
  saving: boolean;
  /** For something that can't be undone: centered, in red like the
   * ConfirmDialog, with the two buttons the same size. */
  danger?: boolean;
  /** Shown above the buttons when saving failed. */
  error?: string | null;
  /** Resolves true when it was saved, then the dialog closes by itself. */
  onSubmit: () => Promise<boolean>;
  onClose: () => void;
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
  savingLabel = "Guardando…",
  saving,
  danger = false,
  error,
  onSubmit,
  onClose,
}: FormDialogProps) {
  const titleId = useId();
  const introId = useId();
  const { ref, leaving, close: closeThen } = useModalDialog<HTMLDivElement>();

  function close() {
    closeThen(onClose);
  }

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("input, textarea, select")?.focus();
  }, [ref]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Not while another window is open on top of it (it's inert then).
      if (event.key === "Escape" && !saving && !ref.current?.inert) close();
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
      ref={ref}
      className={leaving ? `${styles.backdrop} ${styles.leaving}` : styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={introId}
    >
      <form className={danger ? `${styles.card} ${styles.danger}` : styles.card} onSubmit={submit} noValidate>
        <header className={styles.header}>
          <span className={styles.badge} aria-hidden="true">
            {icon}
          </span>
          <div className={styles.headerText}>
            {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
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
              {saving ? savingLabel : submitLabel}
            </button>
          </div>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
