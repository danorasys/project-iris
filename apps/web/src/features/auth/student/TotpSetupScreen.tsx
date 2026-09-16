import { useEffect, useRef, useState, type ReactNode } from "react";
import stepInstall from "@/assets/auth/totp-guide/step-1-install.png";
import stepWelcome from "@/assets/auth/totp-guide/step-2-welcome.png";
import stepWelcomeChoice from "@/assets/auth/totp-guide/step-3-welcome-choice.png";
import stepAddCode from "@/assets/auth/totp-guide/step-4-add-code.png";
import stepScanQr from "@/assets/auth/totp-guide/step-5-scan-qr.png";
import googleAuthenticatorIcon from "@/assets/auth/authenticator-apps/google-authenticator.jpg";
import microsoftAuthenticatorIcon from "@/assets/auth/authenticator-apps/microsoft-authenticator.jpg";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { IrisMark } from "@/shared/ui/IrisMark";
import { IconArrowLeft, IconArrowRight, IconLock, IconBook } from "@/shared/ui/icons";
import { LoadingScreen } from "@/shared/ui/LoadingScreen";
import { OtpCodeInput } from "@/features/auth/ui/OtpCodeInput";
import { useConfigurarTotp, useVerificarTotp } from "@/shared/api/hooks/useAuthApi";
import { IconAuthyLogo } from "@/shared/ui/authAppLogos";
import styles from "./GuardianRegistrationWizard.module.css";

/** Wraps a step's instructions in the same book-icon notice box used on the
 * intro card, so every screen of this walkthrough reads as one consistent
 * instructional voice instead of some steps being a plain paragraph and
 * others a styled box. */
function StepNotice({ children }: { children: ReactNode }) {
  return (
    <div className={styles.notice}>
      <IconBook className={styles.noticeIcon} />
      <div>{children}</div>
    </div>
  );
}

interface TotpSetupScreenProps {
  onVerified: () => void;
}

interface InstructionStep {
  text: string;
  image: string;
  imageAlt: string;
}

// The first five cards are always the same, static walkthrough. The QR and
// verification cards come right after and depend on the setup/verify
// requests below, so they're handled separately instead of living in this
// array.
const INSTRUCTION_STEPS: InstructionStep[] = [
  {
    text: "Abre la tienda de aplicaciones de tu celular (Play Store en Android, App Store en iPhone) y busca «Google Authenticator». Tócala e instálala.",
    image: stepInstall,
    imageAlt: "Pantalla de la Play Store lista para instalar Google Authenticator",
  },
  {
    text: "Abre la aplicación ya instalada. Puedes leer la breve introducción y, cuando estés listo, tocar «Comenzar».",
    image: stepWelcome,
    imageAlt: "Pantalla de bienvenida de Google Authenticator con el botón Comenzar",
  },
  {
    text: "A continuación te preguntará cómo quieres continuar: iniciar sesión con tu cuenta de Google, o tocar «Usar sin una cuenta» si prefieres no vincularla. Cualquiera de las dos opciones funciona igual de bien con IRIS.",
    image: stepWelcomeChoice,
    imageAlt: "Pantalla de bienvenida de Google Authenticator con las opciones para continuar con una cuenta de Google o sin ella",
  },
  {
    text: "Toca el botón «Agregar un código» (o el ícono «+» si ya tienes otras cuentas registradas). Si usas el ícono «+», puedes elegir «Escanear un código QR» de una vez y saltar directo al paso 7.",
    image: stepAddCode,
    imageAlt: "Pantalla de Google Authenticator con el botón Agregar un código",
  },
  {
    text: "Elige la opción «Escanear un código QR».",
    image: stepScanQr,
    imageAlt: "Pantalla de Google Authenticator con la opción Escanear un código QR",
  },
];

// Step 0 is the intro slide below (what 2FA is, and how to move between
// cards), so every other step shifts one position to make room for it.
const INTRO_STEP_INDEX = 0;
const FIRST_INSTRUCTION_STEP_INDEX = 1;
const QR_STEP_INDEX = FIRST_INSTRUCTION_STEP_INDEX + INSTRUCTION_STEPS.length;
const VERIFY_STEP_INDEX = QR_STEP_INDEX + 1;
const TOTAL_STEPS = VERIFY_STEP_INDEX + 1;

