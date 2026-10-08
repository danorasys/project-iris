import type { ComponentType, ReactNode, SVGProps } from "react";
import { IconArrowRight } from "@/shared/ui/icons";
import styles from "./PortalHome.module.css";

// The pieces both "Inicio" share (Portal Docente and Portal de Padres):
// a count with its icon, a white panel with a title, an empty state and
// the grey bars shown while a list loads.

interface StatProps {
  label: string;
  value: number;
  /** A small line under the number; the parents' Inicio goes without it. */
  hint?: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  loading: boolean;
  /** The icon goes on a blue gradient when the number needs attention. */
  highlight?: boolean;
}

export function Stat({ label, value, hint, Icon, loading, highlight }: StatProps) {
  return (
    <div className={styles.stat}>
      <span className={`${styles.statIcon} ${highlight ? styles.statIconStrong : ""}`} aria-hidden="true">
        <Icon width={22} height={22} />
      </span>
      <div className={styles.statBody}>
        <p className={styles.statLabel}>{label}</p>
        {loading ? (
          <span className={`${styles.skeleton} ${styles.skeletonNumber}`} aria-hidden="true" />
        ) : (
          <p className={styles.statValue}>{value.toLocaleString("es-CO")}</p>
        )}
        {hint && <p className={styles.statHint}>{loading ? " " : hint}</p>}
      </div>
    </div>
  );
}

export function Panel({
  title,
  action,
  className,
  children,
}: {
  title: string;
  action?: { label: string; onClick: () => void };
  /** Extra class, for a panel that takes the whole row. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={className ? `${styles.panel} ${className}` : styles.panel} aria-label={title}>
      <header className={styles.panelHead}>
        <h2 className={styles.panelTitle}>{title}</h2>
        {action && (
          <button type="button" className={styles.linkButton} onClick={action.onClick}>
            {action.label}
            <IconArrowRight width={15} height={15} />
          </button>
        )}
      </header>
      {children}
    </section>
  );
}

export function Empty({
  Icon,
  title,
  text,
  done = false,
  children,
}: {
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  /** A second line under the title, when one line isn't enough. */
  text?: string;
  /** Green, for "everything is up to date". */
  done?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <span className={`${styles.emptyIcon} ${done ? styles.emptyIconDone : ""}`} aria-hidden="true">
        <Icon width={22} height={22} />
      </span>
      <p className={styles.emptyTitle}>{title}</p>
      {text && <p className={styles.emptyText}>{text}</p>}
      {children}
    </div>
  );
}

// Grey bars where the rows will go, while they load.
export function RowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className={styles.skeletonRows} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className={`${styles.skeleton} ${styles.skeletonRow}`} />
      ))}
    </div>
  );
}
