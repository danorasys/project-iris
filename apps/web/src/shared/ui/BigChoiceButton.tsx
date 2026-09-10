import type { ReactNode } from "react";
import { useDwellSelect } from "@/shared/gaze/useDwellSelect";
import styles from "./BigChoiceButton.module.css";

type Variant = "coral" | "teal" | "sol" | "hoja";

interface BigChoiceButtonProps {
  children: ReactNode;
  onSelect: () => void;
  variant?: Variant;
  icon?: ReactNode;
  note?: string;
  disabled?: boolean;
  /** Dwell duration in ms. Defaults to the profile's configured value. */
  dwellDurationMs?: number;
}

/** The big, one-target-per-decision button used across the whole student
 * interface. Always clickable with mouse/touch for accessibility and tests.
 * If mounted inside a `GazeSourceProvider`, it also fills up via dwell. */
export function BigChoiceButton({
  children,
  onSelect,
  variant = "coral",
  icon,
  note,
  disabled = false,
  dwellDurationMs,
}: BigChoiceButtonProps) {
  const { ref, progress, focused } = useDwellSelect<HTMLButtonElement>({
    onSelect,
    active: !disabled,
    durationMs: dwellDurationMs,
  });

  return (
    <div className={styles.container}>
      <button
        ref={ref}
        type="button"
        className={`${styles.button} ${styles[variant]} ${focused ? styles.focused : ""}`}
        onClick={() => !disabled && onSelect()}
        disabled={disabled}
      >
        <span className={styles.fill} style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />
        <span className={styles.content}>
          {icon && <span className={styles.icon}>{icon}</span>}
          <span className={styles.text}>{children}</span>
        </span>
      </button>
      {note && <p className={styles.note}>{note}</p>}
    </div>
  );
}
