import type { ReactNode } from "react";
import { useDwellSelect } from "@/shared/gaze/useDwellSelect";
import { IconBackspace, IconCheck } from "./icons";
import styles from "./NumericKeypad.module.css";

interface KeyProps {
  content: ReactNode;
  accessibleLabel: string;
  onSelect: () => void;
  variant?: "digit" | "backspace" | "confirm";
  disabled?: boolean;
  compact?: boolean;
  fontClass?: string;
}

function Key({
  content,
  accessibleLabel,
  onSelect,
  variant = "digit",
  disabled = false,
  compact = false,
  fontClass = "",
}: KeyProps) {
  const { ref, progress, focused } = useDwellSelect<HTMLButtonElement>({
    onSelect,
    active: !disabled,
  });

  return (
    <button
      ref={ref}
      type="button"
      className={`${styles.key} ${styles[variant]} ${compact ? styles.keyCompact : ""} ${focused ? styles.focused : ""} ${fontClass}`}
      onClick={() => !disabled && onSelect()}
      disabled={disabled}
      aria-label={accessibleLabel}
    >
      <span className={styles.fill} style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />
      <span className={styles.label}>{content}</span>
    </button>
  );
}

interface NumericKeypadProps {
  value: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  maxLength: number;
  minLength?: number;
  mask?: boolean;
  /** Smaller size for contexts without active gaze tracking, like an adult
   * setting the PIN during registration with mouse/keyboard. The default
   * giant size stays `--dwell-target-min`, for when the student itself
   * uses it with their gaze. */
  compact?: boolean;
  /** "mono" (default) keeps the digits in the app's monospace font, used for
   * the classroom entry code, where equal-width digits make a code easier to
   * read back correctly. "body" switches to the same font as the rest of
   * the interface, used for a PIN, which is typed and remembered rather
   * than read character by character. */
  numericFont?: "mono" | "body";
}

/** Numeric keypad, reused for the profile PIN and the classroom entry code.
 * 10 digits plus delete and confirm, all dwell-select. */
export function NumericKeypad({
  value,
  onChange,
  onConfirm,
  maxLength,
  minLength = maxLength,
  mask = false,
  compact = false,
  numericFont = "mono",
}: NumericKeypadProps) {
  const addDigit = (digit: string) => {
    if (value.length >= maxLength) return;
    onChange(value + digit);
  };

  const deleteLast = () => onChange(value.slice(0, -1));

  const canConfirm = value.length >= minLength;
  const fontClass = numericFont === "body" ? styles.fontBody : "";

  return (
    <div className={`${styles.container} ${compact ? styles.containerCompact : ""}`}>
      <div className={styles.display} aria-live="polite">
        {Array.from({ length: maxLength }).map((_, i) => (
          <span
            key={i}
            className={`${styles.displayCell} ${compact ? styles.displayCellCompact : ""} ${i < value.length ? styles.displayCellFilled : ""} ${fontClass}`}
          >
            {i < value.length ? (mask ? "•" : value[i]) : ""}
          </span>
        ))}
      </div>

      <div className={`${styles.grid} ${compact ? styles.gridCompact : ""}`}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Key
            key={d}
            content={d}
            accessibleLabel={`Dígito ${d}`}
            onSelect={() => addDigit(d)}
            compact={compact}
            fontClass={fontClass}
          />
        ))}
        <Key
          content={<IconBackspace width={compact ? 20 : 30} height={compact ? 20 : 30} />}
          accessibleLabel="Borrar último dígito"
          variant="backspace"
          onSelect={deleteLast}
          disabled={value.length === 0}
          compact={compact}
        />
        <Key
          content="0"
          accessibleLabel="Dígito 0"
          onSelect={() => addDigit("0")}
          compact={compact}
          fontClass={fontClass}
        />
        <Key
          content={<IconCheck width={compact ? 22 : 32} height={compact ? 22 : 32} />}
          accessibleLabel="Confirmar"
          variant="confirm"
          onSelect={onConfirm}
          disabled={!canConfirm}
          compact={compact}
        />
      </div>
    </div>
  );
}
