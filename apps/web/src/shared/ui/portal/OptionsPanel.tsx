import type { ComponentType, ReactNode, SVGProps } from "react";
import { IconArrowRight } from "@/shared/ui/icons";
import styles from "./OptionsPanel.module.css";

// The options of a space as a list, the same in a kid's space, in a class of
// the kid and in a class of the teacher: a white panel with a small gray
// title and a row per option, one under the other, split by thin lines.

export interface OptionItem<Id extends string> {
  id: Id;
  title: string;
  hint: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Something on the right of the row, like how many are unread. */
  extra?: ReactNode;
  /** What a screen reader hears, when it isn't just the title and hint. */
  label?: string;
}

export function OptionsPanel<Id extends string>({
  titleId,
  title,
  options,
  onPick,
  heading: Heading = "h2",
  children,
}: {
  titleId: string;
  title: string;
  options: OptionItem<Id>[];
  onPick: (id: Id) => void;
  /** h3 when the panel is inside a section that already has its h2. */
  heading?: "h2" | "h3";
  /** Notes between the title and the rows, like "this class is archived". */
  children?: ReactNode;
}) {
  return (
    <nav className={styles.optionsPanel} aria-labelledby={titleId}>
      <Heading id={titleId} className={styles.optionsTitle}>
        {title}
      </Heading>
      {children}
      <ul className={styles.optionList}>
        {options.map(({ id, title: name, hint, Icon, extra, label }) => (
          <li key={id}>
            <button
              type="button"
              className={styles.optionRow}
              aria-label={label ?? `${name}. ${hint}`}
              onClick={() => onPick(id)}
            >
              <span className={styles.optionIcon} aria-hidden="true">
                <Icon width={20} height={20} />
              </span>
              <span className={styles.optionText}>
                <span className={styles.optionTitle}>{name}</span>
                <span className={styles.optionHint}>{hint}</span>
              </span>
              {extra}
              <IconArrowRight width={18} height={18} className={styles.optionArrow} />
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
