import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import styles from "./OtpCodeInput.module.css";

const DIGIT_COUNT = 6;

interface OtpCodeInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  error?: string;
  disabled?: boolean;
  /** Focuses the first box on mount. The 2FA setup wizard only renders this
   * component once the guardian has already moved past the QR code slide,
   * so by the time it shows up they're meant to type into it right away —
   * and after a failed attempt it's remounted via a `key` change to reset
   * both the boxes and the focus. */
  autoFocus?: boolean;
}

/** Six separate one-digit boxes for a TOTP code, instead of a single free
 * text field — easier to scan against the digits shown in the authenticator
 * app, and keeps every digit's position visible even while empty. Typing,
 * pasting the whole code at once, and a phone's SMS/OTP autofill (via
 * `autoComplete="one-time-code"` on the first box) are all supported. */
export function OtpCodeInput({ id, label, value, onChange, onComplete, error, disabled, autoFocus }: OtpCodeInputProps) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const errorId = `${id}-error`;
  const digits = Array.from({ length: DIGIT_COUNT }, (_, index) => value[index] ?? "");

  useEffect(() => {
    if (autoFocus) inputRefs.current[0]?.focus();
    // Only ever meant to run once, right after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyDigitsFrom(startIndex: number, incomingDigits: string) {
    const next = digits.slice();
    let cursor = startIndex;
    for (const char of incomingDigits) {
      if (cursor >= DIGIT_COUNT) break;
      next[cursor] = char;
      cursor += 1;
    }
    const nextValue = next.join("");
    onChange(nextValue);
    inputRefs.current[Math.min(cursor, DIGIT_COUNT - 1)]?.focus();
    if (nextValue.length === DIGIT_COUNT) onComplete?.(nextValue);
  }

  function handleChange(index: number, raw: string) {
    const incoming = raw.replace(/\D/g, "");
    if (!incoming) {
      const next = digits.slice();
      next[index] = "";
      onChange(next.join(""));
      return;
    }
    applyDigitsFrom(index, incoming);
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (event.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < DIGIT_COUNT - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    event.preventDefault();
    applyDigitsFrom(index, pasted);
  }

  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>
        {label}
        <span aria-hidden="true"> *</span>
      </legend>
      <div className={styles.boxes} role="group" aria-describedby={error ? errorId : undefined}>
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            className={styles.box}
            value={digit}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={(event) => handlePaste(index, event)}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            aria-label={`Dígito ${index + 1} de ${DIGIT_COUNT}`}
            aria-invalid={Boolean(error)}
            placeholder="_"
            maxLength={DIGIT_COUNT}
            disabled={disabled}
          />
        ))}
      </div>
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
