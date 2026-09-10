import { useDwellSelect } from "@/shared/gaze/useDwellSelect";
import { IconArrowRight, IconArrowLeft } from "@/shared/ui/icons";
import styles from "./DwellArrow.module.css";

interface DwellArrowProps {
  direction: "left" | "right";
  onSelect: () => void;
  disabled?: boolean;
  dwellDurationMs?: number;
  label: string;
}

/** Tall rectangular dwell target ("a wide vertical strip", never a small
 * corner icon) for navigating the lesson viewer. Doesn't use
 * `BigChoiceButton` (which is square), built directly on `useDwellSelect`,
 * the same way `BigChoiceButton` does internally. */
export function DwellArrow({ direction, onSelect, disabled = false, dwellDurationMs, label }: DwellArrowProps) {
  const { ref, progress, focused } = useDwellSelect<HTMLButtonElement>({
    onSelect,
    active: !disabled,
    durationMs: dwellDurationMs,
  });

  return (
    <button
      ref={ref}
      type="button"
      className={`${styles.arrow} ${styles[direction]} ${focused ? styles.focused : ""}`}
      onClick={() => !disabled && onSelect()}
      disabled={disabled}
      aria-label={label}
    >
      <span className={styles.fill} style={{ transform: `scaleY(${progress})` }} aria-hidden="true" />
      <span className={styles.icon} aria-hidden="true">
        {direction === "left" ? (
          <IconArrowLeft width={48} height={48} />
        ) : (
          <IconArrowRight width={48} height={48} />
        )}
      </span>
    </button>
  );
}
