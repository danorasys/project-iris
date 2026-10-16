import type { ComponentType, CSSProperties, SVGProps } from "react";
import { CountUp } from "@/shared/ui/charts/CountUp";
import { IconArrowRight } from "@/shared/ui/icons";
import { StudentAvatarImage } from "@/shared/ui/StudentAvatarImage";
import { fullName } from "./statisticsView";
import styles from "./StatisticsPanel.module.css";

interface Kid {
  student_id: string;
  first_name: string;
  last_name: string;
  avatar_id: number;
}

/** A kid as the teacher tells them apart: their avatar and full name, and
 * a short note under the name if there is one. */
export function KidIdentity({ kid, note }: { kid: Kid; note?: string }) {
  return (
    <span className={styles.kid}>
      {/* The box keeps its place while the avatars arrive. */}
      <span className={styles.kidAvatar}>
        <StudentAvatarImage avatarId={kid.avatar_id} size="tiny" label="" />
      </span>
      <span className={styles.kidText}>
        <span className={styles.kidName}>{fullName(kid)}</span>
        {note && <span className={styles.kidNote}>{note}</span>}
      </span>
    </span>
  );
}

export interface KidProgress {
  kid: Kid;
  /** 0 to 100. */
  percent: number;
  /** A short note under the name, like "2 completadas". */
  note?: string;
  /** Their place in the class, best first (1, 2, 3…). */
  rank?: number;
}

/** One row per kid with their place, avatar, full name, a bar that grows
 * when it appears and the percent. With onSelect each row opens that kid's
 * results. */
export function KidProgressList({
  items,
  onSelect,
}: {
  items: KidProgress[];
  onSelect?: (studentId: string) => void;
}) {
  return (
    <ul className={styles.kidRows}>
      {items.map(({ kid, percent, note, rank }, index) => {
        const name = fullName(kid);
        const content = (
          <>
            {rank !== undefined && (
              <span className={styles.rank} data-top={rank <= 3 ? rank : undefined} aria-hidden="true">
                {rank}
              </span>
            )}
            <KidIdentity kid={kid} note={note} />
            <span
              className={styles.kidTrack}
              role="progressbar"
              aria-label={name}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <span style={{ width: `${percent}%`, "--order": index } as CSSProperties} />
            </span>
            <span className={styles.kidValue}>
              <CountUp value={percent} suffix=" %" />
            </span>
            {onSelect && <IconArrowRight width={18} height={18} aria-hidden="true" className={styles.kidArrow} />}
          </>
        );
        return (
          <li key={kid.student_id}>
            {onSelect ? (
              <button
                type="button"
                className={`${styles.kidRow} ${styles.kidButton}`}
                data-ranked={rank !== undefined}
                onClick={() => onSelect(kid.student_id)}
                aria-label={`Ver los resultados de ${name}: ${percent} %`}
              >
                {content}
              </button>
            ) : (
              <div className={styles.kidRow} data-ranked={rank !== undefined}>
                {content}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** A number with what it means under it, in a white card with its icon on
 * a pale tile like the options of the class; the number counts up when it
 * appears. "3 de 4" when it has `of`, "75 %" with a "%" suffix. */
export function Kpi({
  Icon,
  value,
  of,
  suffix = "",
  label,
  order = 0,
}: {
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  value: number;
  of?: number;
  suffix?: string;
  label: string;
  /** Its place in the row, so the cards come in one after the other. */
  order?: number;
}) {
  return (
    <div className={`${styles.kpi} ${styles.rise}`} style={{ "--order": order } as CSSProperties}>
      <span className={styles.kpiIcon} aria-hidden="true">
        <Icon width={20} height={20} />
      </span>
      <span className={styles.kpiText}>
        <span className={styles.kpiValue}>
          <CountUp value={value} suffix={suffix} />
          {of !== undefined && <span className={styles.kpiOf}> de {of}</span>}
        </span>
        <span className={styles.kpiLabel}>{label}</span>
      </span>
    </div>
  );
}
