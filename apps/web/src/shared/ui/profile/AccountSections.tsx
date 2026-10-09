import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { ChangePasswordRequest } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { PasswordRequirements } from "@/features/auth/ui/PasswordRequirements";
import { passwordMeetsRequirements } from "@/features/auth/ui/passwordRules";
import { TextField } from "@/features/auth/ui/TextField";
import { useCerrarTodasMisSesiones } from "@/shared/api/hooks/useAuthApi";
import { ApiError } from "@/shared/api/httpClient";
import { useAuth } from "@/shared/auth/useAuth";
import { SUPPORT_EMAIL, supportMailto } from "@/shared/supportContact";
import { CheckboxField } from "@/features/auth/ui/CheckboxField";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { FormDialog } from "@/shared/ui/FormDialog";
import { IconInfo, IconKey, IconTrash } from "@/shared/ui/icons";
import { leaveLoginNotice } from "@/shared/ui/loginNotice";
import { Card } from "./ProfileForm";
import form from "./ProfileForm.module.css";
import { TwoFactorCodeDialog } from "./TwoFactorCodeDialog";
import styles from "./AccountSections.module.css";

// The parts of Mi perfil that are the same for a guardian and a teacher:
// how to ask for a change of the data that identifies the account, and the
// security card (password and open sessions).

/** Below the document and email: they can't change here, so this says how
 * to ask for it. */
export function IdentityChangeNotice() {
  return (
    <div className={styles.notice}>
      <IconInfo className={styles.noticeIcon} />
      <div>
        <p className={styles.noticeHeading}>¿Necesitas corregir alguno de estos datos?</p>
        <p className={styles.noticeText}>
          Escríbenos a{" "}
          <a className={styles.noticeLink} href={supportMailto("Solicitud de cambio de datos de mi cuenta")}>
            {SUPPORT_EMAIL}
          </a>{" "}
          contándonos qué dato quieres cambiar y por qué. Para confirmar que eres tú, incluye tu nombre completo, tu
          correo electrónico y tu tipo y número de documento. Revisaremos tu solicitud y te responderemos en un plazo
          máximo de 10 días hábiles.
        </p>
      </div>
    </div>
  );
}

/** What changes the password of each kind of account (the guardian's and
 * the teacher's go to different routes). */
export interface PasswordChanger {
  mutateAsync: (body: ChangePasswordRequest) => Promise<unknown>;
  isPending: boolean;
}

