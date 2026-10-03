import { useEffect, useRef, useState } from "react";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { NumericKeypad } from "@/shared/ui/NumericKeypad";
import { IconKey } from "@/shared/ui/icons";
import styles from "./ChangePinDialog.module.css";

export const PIN_LENGTH = 4;

type Step = "current" | "new" | "confirm";

const STEPS: Step[] = ["current", "new", "confirm"];

const STEP_TEXT: Record<Step, string> = {
  current: "Escribe el PIN actual",
  new: "Escribe el nuevo PIN de 4 dígitos",
  confirm: "Vuelve a escribir el nuevo PIN",
};

interface ChangePinDialogProps {
  firstName: string;
  /** Shown on the first step, when the server didn't accept the change (a
   * wrong current PIN, for example) and the guardian starts again. */
  initialError?: string | null;
  /** Asks the server if that is the current PIN, right when it is typed.
   * It rejects when it isn't (or when there were too many tries). */
  onCheckCurrent: (currentPin: string) => Promise<void>;
  /** Called with both PINs once the new one was typed twice the same. */
  onComplete: (pins: { currentPin: string; pin: string }) => void;
  onCancel: () => void;
}

/** A floating dialog to change a kid's PIN with the number pad: the current
 * PIN, the new one, and the new one again. It only collects the PINs, the
 * 2FA code is asked right after by its own dialog. */
export function ChangePinDialog({
  firstName,
  initialError = null,
  onCheckCurrent,
  onComplete,
  onCancel,
}: ChangePinDialogProps) {
  const [step, setStep] = useState<Step>("current");
  const [draft, setDraft] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [checking, setChecking] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  function typeDigits(value: string) {
    if (checking) return;
    setDraft(value);
    setError(null);
  }

  function goTo(next: Step, message: string | null = null) {
    setStep(next);
    setDraft("");
    setError(message);
  }

  // A wrong current PIN is said right here, before asking for the new one.
  async function checkCurrent() {
    setChecking(true);
    try {
      await onCheckCurrent(draft);
      setCurrentPin(draft);
      goTo("new");
    } catch (err) {
      setDraft("");
      setError(getAuthErrorMessage(err));
    } finally {
      setChecking(false);
    }
  }

  function confirmStep() {
    if (draft.length !== PIN_LENGTH || checking) return;
    if (step === "current") {
      void checkCurrent();
    } else if (step === "new") {
      if (draft === currentPin) {
        setDraft("");
        setError("El nuevo PIN no puede ser igual al actual.");
        return;
      }
      setPin(draft);
      goTo("confirm");
    } else if (draft === pin) {
      onComplete({ currentPin, pin });
    } else {
      goTo("new", "Los PIN no coinciden. Vuelve a intentarlo.");
    }
  }

  function goBack() {
    goTo(step === "confirm" ? "new" : "current");
  }

  // The focus starts inside the dialog, so the keyboard works at once.
  useEffect(() => {
    cardRef.current?.focus();
  }, []);

  // The pad also works with the keyboard: digits, Backspace, Enter and Esc.
  // It reads the last values through a ref, so the listener is added once.
  const keyHandler = useRef<(event: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyHandler.current = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      } else if (/^\d$/.test(event.key)) {
        if (draft.length < PIN_LENGTH) typeDigits(draft + event.key);
      } else if (event.key === "Backspace") {
        typeDigits(draft.slice(0, -1));
      } else if (event.key === "Enter") {
        // On Atrás and Cancelar, Enter presses that button. Anywhere else it
        // confirms, even after clicking a digit (which would type it again).
        if (event.target instanceof Element && event.target.closest("[data-keeps-enter]")) return;
        event.preventDefault();
        confirmStep();
      }
    };
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => keyHandler.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const stepNumber = STEPS.indexOf(step) + 1;

  return (
    <div className={styles.backdrop}>
      <div
        ref={cardRef}
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-pin-dialog-title"
        tabIndex={-1}
      >
        <span className={styles.iconBadge}>
          <IconKey width={26} height={26} />
        </span>
        <h2 id="change-pin-dialog-title" className={styles.title}>
          Cambiar el PIN de {firstName}
        </h2>
        <div className={styles.steps} aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s} className={i < stepNumber ? `${styles.stepDot} ${styles.stepDotDone}` : styles.stepDot} />
          ))}
        </div>
        <p className={styles.text} aria-live="polite">
          <span className={styles.stepCount}>Paso {stepNumber} de 3</span>
          {checking ? "Comprobando…" : STEP_TEXT[step]}
        </p>
        {/* It starts empty on each step. */}
        <NumericKeypad
          key={step}
          value={draft}
          onChange={typeDigits}
          onConfirm={confirmStep}
          maxLength={PIN_LENGTH}
          mask
          compact
          numericFont="body"
        />
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.buttons}>
          {step !== "current" && (
            <button type="button" className={styles.cancelButton} onClick={goBack} data-keeps-enter>
              Atrás
            </button>
          )}
          <button type="button" className={styles.cancelButton} onClick={onCancel} data-keeps-enter>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
