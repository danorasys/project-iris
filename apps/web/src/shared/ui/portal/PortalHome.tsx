import type { ComponentType, ReactNode, SVGProps } from "react";
import { IconArrowRight } from "@/shared/ui/icons";
import styles from "./PortalHome.module.css";

// The pieces both "Inicio" share (Portal Docente and Portal de Padres):
// a count with its icon, a white panel with a title, an empty state, the
// lists of "Para tener en cuenta" and of tips, and the grey bars shown
// while a list loads.

type HomeIcon = ComponentType<SVGProps<SVGSVGElement>>;

interface StatProps {
  label: string;
  value: number;
  Icon: HomeIcon;
  loading: boolean;
}

export function Stat({ label, value, Icon, loading }: StatProps) {
  return (
    <div className={styles.stat}>
      <span className={styles.statIcon} aria-hidden="true">
        <Icon width={22} height={22} />
      </span>
      <div className={styles.statBody}>
        <p className={styles.statLabel}>{label}</p>
        {loading ? (
          <span className={`${styles.skeleton} ${styles.skeletonNumber}`} aria-hidden="true" />
        ) : (
          <p className={styles.statValue}>{value.toLocaleString("es-CO")}</p>
        )}
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
  /** Extra classes, like its place in the grid of Inicio. */
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
  Icon: HomeIcon;
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

/** One thing worth a look in "Para tener en cuenta". */
export interface HomeTask {
  key: string;
  text: string;
  hint: string;
  Icon: HomeIcon;
  onOpen: () => void;
}

// Each one a row that opens what it's about, its icon in the IRIS blue.
export function TaskList({ tasks }: { tasks: HomeTask[] }) {
  return (
    <ul className={styles.tasks}>
      {tasks.map(({ key, text, hint, Icon, onOpen }) => (
        <li key={key}>
          <button type="button" className={styles.task} onClick={onOpen}>
            <span className={`${styles.taskIcon} ${styles.blue}`} aria-hidden="true">
              <Icon width={18} height={18} />
            </span>
            <span className={styles.taskText}>
              <span className={styles.taskTitle}>{text}</span>
              <span className={styles.taskHint}>{hint}</span>
            </span>
            <IconArrowRight width={16} height={16} className={styles.chevron} />
          </button>
        </li>
      ))}
    </ul>
  );
}

export interface HomeTip {
  title: string;
  text: string;
  Icon: HomeIcon;
}

// The four tips of the panel under the main list, two by two.
export function TipList({ tips }: { tips: HomeTip[] }) {
  return (
    <ul className={styles.tips}>
      {tips.map(({ title, text, Icon }) => (
        <li key={title} className={styles.tip}>
          <span className={styles.tipIcon} aria-hidden="true">
            <Icon width={20} height={20} />
          </span>
          <span className={styles.tipText}>
            <span className={styles.tipTitle}>{title}</span>
            <span className={styles.tipHint}>{text}</span>
          </span>
        </li>
      ))}
    </ul>
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
