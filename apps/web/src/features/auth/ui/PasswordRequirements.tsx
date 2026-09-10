import { IconCheck, IconInfo } from "@/shared/ui/icons";
import styles from "./Fields.module.css";

interface Requirement {
  label: string;
  test: (password: string) => boolean;
}

const REQUIREMENTS: Requirement[] = [
  { label: "Al menos 8 caracteres", test: (password) => password.length >= 8 },
  { label: "Una letra mayúscula", test: (password) => /[A-Z]/.test(password) },
  { label: "Una letra minúscula", test: (password) => /[a-z]/.test(password) },
  { label: "Un número", test: (password) => /[0-9]/.test(password) },
  { label: "Un símbolo (ej. !@#$%)", test: (password) => /[^A-Za-z0-9]/.test(password) },
];

/** Used by the registration forms to gate submission, so the checklist
 * below isn't just a suggestion the person can ignore. */
export function passwordMeetsRequirements(password: string): boolean {
  return REQUIREMENTS.every((requirement) => requirement.test(password));
}

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
        {REQUIREMENTS.map((requirement) => {
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
