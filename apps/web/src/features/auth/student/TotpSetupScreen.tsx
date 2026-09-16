import { useEffect, useRef, useState } from "react";
import stepInstall from "@/assets/auth/totp-guide/step-1-install.png";
import stepWelcome from "@/assets/auth/totp-guide/step-2-welcome.png";
import stepWelcomeChoice from "@/assets/auth/totp-guide/step-3-welcome-choice.png";
import stepAddCode from "@/assets/auth/totp-guide/step-4-add-code.png";
import stepScanQr from "@/assets/auth/totp-guide/step-5-scan-qr.png";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { IrisMark } from "@/shared/ui/IrisMark";
import { IconLock } from "@/shared/ui/icons";
import { LoadingScreen } from "@/shared/ui/LoadingScreen";
import { OtpCodeInput } from "@/features/auth/ui/OtpCodeInput";
import { useConfigurarTotp, useVerificarTotp } from "@/shared/api/hooks/useAuthApi";
import styles from "./GuardianRegistrationWizard.module.css";

interface TotpSetupScreenProps {
  onVerified: () => void;
}

/** Shown right after RegistrationSuccessScreen, before handing off to the
 * student's own session: the tutor sets up 2FA for the (still unbuilt)
 * Portal de Padres. Generates a fresh QR on mount, then requires one real
 * code from the tutor's own authenticator app before 2FA actually turns on
 * — see identity-service's TotpService.setup vs .verify for why enabling it
 * isn't automatic just because a QR was shown.
 *
 * The step-by-step below uses Google Authenticator on Android as a concrete
 * example (screenshots included), since "install an authenticator app" is
 * abstract for a guardian who has never used one — the app, IRIS's QR and
 * the 6-digit code itself work the same with Microsoft Authenticator, Authy
 * or any other TOTP app. */
