import type { ReactNode } from "react";
import styles from "./ComingSoonSection.module.css";

interface ComingSoonSectionProps {
  icon: ReactNode;
  title: string;
  text: string;
}

/** Placeholder for the parts of the parents' portal that are not built yet
 * (notificaciones, and clases beyond what mis peques already shows). It's
 * a real, reachable screen that is honest about not being ready, instead
 * of being hidden or filled with fake sample data. */
export function ComingSoonSection({ icon, title, text }: ComingSoonSectionProps) {
  return (
    <div className={styles.section}>
      <div className={styles.icon}>{icon}</div>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.text}>{text}</p>
    </div>
  );
}
