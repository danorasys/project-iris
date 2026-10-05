import { initials } from "@/features/utils/initials";
import styles from "./ProfileSection.module.css";

interface ProfileHeroProps {
  firstName: string;
  lastName: string;
  /** The pill next to the email: the relationship with the kid, or "Docente". */
  role: string;
  email: string;
}

/** The header of Mi perfil, the same for the guardian and the teacher: the
 * initials in a big circle, the name, and below it the role and the email.
 * It gets the saved data, not what is being typed. */
export function ProfileHero({ firstName, lastName, role, email }: ProfileHeroProps) {
  return (
    <header className={styles.hero}>
      <span className={styles.avatar} aria-hidden="true">
        {initials(firstName, lastName)}
      </span>
      <div className={styles.heroText}>
        <p className={styles.eyebrow}>Mi perfil</p>
        <h1 className={styles.name}>
          {firstName} {lastName}
        </h1>
        <p className={styles.heroMeta}>
          <span className={styles.chip}>{role}</span>
          <span className={styles.heroEmail}>{email}</span>
        </p>
      </div>
    </header>
  );
}
