import type { ReactNode } from "react";
import logoIris from "@/assets/landing/logo-iris.png";
import styles from "./RegistrationSuccessScreen.module.css";

interface RegistrationSuccessScreenProps {
  /** What the bubble says, each wizard writes its own (guardian or teacher). */
  children: ReactNode;
  onContinue: () => void;
}

/** Shown once the account already exists. It creates nothing, it only
 * celebrates, and it waits for "Continuar" instead of moving on by itself. */
export function RegistrationSuccessScreen({ children, onContinue }: RegistrationSuccessScreenProps) {
  return (
    <div className={styles.page} role="status">
      <div className={styles.stage}>
        <svg className={styles.badge} viewBox="0 0 120 120" aria-hidden="true">
          <rect className={styles.badgeSquare} x="8" y="8" width="104" height="104" rx="28" />
          <path className={styles.badgeCheck} d="M35 62 L53 80 L87 42" />
        </svg>
        <img src={logoIris} alt="" className={styles.mascot} />
      </div>

      <div className={styles.bubble}>{children}</div>

      <button type="button" className={styles.continueButton} onClick={onContinue}>
        Continuar
      </button>
    </div>
  );
}
