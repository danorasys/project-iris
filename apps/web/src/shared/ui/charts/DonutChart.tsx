import { useId } from "react";
import styles from "./charts.module.css";

export interface DonutSlice {
  label: string;
  value: number;
  /** A color of the theme, like "var(--color-leaf)". */
  color: string;
}

interface DonutChartProps {
  /** What it shows, said first to a screen reader. */
  title: string;
  slices: DonutSlice[];
  /** The big text in the middle, like "75 %". */
  center: string;
  centerLabel?: string;
  size?: number;
}

const STROKE = 18;

/** A donut chart drawn with SVG (one circle per slice, its length given by
 * the dash), with its legend in words next to it. The legend is also what a
 * screen reader gets, so nobody depends on the colors to read it. */
export function DonutChart({ title, slices, center, centerLabel, size = 168 }: DonutChartProps) {
  const titleId = useId();
  const radius = (size - STROKE) / 2;
  const length = 2 * Math.PI * radius;
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  // Each slice starts where the ones before it ended.
  const portions = slices.map((slice) => (total ? slice.value / total : 0));
  const arcs = slices.map((slice, i) => {
    const before = portions.slice(0, i).reduce((sum, portion) => sum + portion, 0);
    return { ...slice, dash: portions[i] * length, offset: -before * length };
  });

  return (
    <figure className={styles.donut} aria-labelledby={titleId}>
      <div className={styles.donutGraphic} style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-iris-pale)"
            strokeWidth={STROKE}
          />
          {arcs
            .filter((arc) => arc.dash > 0)
            .map((arc) => (
              <circle
                key={arc.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={arc.color}
                strokeWidth={STROKE}
                strokeDasharray={`${arc.dash} ${length - arc.dash}`}
                strokeDashoffset={arc.offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            ))}
        </svg>
        <span className={styles.donutCenter} aria-hidden="true">
          <strong>{center}</strong>
          {centerLabel && <span>{centerLabel}</span>}
        </span>
      </div>
      <figcaption>
        <span id={titleId} className={styles.chartTitle}>
          {title}
        </span>
        <ul className={styles.legend}>
          {slices.map((slice) => (
            <li key={slice.label}>
              <span className={styles.swatch} style={{ background: slice.color }} aria-hidden="true" />
              {slice.label}: <strong>{slice.value}</strong>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
