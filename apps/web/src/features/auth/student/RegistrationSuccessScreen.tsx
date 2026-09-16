import logoIris from "@/assets/landing/logo-iris.png";
import styles from "./RegistrationSuccessScreen.module.css";

interface RegistrationSuccessScreenProps {
  guardianFirstName: string;
  studentFirstName: string;
  onContinue: () => void;
}

/** Shown once the guardian, student and consent already exist in
 * identity-service — after `confirmAndCreateAccount`'s POST succeeds, not
 * before. Purely a celebratory hand-off screen: it creates nothing itself,
 * so there's no failure mode here that would leave the account half-made.
 * Stays up until the family taps "Continuar" — no timer moves them along
 * on its own, this is the one screen in the flow they should never feel
 * rushed off of. */
export function RegistrationSuccessScreen({
  guardianFirstName,
  studentFirstName,
  onContinue,
}: RegistrationSuccessScreenProps) {
  return (
    <div className={styles.page} role="status">
      <div className={styles.stage}>
        <svg className={styles.badge} viewBox="0 0 120 120" aria-hidden="true">
          <rect className={styles.badgeSquare} x="8" y="8" width="104" height="104" rx="28" />
          <path className={styles.badgeCheck} d="M35 62 L53 80 L87 42" />
        </svg>
        <img src={logoIris} alt="" className={styles.mascot} />
      </div>

      <div className={styles.bubble}>
        <p className={styles.headline}>
          ¡Felicidades, <strong>{guardianFirstName}</strong> y <strong>{studentFirstName}</strong>! Sus perfiles ya
          quedaron creados dentro de IRIS.
        </p>
        <p>Cada mirada es un paso hacia nuevas formas de aprender. ¡Vamos a comenzar esta aventura juntos!</p>
        <p>
          Ahora, <strong>{guardianFirstName}</strong>, vamos a configurar la autenticación de dos factores
          (2FA) para proteger tu cuenta.
        </p>
      </div>

      <button type="button" className={styles.continueButton} onClick={onContinue}>
        Continuar
      </button>
    </div>
  );
}
