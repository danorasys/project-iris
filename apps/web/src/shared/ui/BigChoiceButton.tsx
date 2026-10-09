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
  /** A small count in the top right corner, like unread notifications.
   * Hidden when it's 0. */
  badge?: number;
  /** What the badge means, for screen readers ("sin leer"). */
  badgeLabel?: string;
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
  badge = 0,
  badgeLabel = "",
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
        {/* After the text, so it's read as "Notificaciones, 3 sin leer". */}
        {badge > 0 && (
          <span className={styles.badge}>
            <span aria-hidden="true">{badge > 99 ? "99+" : badge}</span>
            <span className={styles.srOnly}>{`, ${badge} ${badgeLabel}`}</span>
          </span>
        )}
      </button>
      {note && <p className={styles.note}>{note}</p>}
    </div>
  );
}
