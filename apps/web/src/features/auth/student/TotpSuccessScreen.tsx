import type { TwoFactorAccount } from "@/shared/api/hooks/useAuthApi";
import logoIris from "@/assets/landing/logo-iris.png";
import styles from "./TotpSuccessScreen.module.css";

interface TotpSuccessScreenProps {
  firstName: string;
  /** Whose 2FA was just turned on, it changes what the mascot says. */
  account?: TwoFactorAccount;
  onContinue: () => void;
}

const DETAILS: Record<TwoFactorAccount, { why: string; next: string }> = {
  guardian: {
    why: "De ahora en adelante, cada vez que quieras ingresar al Portal de Padres, IRIS te pedirá el código de tu aplicación autenticadora además de tu contraseña, así tu cuenta y la información de tu hijo o hija quedan mejor protegidas.",
    next: "¡Y hablando del Portal de Padres, vamos a llevarte allá!",
  },
  teacher: {
    why: "De ahora en adelante, cada vez que inicies sesión, IRIS te pedirá el código de tu aplicación autenticadora además de tu contraseña, así tu cuenta queda mejor protegida.",
    next: "¡Ahora sí, vamos a llevarte a tu panel docente!",
  },
};

/** After the 2FA is turned on: like RegistrationSuccessScreen, but with a
 * padlock closing instead of a check. Then on to the portal or the panel. */
export function TotpSuccessScreen({ firstName, account = "guardian", onContinue }: TotpSuccessScreenProps) {
  const details = DETAILS[account];
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
          ¡Listo, <strong>{firstName}</strong>! Tu verificación en dos pasos ya quedó activada.
        </p>
        <p>{details.why}</p>
        <p>{details.next}</p>
      </div>

      <button type="button" className={styles.continueButton} onClick={onContinue}>
        Continuar
      </button>
    </div>
  );
}
