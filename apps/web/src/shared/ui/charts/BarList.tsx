import styles from "./charts.module.css";

export interface BarItem {
  key: string;
  label: string;
  /** 0 to 100. */
  percent: number;
  /** A short note after the percent, like "2 lecciones completadas". */
  note?: string;
}

interface BarListProps {
  title: string;
  items: BarItem[];
}

/** Horizontal bars, one per row, with the name and the percent written next
 * to each one. Each bar is a progressbar, so it's read as a number too. */
export function BarList({ title, items }: BarListProps) {
  return (
    <section className={styles.bars} aria-label={title}>
      <h3 className={styles.chartTitle}>{title}</h3>
      <ul className={styles.barRows}>
        {items.map((item) => (
          <li key={item.key} className={styles.barRow}>
            <span className={styles.barLabel}>{item.label}</span>
            <span
              className={styles.barTrack}
              role="progressbar"
              aria-label={item.label}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={item.percent}
            >
              <span className={styles.barFill} style={{ width: `${item.percent}%` }} />
            </span>
            <span className={styles.barValue}>
              {item.percent} %{item.note && <span className={styles.barNote}> · {item.note}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