export function TotpSetupScreen({ onVerified }: TotpSetupScreenProps) {
  const setup = useConfigurarTotp();
  const verify = useVerificarTotp();
  const [code, setCode] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  // Bumped on every failed attempt to remount OtpCodeInput: clears the boxes
  // and refocuses the first one, since a rejected code is either wrong or
  // has already expired (it rotates every 30s) — asking the guardian to
  // retype the freshest one beats leaving a known-bad code sitting there.
  const [attempt, setAttempt] = useState(0);

  const hasStartedSetup = useRef(false);
  useEffect(() => {
    if (hasStartedSetup.current) return;
    hasStartedSetup.current = true;
    setup.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitCode(candidate: string) {
    setVerifyError(null);
    try {
      await verify.mutateAsync({ code: candidate });
      onVerified();
    } catch (error) {
      setVerifyError(getAuthErrorMessage(error));
      setCode("");
      setAttempt((value) => value + 1);
    }
  }

  if (setup.isPending || setup.isIdle) {
    return <LoadingScreen message="Preparando tu verificación en dos pasos" />;
  }

  return (
    <main className={styles.page}>
      <IrisMark size={420} className={`${styles.ring} ${styles.ringLarge}`} />
      <IrisMark size={150} className={`${styles.ring} ${styles.ringBottomLeft}`} />
      <IrisMark size={420} className={`${styles.ring} ${styles.ringTopLeft}`} />
      <IrisMark size={150} className={`${styles.ring} ${styles.ringTopRight}`} />
      <div className={styles.card}>
        <h1 className={styles.title}>Configura tu verificación en dos pasos</h1>

        <p className={styles.subtitle}>
          Ahora vamos a establecer la verificación en dos pasos (2FA) para tu cuenta, que usarás cada vez que
          ingreses al Portal de Padres. Esto añade una capa extra de seguridad, además de tu contraseña.
        </p>

        <div className={styles.notice}>
          <IconLock className={styles.noticeIcon} />
          <div>
            <p className={styles.noticeHeading}>Sigue estos pasos:</p>
            <p className={styles.noticeText}>
              Te mostramos el ejemplo con Google Authenticator en un celular Android. Si usas iPhone, u otra
              aplicación como Microsoft Authenticator o Authy, los pasos son muy parecidos.
            </p>

            <ol className={styles.totpSteps}>
              <li>
                <p>
                  Abre la tienda de aplicaciones de tu celular (Play Store en Android, App Store en iPhone) y
                  busca «Google Authenticator». Tócala e instálala.
                </p>
                <img src={stepInstall} alt="Pantalla de la Play Store lista para instalar Google Authenticator" className={styles.totpStepImage} />
              </li>
              <li>
                <p>Abre la aplicación ya instalada. Puedes leer la breve introducción y, cuando estés listo, tocar «Comenzar».</p>
                <img src={stepWelcome} alt="Pantalla de bienvenida de Google Authenticator con el botón Comenzar" className={styles.totpStepImage} />
              </li>
              <li>
                <p>
                  A continuación te preguntará cómo quieres continuar: iniciar sesión con tu cuenta de Google, o
                  tocar «Usar sin una cuenta» si prefieres no vincularla. Cualquiera de las dos opciones funciona
                  igual de bien con IRIS.
                </p>
                <img
                  src={stepWelcomeChoice}
                  alt="Pantalla de bienvenida de Google Authenticator con las opciones para continuar con una cuenta de Google o sin ella"
                  className={styles.totpStepImage}
                />
              </li>
              <li>
                <p>Toca el botón «Agregar un código» (o el ícono «+» si ya tienes otras cuentas registradas).</p>
                <img src={stepAddCode} alt="Pantalla de Google Authenticator con el botón Agregar un código" className={styles.totpStepImage} />
              </li>
              <li>
                <p>Elige la opción «Escanear un código QR».</p>
                <img src={stepScanQr} alt="Pantalla de Google Authenticator con la opción Escanear un código QR" className={styles.totpStepImage} />
              </li>
              <li>
                <p>Apunta la cámara de tu celular al siguiente código QR para vincular tu cuenta con IRIS:</p>
                {setup.isError && (
                  <div className={styles.notice}>
                    <p role="alert" className={styles.error}>
                      No pudimos generar tu código QR. Verifica tu conexión e intenta de nuevo.
                    </p>
                    <button type="button" className={styles.primaryButton} onClick={() => setup.mutate()}>
                      Reintentar
                    </button>
                  </div>
                )}
                {setup.isSuccess && (
                  <>
                    <div className={styles.totpQrWrap}>
                      <img
                        src={setup.data.qr_code_data_uri}
                        alt="Código QR para configurar tu aplicación autenticadora con IRIS"
                        className={styles.totpQr}
                      />
                    </div>
                    <p className={styles.totpManualKeyHint}>
                      ¿No puedes escanear el código? Ingresa esta clave manualmente en tu aplicación:
                    </p>
                    <p className={styles.totpManualKeyBox}>{setup.data.manual_entry_key}</p>
                  </>
                )}
              </li>
              {setup.isSuccess && (
                <li>
                  <p>
                    Google Authenticator agregará la cuenta y empezará a mostrarte un código de 6 dígitos que
                    cambia cada 30 segundos. Escribe abajo el código más reciente para confirmar que la
                    vinculación quedó correcta; si cambia mientras lo escribes, usa el nuevo que aparezca.
                  </p>
                  <form
                    className={styles.form}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submitCode(code);
                    }}
                  >
                    <OtpCodeInput
                      key={attempt}
                      id="totp-code"
                      label="Código de 6 dígitos"
                      value={code}
                      onChange={setCode}
                      onComplete={(value) => void submitCode(value)}
                      error={verifyError ?? undefined}
                      disabled={verify.isPending}
                      autoFocus={attempt > 0}
                    />
                    <button
                      type="submit"
                      className={styles.primaryButton}
                      disabled={code.length !== 6 || verify.isPending}
                    >
                      {verify.isPending ? "Verificando…" : "Verificar y continuar"}
                    </button>
                  </form>
                </li>
              )}
            </ol>
          </div>
        </div>
      </div>
    </main>
  );
}
