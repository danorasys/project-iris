import type { CSSProperties, ReactNode } from "react";
import { initials } from "@/features/utils/initials";
import styles from "./ProfileSection.module.css";

interface ProfileBannerProps {
  /** Small and blue above the name, like "Mi perfil". */
  eyebrow: string;
  name: string;
  /** What hangs from the band: the initials, or a kid's avatar. */
  avatar: ReactNode;
  /** The line under the name: pills and the like. */
  children?: ReactNode;
  /** Paints the band with this color ("#rrggbb"), like a kid's avatar. */
  color?: string;
}

/** A profile banner, like the one of Horizon UI: a light sky band inside a
 * white card, the avatar hanging from it, the name, and a line of details.
 * Mi perfil and each kid's space use it. */
export function ProfileBanner({ eyebrow, name, avatar, children, color }: ProfileBannerProps) {
  return (
    <header
      className={styles.hero}
      data-colored={color ? "true" : undefined}
      style={color ? ({ "--banner-color": color } as CSSProperties) : undefined}
    >
      <span className={styles.heroBanner} aria-hidden="true" />
      <div className={styles.heroRow}>
        <span className={styles.avatar} aria-hidden="true">
          {avatar}
        </span>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1 className={styles.name}>{name}</h1>
          {children && <p className={styles.heroMeta}>{children}</p>}
        </div>
      </div>
    </header>
  );
}

interface ProfileHeroProps {
  firstName: string;
  lastName: string;
  /** The pill next to the email: the relationship with the kid, or "Docente". */
  role: string;
  email: string;
}

/** The header of Mi perfil, the same for the guardian and the teacher: the
 * initials hanging from the band, the name, and below it the role and the
 * email. It gets the saved data, not what is being typed. */
export function ProfileHero({ firstName, lastName, role, email }: ProfileHeroProps) {
  return (
    <ProfileBanner eyebrow="Mi perfil" name={`${firstName} ${lastName}`} avatar={initials(firstName, lastName)}>
      <span className={styles.chip}>{role}</span>
      <span className={styles.heroEmail}>{email}</span>
    </ProfileBanner>
  );
}
