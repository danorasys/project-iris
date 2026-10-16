import type { ComponentType, ReactNode, SVGProps } from "react";
import styles from "./SectionOverview.module.css";

// The card on top of a part of a class, the same for the family and for the
// teacher: its icon on a lavender circle, a title, a line with the numbers
// and, if it helps, what each thing below tells, in pale columns.

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export interface OverviewGuide {
  title: string;
  Icon: Icon;
  items: { key: string; Icon: Icon; text: ReactNode }[];
}

export function SectionOverview({
  titleId,
  Icon,
  title,
  text,
  action,
  guides = [],
}: {
  titleId: string;
  Icon: Icon;
  title: string;
  text: ReactNode;
  /** A button on the right, like "Nueva unidad". */
  action?: ReactNode;
  guides?: OverviewGuide[];
}) {
  return (
    <section className={styles.overview} aria-labelledby={titleId}>
      <header className={styles.head}>
        <span className={styles.icon} aria-hidden="true">
          <Icon width={22} height={22} />
        </span>
        <div className={styles.headText}>
          <h3 id={titleId} className={styles.title}>
            {title}
          </h3>
          <p className={styles.text}>{text}</p>
        </div>
        {action}
      </header>

      {guides.length > 0 && (
        <div className={styles.guides}>
          {guides.map(({ title: guideTitle, Icon: GuideIcon, items }) => (
            <div key={guideTitle} className={styles.guide}>
              <p className={styles.guideTitle}>
                <GuideIcon width={16} height={16} aria-hidden="true" />
                {guideTitle}
              </p>
              <ul className={styles.guideList}>
                {items.map(({ key, Icon: ItemIcon, text: itemText }) => (
                  <li key={key}>
                    <ItemIcon width={16} height={16} aria-hidden="true" />
                    {itemText}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