/** Shown right after RegistrationSuccessScreen, before handing off to the
 * student's own session: the tutor sets up 2FA for the parents' portal.
 * Generates a fresh QR on mount, then requires one real code from the
 * tutor's own authenticator app before 2FA actually turns on — see
 * identity-service's TotpService.setup vs .verify for why enabling it isn't
 * automatic just because a QR was shown.
 *
 * Laid out as a deck of cards (one step per screen, with a progress bar and
 * prev/next arrows) instead of one long page, since the old version made a
 * guardian scroll past five screenshots before ever seeing the QR code —
 * easy to lose track of which step you were on. Moving between cards only
 * changes local `stepIndex`; the actual setup/verify requests below don't
 * depend on it at all. The very first card explains what 2FA is for and
 * shows what the two nav arrows look like before asking the guardian to use
 * them, since nothing else on screen hints that the setup is spread across
 * several cards.
 *
 * The walkthrough uses Google Authenticator on Android as a concrete
 * example (screenshots included), since "install an authenticator app" is
 * abstract for a guardian who has never used one — the app, IRIS's QR and
 * the 6-digit code itself work the same with Microsoft Authenticator, Authy
 * or any other TOTP app. */
export function TotpSetupScreen({ onVerified }: TotpSetupScreenProps) {
  const setup = useConfigurarTotp();
  const verify = useVerificarTotp();
  const [stepIndex, setStepIndex] = useState(0);
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

  const isQrStep = stepIndex === QR_STEP_INDEX;
  const isVerifyStep = stepIndex === VERIFY_STEP_INDEX;
  const canGoBack = stepIndex > 0;
  // The QR card can't be left until there's actually a QR to move on from —
  // otherwise "Siguiente" would drop the guardian on a verification form
  // with nothing to scan yet.
  const canGoNext = !isVerifyStep && (!isQrStep || setup.isSuccess);

  function goToPreviousStep() {
    setStepIndex((current) => Math.max(0, current - 1));
  }

  function goToNextStep() {
    setStepIndex((current) => Math.min(TOTAL_STEPS - 1, current + 1));
  }

  return (
    <main className={styles.page}>
      <IrisMark size={420} className={`${styles.ring} ${styles.ringLarge}`} />
      <IrisMark size={150} className={`${styles.ring} ${styles.ringBottomLeft}`} />
      <IrisMark size={420} className={`${styles.ring} ${styles.ringTopLeft}`} />
      <IrisMark size={150} className={`${styles.ring} ${styles.ringTopRight}`} />
      <div className={styles.card}>
        <h1 className={styles.title}>Configura tu verificación en dos pasos</h1>

        <div className={styles.totpNav}>
          {canGoBack ? (
            <button
              type="button"
              className={styles.totpNavArrow}
              onClick={goToPreviousStep}
              aria-label="Paso anterior"
            >
              <IconArrowLeft />
            </button>
          ) : (
            // Keeps "Siguiente" pinned to the right on the very first step,
            // instead of a disabled "Anterior" that has nowhere to go —
            // same footprint as the real button so nothing shifts once it
            // becomes clickable again on the next step.
            <span className={styles.totpNavArrowPlaceholder} aria-hidden="true" />
          )}
          {!isVerifyStep && (
            <button
              type="button"
              className={styles.totpNavArrow}
              onClick={goToNextStep}
              disabled={!canGoNext}
              aria-label="Siguiente paso"
            >
              <IconArrowRight />
            </button>
          )}
        </div>

        <div className={styles.totpProgress}>
          <div
            className={styles.totpProgressTrack}
            role="progressbar"
            aria-valuenow={stepIndex + 1}
            aria-valuemin={1}
            aria-valuemax={TOTAL_STEPS}
            aria-label="Progreso de la configuración de 2FA"
          >
            <div className={styles.totpProgressFill} style={{ width: `${((stepIndex + 1) / TOTAL_STEPS) * 100}%` }} />
          </div>
          <span className={styles.totpProgressLabel} aria-live="polite">
            Paso {stepIndex + 1} de {TOTAL_STEPS}
          </span>
        </div>

        <div className={styles.totpSlide} key={stepIndex}>
          {stepIndex === INTRO_STEP_INDEX && (
            <div className={styles.totpIntro}>
              <div className={styles.notice}>
                <IconLock className={styles.noticeIcon} />
                <div>
                  <p className={styles.noticeHeading}>Verificación en dos pasos (2FA)</p>
                  <p className={styles.noticeText}>
                    Refuerza la seguridad de tu cuenta: además de tu contraseña, vas a confirmar que eres tú
                    con un código de 6 dígitos que genera tu propio celular cada vez que entres al Portal de
                    Padres.
                  </p>
                  <p className={styles.noticeText}>
                    A continuación vas a seguir un paso a paso para activarla. El propósito de esto es dejar
                    tu cuenta protegida antes de entrar por primera vez al Portal de Padres.
                  </p>
                  <p className={styles.noticeText}>
                    Te mostramos el ejemplo con Google Authenticator en un celular Android, pero puedes usar
                    cualquiera de estas aplicaciones. ¡Usa la que prefieras!
                  </p>
                  <div className={styles.totpAppLogos}>
                    <div className={styles.totpAppLogo}>
                      <img src={googleAuthenticatorIcon} alt="" className={styles.totpAppLogoIcon} />
                      <span>Google Authenticator</span>
                    </div>
                    <div className={styles.totpAppLogo}>
                      <img src={microsoftAuthenticatorIcon} alt="" className={styles.totpAppLogoIcon} />
                      <span>Microsoft Authenticator</span>
                    </div>
                    <div className={styles.totpAppLogo}>
                      <IconAuthyLogo className={styles.totpAppLogoIcon} />
                      <span>Authy</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.notice}>
                <IconBook className={styles.noticeIcon} />
                <div>
                  <p className={styles.noticeHeading}>Cómo funciona esta configuración</p>
                  <p className={styles.noticeText}>
                    Está dividida en varias pantallas, como un pequeño instructivo. Vas a moverte entre ellas
                    con las flechas que aparecen arriba, justo debajo del título de esta ventana:
                  </p>
                  <div className={styles.totpNavHint}>
                    <div className={styles.totpNavHintItem}>
                      <span className={`${styles.totpNavArrow} ${styles.totpNavArrowDemo}`} aria-hidden="true">
                        <IconArrowLeft />
                      </span>
                      <span>Regresa al paso anterior</span>
                    </div>
                    <div className={styles.totpNavHintItem}>
                      <span className={`${styles.totpNavArrow} ${styles.totpNavArrowDemo}`} aria-hidden="true">
                        <IconArrowRight />
                      </span>
                      <span>Avanza al siguiente paso</span>
                    </div>
                  </div>
                </div>
              </div>
              <p className={styles.question}>¡Toca la flecha derecha cuando estés listo para empezar!</p>
            </div>
          )}

          {stepIndex >= FIRST_INSTRUCTION_STEP_INDEX && stepIndex < QR_STEP_INDEX && (
            <>
              <StepNotice>
                <p className={styles.noticeText}>
                  {INSTRUCTION_STEPS[stepIndex - FIRST_INSTRUCTION_STEP_INDEX].text}
                </p>
              </StepNotice>
              <img
                src={INSTRUCTION_STEPS[stepIndex - FIRST_INSTRUCTION_STEP_INDEX].image}
                alt={INSTRUCTION_STEPS[stepIndex - FIRST_INSTRUCTION_STEP_INDEX].imageAlt}
                className={styles.totpStepImage}
              />
            </>
          )}

          {isQrStep && (
            <>
              <StepNotice>
                <p className={styles.noticeText}>
                  Apunta la cámara de tu celular al siguiente código QR para vincular tu cuenta con IRIS:
                </p>
              </StepNotice>
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
            </>
          )}

          {isVerifyStep && (
            <>
              <StepNotice>
                <p className={styles.noticeText}>
                  Tu aplicación de autenticación agregará la cuenta y empezará a mostrarte un código de 6
                  dígitos que cambia cada 30 segundos. Escribe abajo el código más reciente para confirmar que
                  la vinculación quedó correcta; si cambia mientras lo escribes, usa el nuevo que aparezca.
                </p>
              </StepNotice>
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
                  autoFocus
                />
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={code.length !== 6 || verify.isPending}
                >
                  {verify.isPending ? "Verificando…" : "Verificar y continuar"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
