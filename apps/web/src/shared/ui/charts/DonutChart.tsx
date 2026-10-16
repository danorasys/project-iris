import { useId, type CSSProperties } from "react";
import { CountUp } from "./CountUp";
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
  /** The big number in the middle, a percent ("75 %"). */
  percent: number;
  centerLabel?: string;
  size?: number;
}

const STROKE = 20;

/** A donut chart drawn with SVG: one rounded piece per slice with a small
 * gap between them, drawn one after the other when it appears, and the
 * percent in the middle counting up. The legend says each slice in words,
 * with how many and what part of the whole, so nobody depends on colors. */
export function DonutChart({ title, slices, percent, centerLabel, size = 196 }: DonutChartProps) {
  const titleId = useId();
  const radius = (size - STROKE) / 2;
  const length = 2 * Math.PI * radius;
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const shown = slices.filter((slice) => slice.value > 0);
  // The round ends grow past each piece, so the gap makes room for them.
  const gap = shown.length > 1 ? STROKE + 4 : 0;

  // Each piece starts where the ones before it ended.
  const parts = shown.map((slice) => (slice.value / total) * length);
  const arcs = shown.map((slice, index) => {
    const start = parts.slice(0, index).reduce((sum, part) => sum + part, 0);
    return { ...slice, index, dash: Math.max(parts[index] - gap, 0.01), offset: -(start + gap / 2) };
  });

  return (
    <figure className={styles.donut} aria-labelledby={titleId}>
      <figcaption id={titleId} className={styles.chartTitle}>
        {title}
      </figcaption>
      <div className={styles.donutBody}>
        <div className={styles.donutGraphic} style={{ width: size, height: size }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="var(--color-iris-pale)"
              strokeWidth={STROKE}
              opacity={0.55}
            />
            {arcs.map((arc) => (
              <circle
                key={arc.label}
                className={styles.donutArc}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={arc.color}
                strokeWidth={STROKE}
                strokeLinecap={gap ? "round" : "butt"}
                strokeDashoffset={arc.offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={
                  {
                    "--dash": `${arc.dash}px`,
                    "--length": `${length}px`,
                    "--order": arc.index,
                  } as CSSProperties
                }
              />
            ))}
          </svg>
          <span className={styles.donutCenter} aria-hidden="true">
            <strong>
              <CountUp value={percent} suffix=" %" />
            </strong>
            {centerLabel && <span>{centerLabel}</span>}
          </span>
        </div>
        <ul className={styles.legend}>
          {slices.map((slice) => {
            const part = total ? Math.round((100 * slice.value) / total) : 0;
            return (
              <li key={slice.label}>
                <span className={styles.swatch} style={{ background: slice.color }} aria-hidden="true" />
                <span className={styles.legendLabel}>{slice.label}</span>
                <strong className={styles.legendValue}>{slice.value}</strong>
                <span className={styles.legendPart}>{part} %</span>
              </li>
            );
          })}
        </ul>
      </div>
    </figure>
  );
}
