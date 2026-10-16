import { useId, type CSSProperties, type ReactNode } from "react";
import styles from "./charts.module.css";

interface ProgressRingProps {
  /** 0 to 100. */
  percent: number;
  size?: number;
  stroke?: number;
  /** What goes in the middle: the percent, an avatar… */
  children?: ReactNode;
  /** Read as a progressbar with this name; without it the ring is only a
   * drawing and the text next to it says the number. */
  label?: string;
}

/** A ring that fills up to its percent with the blue to sky gradient of
 * IRIS, drawn when it appears. */
export function ProgressRing({ percent, size = 64, stroke = 7, children, label }: ProgressRingProps) {
  // An id without the ":" React puts in, to be safe inside url(#…).
  const gradientId = `ring-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const value = Math.max(0, Math.min(100, percent));
  const dash = (value / 100) * length;
  const center = size / 2;
  const a11y = label
    ? {
        role: "progressbar",
        "aria-label": label,
        "aria-valuemin": 0,
        "aria-valuemax": 100,
        "aria-valuenow": value,
      }
    : {};

  return (
    <span className={styles.ring} style={{ width: size, height: size }} {...a11y}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--landing-sky)" />
            <stop offset="100%" stopColor="var(--color-iris-medium)" />
          </linearGradient>
        </defs>
        <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--color-iris-pale)" strokeWidth={stroke} />
        {value > 0 && (
          <circle
            className={styles.ringValue}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            transform={`rotate(-90 ${center} ${center})`}
            style={{ "--dash": `${dash}px`, "--length": `${length}px` } as CSSProperties}
          />
        )}
      </svg>
      {children && <span className={styles.ringCenter}>{children}</span>}
    </span>
  );
}
