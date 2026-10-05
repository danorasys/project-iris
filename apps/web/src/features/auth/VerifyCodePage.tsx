import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "@/shared/api/httpClient";
import { useAuth } from "@/shared/auth/AuthContext";
import { useCountdown } from "@/shared/hooks/useCountdown";
import { formatClock, getAuthErrorMessage, getRetryAfterSeconds } from "@/features/auth/errors";
import { OtpCodeInput } from "@/features/auth/ui/OtpCodeInput";
import { IconArrowLeft, IconInfo, IconLock } from "@/shared/ui/icons";
import { IrisMark } from "@/shared/ui/IrisMark";
import { IconAuthyLogo } from "@/shared/ui/authAppLogos";
import googleAuthenticatorIcon from "@/assets/auth/authenticator-apps/google-authenticator.jpg";
import microsoftAuthenticatorIcon from "@/assets/auth/authenticator-apps/microsoft-authenticator.jpg";
import styles from "./VerifyCodePage.module.css";

interface VerifyCodePageProps {
  /** Where the code takes them, like "para entrar al Portal Padres". */
  purpose: string;
  /** Sends the code. It throws when the server says no. */
  onConfirm: (code: string) => Promise<void>;
  pending: boolean;
  onBack: () => void;
}

/** Asks for a fresh code from the authenticator app, so a session left open
 * on a shared computer can't get in. Used before the parents' portal and
 * before the teacher's panel. Wrong codes lock for a while (with a
 * countdown), and a session locked twice is closed by the server. */
export function VerifyCodePage({ purpose, onConfirm, pending, onBack }: VerifyCodePageProps) {
  const navigate = useNavigate();
  const { discardSession } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Changes after a failed attempt to remount the input, which clears the
  // boxes and puts the focus back on the first one.
  const [attempt, setAttempt] = useState(0);
  const { remaining: waitSeconds, start: startWait } = useCountdown();
  const blocked = waitSeconds > 0;

  async function submitCode(candidate: string) {
    if (candidate.length !== 6 || pending || blocked) return;
    setError(null);
    try {
      await onConfirm(candidate);
    } catch (err) {
      if (err instanceof ApiError && err.code === "sesion_cerrada_por_seguridad") {
        // The server already closed this session, so only the local copy is dropped.
        discardSession();
        navigate("/login/adult", { replace: true, state: { aviso: getAuthErrorMessage(err) } });
        return;
      }
      const wait = getRetryAfterSeconds(err);
      if (wait === null) {
        setError(getAuthErrorMessage(err));
      } else {
        setError(null);
        startWait(wait);
      }
      setCode("");
      setAttempt((current) => current + 1);
    }
  }

  return (
    <main className={styles.page}>
      <IrisMark size={420} className={`${styles.ring} ${styles.ringBottomRight}`} />
      <IrisMark size={150} className={`${styles.ring} ${styles.ringBottomLeft}`} />
      <IrisMark size={420} className={`${styles.ring} ${styles.ringTopLeft}`} />
      <IrisMark size={150} className={`${styles.ring} ${styles.ringTopRight}`} />
      <button type="button" className={styles.back} onClick={onBack}>
        <IconArrowLeft /> Volver
      </button>
      <div className={styles.card}>
        <span className={styles.iconBadge}>
          <IconLock width={32} height={32} className={styles.icon} />
        </span>
        <h1 className={styles.title}>Verifica que eres tú</h1>
        <div className={styles.notice}>
          <IconInfo className={styles.noticeIcon} />
          <p className={styles.noticeText}>
            Por tu seguridad, abre tu aplicación autenticadora, busca el código de 6 dígitos de IRIS y escríbelo aquí
            {` ${purpose}`}. Cambia cada 30 segundos, así que usa el más reciente.
          </p>
        </div>
        <div className={styles.appLogos}>
          <div className={styles.appLogo}>
            <img src={googleAuthenticatorIcon} alt="" className={styles.appLogoIcon} />
            <span>Google Authenticator</span>
          </div>
          <div className={styles.appLogo}>
            <img src={microsoftAuthenticatorIcon} alt="" className={styles.appLogoIcon} />
            <span>Microsoft Authenticator</span>
          </div>
          <div className={styles.appLogo}>
            <IconAuthyLogo className={styles.appLogoIcon} />
            <span>Authy</span>
          </div>
        </div>
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void submitCode(code);
          }}
        >
          <OtpCodeInput
            key={attempt}
            id="verify-2fa-code"
            label="Código de 6 dígitos"
            value={code}
            onChange={setCode}
            onComplete={(value) => void submitCode(value)}
            error={blocked ? "Demasiados intentos. Espera para volver a intentarlo." : (error ?? undefined)}
            disabled={pending || blocked}
            autoFocus
          />
          {blocked && (
            <p className={styles.countdown} role="timer">
              Podrás intentarlo de nuevo en <strong>{formatClock(waitSeconds)}</strong>
            </p>
          )}
          <button type="submit" className={styles.primaryButton} disabled={code.length !== 6 || pending || blocked}>
            {pending ? "Verificando…" : "Continuar"}
          </button>
        </form>
      </div>
    </main>
  );
}
