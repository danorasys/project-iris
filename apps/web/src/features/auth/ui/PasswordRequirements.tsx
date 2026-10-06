import { IconCheck, IconInfo } from "@/shared/ui/icons";
import { PASSWORD_REQUIREMENTS } from "./passwordRules";
import styles from "./Fields.module.css";

/** Live checklist of password requirements, a visible note next to any
 * field that defines a new password, with each requirement marking
 * itself as met while the person types. This way they get real-time
 * feedback instead of a rejection after submitting. */
export function PasswordRequirements({ password }: { password: string }) {
  return (
    <div className={styles.passwordRequirements}>
      <p className={styles.passwordRequirementsNote}>
        <IconInfo className={styles.passwordRequirementsIcon} />
        Tu contraseña debe cumplir estos requisitos:
      </p>
      <ul className={styles.passwordRequirementsList}>
        {PASSWORD_REQUIREMENTS.map((requirement) => {
          const met = requirement.test(password);
          return (
            <li key={requirement.label} className={met ? styles.requirementMet : styles.requirementPending}>
              {met ? (
                <IconCheck className={styles.requirementIcon} />
              ) : (
                <span className={styles.requirementDot} aria-hidden="true" />
              )}
              {requirement.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
