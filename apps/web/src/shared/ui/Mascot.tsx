import type { ReactNode } from "react";
import logoIris from "@/assets/landing/logo-iris.png";
import styles from "./Mascot.module.css";

export type MascotMood = "happy" | "cheering" | "thinking" | "celebrating";

interface MascotProps {
  mood?: MascotMood;
  children?: ReactNode;
  size?: "medium" | "large";
  /** The bubble fills the row, for wide spots like a dialog. */
  wide?: boolean;
}

/** IRIS's own logo, used as the guiding mascot throughout the student
 * experience (calibration, lessons, activities), the same image and
 * speech-bubble treatment already used in the registration confirmation
 * screens. Replaces the earlier CSS-drawn fox character. */
export function Mascot({ mood = "happy", children, size = "medium", wide = false }: MascotProps) {
  return (
    <div className={`${styles.container} ${styles[size]}${wide ? ` ${styles.wide}` : ""}`}>
      <span className={`${styles.logoWrap} ${styles[size]}`} role="img" aria-label={`IRIS, ${mood}`}>
        <img src={logoIris} alt="" className={styles.logo} />
      </span>
      {children && (
        <div className={styles.bubble}>
          <p>{children}</p>
        </div>
      )}
    </div>
  );
}
