import logoIris from "@/assets/landing/logo-iris.png";
import styles from "./TotpSuccessScreen.module.css";

interface TotpSuccessScreenProps {
  guardianFirstName: string;
  onContinue: () => void;
}

/** Shown right after TotpSetupScreen's verify() succeeds — the 2FA
 * equivalent of RegistrationSuccessScreen, reusing the same celebratory
 * beat (mascot lands, badge pops, bubble explains, button appears) but with
 * a padlock swinging shut instead of a checkmark being drawn, since what
 * just happened here is "your account got locked down", not "a record got
 * created". Hands off to `/guardian/portal`, not back into the wizard —
 * this screen is the last thing the registration flow shows. */
export function TotpSuccessScreen({ guardianFirstName, onContinue }: TotpSuccessScreenProps) {
  return (
    <div className={styles.page} role="status">
      <div className={styles.stage}>
        <svg className={styles.badge} viewBox="0 0 120 120" aria-hidden="true">
          <rect className={styles.badgeSquare} x="8" y="8" width="104" height="104" rx="28" />
          <rect className={styles.lockBody} x="36" y="58" width="48" height="40" rx="8" />
          <circle className={styles.lockKeyhole} cx="60" cy="75" r="5" />
          <rect className={styles.lockKeyholeSlot} x="57" y="77" width="6" height="11" rx="2" />
          <path className={styles.lockShackle} d="M46 60 V44 a14 14 0 0 1 28 0 V60" />
        </svg>
        <img src={logoIris} alt="" className={styles.mascot} />
      </div>

      <div className={styles.bubble}>
        <p className={styles.headline}>
          ¡Listo, <strong>{guardianFirstName}</strong>! Tu verificación en dos pasos ya quedó activada.
        </p>
        <p>
          De ahora en adelante, cada vez que quieras ingresar al Portal de Padres, IRIS te pedirá el código de tu
          aplicación autenticadora además de tu contraseña, así tu cuenta y la información de tu hijo o hija
          quedan mejor protegidas.
        </p>
        <p>¡Y hablando del Portal de Padres, vamos a llevarte allá!</p>
      </div>

      <button type="button" className={styles.continueButton} onClick={onContinue}>
        Continuar
      </button>
    </div>
  );
}