export function SecurityCard({ changePassword }: { changePassword: PasswordChanger }) {
  const navigate = useNavigate();
  const { discardSession } = useAuth();
  const [expanded, setExpanded] = useState(false);
  // The 2FA code is asked in a floating dialog after pressing the button.
  const [askingCode, setAskingCode] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  // A wrong current password goes under its own field, a new one equal to
  // the current under the new password field, anything else below the form.
  const [currentPasswordError, setCurrentPasswordError] = useState<string | null>(null);
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const passwordsMatch = password.length > 0 && password === passwordConfirmation;
  const sameAsCurrent = password.length > 0 && password === currentPassword;
  const canSubmit =
    currentPassword.length > 0 && passwordMeetsRequirements(password) && passwordsMatch && !sameAsCurrent;

  function clearForm() {
    setCurrentPassword("");
    setPassword("");
    setPasswordConfirmation("");
    setCurrentPasswordError(null);
    setNewPasswordError(null);
    setError(null);
  }

  function cancel() {
    setExpanded(false);
    clearForm();
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setCurrentPasswordError(null);
    setNewPasswordError(null);
    setError(null);
    setAskingCode(true);
  }

  // Wrong codes and waits stay inside the dialog. Anything else closes it
  // and shows up in the form, where it can be fixed.
  async function changeWithCode(code: string) {
    await changePassword.mutateAsync({
      current_password: currentPassword,
      code,
      password,
      password_confirmation: passwordConfirmation,
    });
    setAskingCode(false);
    clearForm();
    setExpanded(false);
    // The server already closed every session, this one too, so the person
    // signs in again. The message waits in sessionStorage for the login page.
    leaveLoginNotice({
      title: "Contraseña actualizada",
      message:
        "Tu contraseña se cambió correctamente. Usa la nueva para ingresar a tu cuenta. Por seguridad, cerramos todas tus sesiones abiertas.",
    });
    navigate("/login/adult", { replace: true });
    discardSession();
  }

  function showFormError(err: unknown) {
    setAskingCode(false);
    if (err instanceof ApiError && err.code === "contrasena_actual_incorrecta") {
      setCurrentPasswordError(getAuthErrorMessage(err));
      setCurrentPassword("");
    } else if (err instanceof ApiError && err.code === "contrasena_igual_a_la_actual") {
      // The current password was right, so it stays. Only the new one is
      // cleared, to pick a different one.
      setNewPasswordError(getAuthErrorMessage(err));
      setPassword("");
      setPasswordConfirmation("");
    } else {
      setError(getAuthErrorMessage(err));
    }
  }

  return (
    <Card
      id="profile-security"
      icon={<IconKey width={20} height={20} />}
      title="Seguridad"
      hint="Aquí gestionas la seguridad de tu cuenta: puedes cambiar la contraseña con la que inicias sesión en IRIS y cerrar tus sesiones abiertas en todos los dispositivos si notas algo extraño. Para cambiar la contraseña te pediremos la actual y un código de tu aplicación autenticadora. Al hacerlo, cerraremos tus sesiones y tendrás que iniciar sesión de nuevo."
    >
      {!expanded ? (
        <div className={styles.securityRow}>
          <div className={form.field}>
            <span className={form.fieldLabel}>Contraseña</span>
            <span className={`${form.fieldValue} ${styles.passwordDots}`} aria-label="Contraseña oculta">
              ••••••••••
            </span>
          </div>
          <button type="button" className={form.secondaryButton} onClick={() => setExpanded(true)}>
            Cambiar contraseña
          </button>
        </div>
      ) : (
        <form className={styles.passwordForm} onSubmit={handleSubmit}>
          {/* The current one first, so an open session alone can't change it. */}
          <div className={styles.passwordGrid}>
            <TextField
              id="profile-current-password"
              label="Contraseña actual"
              type="password"
              value={currentPassword}
              onChange={(value) => {
                setCurrentPassword(value);
                setCurrentPasswordError(null);
              }}
              autoComplete="current-password"
              autoFocus
              required
              error={currentPasswordError ?? undefined}
            />
          </div>
          <div className={styles.passwordGrid}>
            <TextField
              id="profile-new-password"
              label="Nueva contraseña"
              type="password"
              value={password}
              onChange={(value) => {
                setPassword(value);
                setNewPasswordError(null);
              }}
              autoComplete="new-password"
              required
              error={
                sameAsCurrent
                  ? 'La nueva contraseña no puede ser igual a la que escribiste en "Contraseña actual".'
                  : (newPasswordError ?? undefined)
              }
            />
            <TextField
              id="profile-confirm-password"
              label="Confirmar nueva contraseña"
              type="password"
              value={passwordConfirmation}
              onChange={setPasswordConfirmation}
              autoComplete="new-password"
              required
              error={passwordConfirmation.length > 0 && !passwordsMatch ? "Las contraseñas no coinciden." : undefined}
            />
          </div>
          <PasswordRequirements password={password} />
          {error && (
            <p role="alert" className={form.error}>
              {error}
            </p>
          )}
          <div className={styles.passwordButtons}>
            <button type="button" className={form.secondaryButton} onClick={cancel}>
              Cancelar
            </button>
            <button type="submit" className={form.primaryButton} disabled={!canSubmit || changePassword.isPending}>
              {changePassword.isPending ? "Actualizando…" : "Actualizar contraseña"}
            </button>
          </div>
        </form>
      )}
      {askingCode && (
        <TwoFactorCodeDialog
          title="Confirma el cambio de contraseña"
          text="Para cambiar tu contraseña, escribe el código de 6 dígitos que muestra tu aplicación autenticadora."
          onSubmit={changeWithCode}
          onCancel={() => setAskingCode(false)}
          onOtherError={showFormError}
        />
      )}

      <CloseAllSessions />
    </Card>
  );
}

