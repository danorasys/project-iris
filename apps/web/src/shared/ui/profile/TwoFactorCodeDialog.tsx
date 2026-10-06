import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "@/shared/api/httpClient";
import { useAuth } from "@/shared/auth/useAuth";
import { useCountdown } from "@/shared/hooks/useCountdown";
import { formatClock, getAuthErrorMessage, getRetryAfterSeconds } from "@/features/auth/errors";
import { OtpCodeInput } from "@/features/auth/ui/OtpCodeInput";
import { IconLock } from "@/shared/ui/icons";
import { IconAuthyLogo } from "@/shared/ui/authAppLogos";
import googleAuthenticatorIcon from "@/assets/auth/authenticator-apps/google-authenticator.jpg";
import microsoftAuthenticatorIcon from "@/assets/auth/authenticator-apps/microsoft-authenticator.jpg";
import styles from "./TwoFactorCodeDialog.module.css";

interface TwoFactorCodeDialogProps {
  title: string;
  text: string;
  /** Sends the code. Resolving means it was accepted and the caller is done. */
  onSubmit: (code: string) => Promise<void>;
  onCancel: () => void;
  /** Errors that are not about the code (a wrong current password, for
   * example). Without it they show inside the dialog. */
  onOtherError?: (error: unknown) => void;
}

/** A floating dialog that asks for the 6 digit code of the authenticator
 * app. It takes care of what is the same everywhere: a wrong code, the wait
 * after too many tries, and the session the server closed for security. */
export function TwoFactorCodeDialog({ title, text, onSubmit, onCancel, onOtherError }: TwoFactorCodeDialogProps) {
  const navigate = useNavigate();
  const { discardSession } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // Changes after a failed attempt to remount the boxes, which clears them
  // and puts the focus back on the first one.
  const [attempt, setAttempt] = useState(0);
  const { remaining: waitSeconds, start: startWait } = useCountdown();
  const blocked = waitSeconds > 0;

  // Esc closes the dialog, like any other dialog.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  async function submitCode(candidate: string) {
    if (candidate.length !== 6 || sending || blocked) return;
    setError(null);
    setSending(true);
    try {
      await onSubmit(candidate);
    } catch (err) {
      if (err instanceof ApiError && err.code === "sesion_cerrada_por_seguridad") {
        // The server already closed this session, so only the local copy is dropped.
        onCancel();
        discardSession();
        navigate("/login/adult", { replace: true, state: { aviso: getAuthErrorMessage(err) } });
        return;
      }
      const wait = getRetryAfterSeconds(err);
      const aboutTheCode = err instanceof ApiError && err.code === "codigo_totp_invalido";
      if (wait !== null) {
        setError(null);
        startWait(wait);
      } else if (aboutTheCode || !onOtherError) {
        setError(getAuthErrorMessage(err));
      } else {
        onOtherError(err);
        return;
      }
      setCode("");
      setAttempt((current) => current + 1);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles.backdrop}>
      <div className={styles.card} role="dialog" aria-modal="true" aria-labelledby="two-factor-dialog-title">
        <span className={styles.iconBadge}>
          <IconLock width={26} height={26} />
        </span>
        <h2 id="two-factor-dialog-title" className={styles.title}>
          {title}
        </h2>
        <p className={styles.text}>{text}</p>
        {/* The same apps shown when 2FA is set up and at the portal's door. */}
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
        <OtpCodeInput
          key={attempt}
          id="two-factor-dialog-code"
          label="Código de 6 dígitos"
          value={code}
          onChange={setCode}
          onComplete={(value) => void submitCode(value)}
          error={blocked ? "Demasiados intentos. Espera para volver a intentarlo." : (error ?? undefined)}
          disabled={sending || blocked}
          autoFocus
        />
        {blocked && (
          <p className={styles.wait}>
            Podrás intentarlo de nuevo en <strong>{formatClock(waitSeconds)}</strong>
          </p>
        )}
        <div className={styles.buttons}>
          <button type="button" className={styles.cancelButton} onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
