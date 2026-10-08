import type { ReactNode } from "react";
import { IrisRings } from "@/shared/ui/IrisRings";
import styles from "./WelcomeBanner.module.css";

interface PortalBannerProps {
  /** The name of the banner for screen readers. */
  label: string;
  /** The section's name, small and blue on top, like "Mis peques". */
  eyebrow?: string;
  /** The heading; one word of it goes in <Highlight>. */
  title: ReactNode;
  text?: string;
  /** Small white pills under the title, like "7 perfiles". */
  chips?: string[];
  /** Buttons under the text, like "Nueva clase". */
  actions?: ReactNode;
  /** The section's icon, on the right in the middle of the rings. */
  icon?: ReactNode;
}

/** The banner on top of the portals' sections, with the look of the
 * landing: a light sky card with the rings of the iris turning slowly
 * behind, and the key word of the title in blue with an orange line drawn
 * by hand under it, like "mirada" in the landing's hero. Inicio's welcome
 * is one of these. */
export function PortalBanner({ label, eyebrow, title, text, chips, actions, icon }: PortalBannerProps) {
  return (
    <section className={styles.banner} aria-label={label}>
      <IrisRings className={styles.rings} />

      <div className={styles.body}>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <h1 className={styles.title}>{title}</h1>
        {text && <p className={styles.text}>{text}</p>}
        {chips && chips.length > 0 && (
          <p className={styles.chips}>
            {chips.map((chip) => (
              <span key={chip} className={styles.chip}>
                {chip}
              </span>
            ))}
          </p>
        )}
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>

      {icon && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
    </section>
  );
}

/** The word of a banner's title that goes in blue, underlined by hand. */
export function Highlight({ children }: { children: ReactNode }) {
  return (
    <span className={styles.name}>
      {children}
      <svg className={styles.underline} viewBox="0 0 200 22" preserveAspectRatio="none" aria-hidden="true">
        <path pathLength={1} d="M4 14 C 50 6, 120 4, 196 9" />
        <path pathLength={1} d="M30 19 C 80 13, 130 12, 170 15" />
      </svg>
    </span>
  );
}