// Signs the account out of every device, this one too. Handy when IRIS was
// used on a computer that isn't theirs, or they think someone else got in.
function CloseAllSessions() {
  const navigate = useNavigate();
  const { discardSession } = useAuth();
  const closeAll = useCerrarTodasMisSesiones();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function closeEverywhere() {
    setConfirming(false);
    setError(null);
    try {
      await closeAll.mutateAsync();
    } catch (err) {
      setError(getAuthErrorMessage(err));
      return;
    }
    // The server already closed this session too, only the local copy is left.
    discardSession();
    navigate("/login/adult", {
      replace: true,
      state: { aviso: "Cerramos tus sesiones en todos los dispositivos. Inicia sesión de nuevo." },
    });
  }

  return (
    <div className={styles.sessionsRow}>
      <div className={form.field}>
        <span className={form.fieldLabel}>Sesiones abiertas</span>
        <span className={styles.sessionsText}>
          Si usaste IRIS en un equipo que no es tuyo o crees que alguien más entró a tu cuenta, cierra tu sesión en
          todos los dispositivos, incluido este.
        </span>
        {error && (
          <span role="alert" className={form.error}>
            {error}
          </span>
        )}
      </div>
      <button
        type="button"
        className={styles.dangerButton}
        onClick={() => setConfirming(true)}
        disabled={closeAll.isPending}
      >
        {closeAll.isPending ? "Cerrando…" : "Cerrar todas las sesiones"}
      </button>

      {confirming && (
        <ConfirmDialog
          title="Cerrar todas las sesiones"
          message="Vamos a cerrar tu sesión en todos los dispositivos, incluido este. Los cambios que no hayas guardado se perderán. ¿Continuar?"
          acceptLabel="Sí, cerrar todas"
          cancelLabel="Cancelar"
          danger
          onAccept={() => void closeEverywhere()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

/** What deletes each kind of account (the guardian's and the teacher's go
 * to different routes; the guardian's also needs the portal open). */
export interface AccountDeleter {
  mutateAsync: (password: string) => Promise<unknown>;
  isPending: boolean;
}

interface DeleteAccountCardProps {
  deleteAccount: AccountDeleter;
  /** What goes and what stays, said before anything else. */
  warning: string;
}

/** HU-91, HU-92: deleting the account for good. It says first what goes
 * and what stays, then asks for the password and an "entiendo" in a
 * window. After it, the session closes and the login says it's done. */
export function DeleteAccountCard({ deleteAccount, warning }: DeleteAccountCardProps) {
  const navigate = useNavigate();
  const { discardSession } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setPassword("");
    setUnderstood(false);
    setError(null);
  }

  async function submit(): Promise<boolean> {
    setError(null);
    if (!understood) {
      setError("Marca la casilla para confirmar que entiendes que no se puede deshacer.");
      return false;
    }
    if (!password) {
      setError("Escribe tu contraseña para confirmar.");
      return false;
    }
    try {
      await deleteAccount.mutateAsync(password);
    } catch (err) {
      setError(getAuthErrorMessage(err));
      return false;
    }
    // The account and its sessions are gone on the server, only the local copy is left.
    discardSession();
    leaveLoginNotice({
      title: "Tu cuenta se eliminó",
      message: "Borramos tu cuenta y tus datos de IRIS. Gracias por haber estado aquí.",
    });
    navigate("/login/adult", { replace: true });
    return true;
  }

  return (
    <Card
      id="delete-account"
      icon={<IconTrash width={20} height={20} />}
      title="Eliminar mi cuenta"
      hint="Tu derecho a que borremos tus datos."
    >
      <div className={styles.sessionsRow}>
        <span className={styles.sessionsText}>{warning}</span>
        <button type="button" className={styles.dangerButton} onClick={() => setOpen(true)}>
          Eliminar mi cuenta
        </button>
      </div>
      {open && (
        <FormDialog
          eyebrow="Mi cuenta"
          title="Eliminar mi cuenta"
          intro={`${warning} No se puede deshacer.`}
          icon={<IconTrash width={24} height={24} />}
          submitLabel="Eliminar mi cuenta para siempre"
          saving={deleteAccount.isPending}
          error={error}
          onSubmit={submit}
          onClose={close}
        >
          <TextField
            id="delete-account-password"
            label="Tu contraseña"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            required
            disabled={deleteAccount.isPending}
          />
          <CheckboxField id="delete-account-understood" checked={understood} onChange={setUnderstood} required>
            Entiendo que mi cuenta se elimina para siempre y que no se puede deshacer.
          </CheckboxField>
        </FormDialog>
      )}
    </Card>
  );
}
