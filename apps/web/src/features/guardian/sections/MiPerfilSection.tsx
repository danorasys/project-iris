import { useState, type FormEvent } from "react";
import type { GuardianProfile } from "@iris/shared-types";
import { formatPhoneNumberIntl, parsePhoneNumber } from "react-phone-number-input";
import {
  useActualizarMiPerfilTutor,
  useCambiarMiPassword,
  useCerrarTodasMisSesiones,
  useDocumentTypes,
  useMiPerfilTutor,
  useRelationshipTypes,
} from "@/shared/api/hooks/useAuthApi";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/shared/auth/AuthContext";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { ApiError } from "@/shared/api/httpClient";
import { TextField } from "@/features/auth/ui/TextField";
import { PhoneField } from "@/features/auth/ui/PhoneField";
import { SelectField } from "@/features/auth/ui/SelectField";
import { PasswordRequirements, passwordMeetsRequirements } from "@/features/auth/ui/PasswordRequirements";
import {
  adultBirthDateError,
  latestAdultBirthDate,
  MAX_AGE,
  nameError,
  phoneError,
  toIsoDate,
} from "@/features/utils/personValidation";
import { formatDate } from "@/features/utils/formatDate";
import { initials } from "@/features/utils/initials";
import { SUPPORT_EMAIL, supportMailto } from "@/shared/supportContact";
import { leaveLoginNotice } from "@/shared/ui/loginNotice";
import { IconInfo, IconKey, IconLock, IconUserCircle } from "@/shared/ui/icons";
import { Card, EDIT_HINT, EditableRow, ReadOnlyRow, SaveBar } from "../ui/ProfileForm";
import { useProfileForm } from "../ui/useProfileForm";
import form from "../ui/ProfileForm.module.css";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Toast } from "../ui/Toast";
import { TwoFactorCodeDialog } from "../ui/TwoFactorCodeDialog";
import { isPortalAccessRequired, useWithPortalAccess } from "../portalAccess";
import styles from "./MiPerfilSection.module.css";

// A type and not an interface: useProfileForm asks for a plain record of
// texts, and an interface doesn't count as one for TypeScript.
type ProfileValues = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string;
  relationshipTypeId: string;
};

interface MiPerfilSectionProps {
  /** Tells the shell (GuardianPortalPage) whether it's safe to switch away
   * from this section, or to use "regresar"/"cerrar sesión", without
   * warning the guardian about unsaved changes first. */
  onDirtyChange: (dirty: boolean) => void;
}

/** Lets a guardian see and edit their own data, and change their password.
 * It uses GET/PATCH /guardians/me and POST /guardians/me/password on
 * identity-service. */
export function MiPerfilSection({ onDirtyChange }: MiPerfilSectionProps) {
  const profileQuery = useMiPerfilTutor();

  if (profileQuery.isLoading) return <p className={styles.status}>Cargando tu perfil…</p>;
  // Nothing typed yet to keep, so a closed portal just goes to the code screen.
  if (isPortalAccessRequired(profileQuery.error)) return <Navigate to="/guardian/verify-2fa" replace />;
  if (profileQuery.isError || !profileQuery.data) {
    return (
      <p role="alert" className={`${styles.status} ${form.error}`}>
        No pudimos cargar tu perfil. Intenta recargar la página.
      </p>
    );
  }
  // The editor only mounts once the profile is here, so it can start with
  // the real data instead of filling itself in later.
  return <ProfileEditor profile={profileQuery.data} onDirtyChange={onDirtyChange} />;
}

function toValues(profile: GuardianProfile): ProfileValues {
  return {
    firstName: profile.first_name,
    lastName: profile.last_name,
    dateOfBirth: profile.date_of_birth,
    phone: `+${profile.phone_country_code}${profile.phone_number}`,
    relationshipTypeId: String(profile.relationship_type_id),
  };
}

function ProfileEditor({ profile, onDirtyChange }: MiPerfilSectionProps & { profile: GuardianProfile }) {
  const documentTypesQuery = useDocumentTypes();
  const relationshipTypesQuery = useRelationshipTypes();
  const updateProfile = useActualizarMiPerfilTutor();
  const withPortalAccess = useWithPortalAccess();

  const fields = useProfileForm<ProfileValues>(() => toValues(profile), onDirtyChange);
  const { values, original } = fields;
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileToast, setProfileToast] = useState<string | null>(null);

  // Same rules the server applies. They show under each field once it's
  // closed, and while any is left "Guardar cambios" stays locked.
  const errors: Partial<Record<keyof ProfileValues, string | null>> = {
    firstName: nameError(values.firstName, "Ingresa tus nombres."),
    lastName: nameError(values.lastName, "Ingresa tus apellidos."),
    dateOfBirth: adultBirthDateError(values.dateOfBirth, { documentIssuedAt: profile.document_issued_at }),
    phone: phoneError(values.phone),
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const rowProps = (field: keyof ProfileValues) => fields.rowProps(field, errors[field] ?? null);

  function discardChanges() {
    fields.discardChanges();
    setProfileError(null);
  }

  async function handleConfirmProfile(event: FormEvent) {
    event.preventDefault();
    if (hasErrors || !fields.confirmed) return;
    setProfileError(null);
    const parsedPhone = parsePhoneNumber(values.phone);
    try {
      const updated = await withPortalAccess(() =>
        updateProfile.mutateAsync({
          first_name: values.firstName.trim(),
          last_name: values.lastName.trim(),
          date_of_birth: values.dateOfBirth,
          phone_country_code: parsedPhone?.countryCallingCode ?? "",
          phone_number: parsedPhone?.nationalNumber ?? "",
          relationship_type_id: Number(values.relationshipTypeId),
          truthful_declaration: true,
        }),
      );
      // What the server saved, which can differ a bit (it joins extra spaces).
      fields.markSaved(toValues(updated));
      setProfileToast("Tus datos se guardaron correctamente.");
    } catch (error) {
      setProfileError(getAuthErrorMessage(error));
    }
  }

  // The catalogs arrive a moment after the profile.
  const relationshipName = (id: string) =>
    relationshipTypesQuery.data?.find((r) => r.id === Number(id))?.name ??
    (relationshipTypesQuery.isLoading ? "Cargando…" : "—");
  const documentTypeName =
    documentTypesQuery.data?.find((d) => d.id === profile.document_type_id)?.name ??
    (documentTypesQuery.isLoading ? "Cargando…" : "—");

  // The calendar only offers birth dates of adults, and not after the
  // document was issued.
  const today = new Date();
  const latestBirthDate = [latestAdultBirthDate(today), profile.document_issued_at].sort()[0];
  const earliestBirthDate = toIsoDate(new Date(today.getFullYear() - MAX_AGE, today.getMonth(), today.getDate()));

  return (
    <div className={styles.section}>
      {/* The header shows the saved data, not what is being typed. */}
      <header className={styles.hero}>
        <span className={styles.avatar} aria-hidden="true">
          {initials(original.firstName, original.lastName)}
        </span>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>Mi perfil</p>
          <h1 className={styles.name}>
            {original.firstName} {original.lastName}
          </h1>
          <p className={styles.heroMeta}>
            <span className={styles.chip}>{relationshipName(original.relationshipTypeId)}</span>
            <span className={styles.heroEmail}>{profile.email}</span>
          </p>
        </div>
      </header>

      <form className={form.form} onSubmit={handleConfirmProfile}>
        <Card
          id="perfil-datos-personales"
          icon={<IconUserCircle width={22} height={22} />}
          title="Datos personales"
          hint={`Estos son tus datos personales, los que nos diste al crear tu cuenta. ${EDIT_HINT}`}
        >
          <div className={form.fieldGrid}>
            <EditableRow label="Nombres" displayValue={values.firstName} {...rowProps("firstName")}>
              <TextField
                id="perfil-first-name"
                label="Nombres"
                value={values.firstName}
                onChange={(v) => fields.setField("firstName", v)}
                maxLength={120}
                autoFocus
                required
              />
            </EditableRow>

            <EditableRow label="Apellidos" displayValue={values.lastName} {...rowProps("lastName")}>
              <TextField
                id="perfil-last-name"
                label="Apellidos"
                value={values.lastName}
                onChange={(v) => fields.setField("lastName", v)}
                maxLength={120}
                autoFocus
                required
              />
            </EditableRow>

            <EditableRow
              label="Fecha de nacimiento"
              displayValue={formatDate(values.dateOfBirth) || "—"}
              {...rowProps("dateOfBirth")}
            >
              <TextField
                id="perfil-date-of-birth"
                label="Fecha de nacimiento"
                type="date"
                min={earliestBirthDate}
                max={latestBirthDate}
                value={values.dateOfBirth}
                onChange={(v) => fields.setField("dateOfBirth", v)}
                autoFocus
                required
              />
            </EditableRow>

            <EditableRow
              label="Teléfono"
              displayValue={formatPhoneNumberIntl(values.phone) || values.phone}
              {...rowProps("phone")}
            >
              <PhoneField
                id="perfil-phone"
                label="Teléfono"
                value={values.phone}
                onChange={(v) => fields.setField("phone", v)}
                required
              />
            </EditableRow>

            <EditableRow
              label="Relación con el estudiante"
              displayValue={relationshipName(values.relationshipTypeId)}
              {...rowProps("relationshipTypeId")}
            >
              <SelectField
                id="perfil-relationship"
                label="Relación con el estudiante"
                value={values.relationshipTypeId}
                onChange={(v) => fields.setField("relationshipTypeId", v)}
                options={(relationshipTypesQuery.data ?? []).map((r) => ({ value: String(r.id), label: r.name }))}
              />
            </EditableRow>
          </div>
        </Card>

        <Card
          id="perfil-identificacion"
          icon={<IconLock width={20} height={20} />}
          title="Identificación de la cuenta"
          hint="Tu documento de identidad y tu correo electrónico son los datos con los que IRIS te reconoce como titular de esta cuenta y con los que inicias sesión. Para proteger tu cuenta y la información de tus peques, no se pueden cambiar directamente desde aquí."
          muted
        >
          <div className={form.fieldGrid}>
            <ReadOnlyRow label="Tipo de documento" value={documentTypeName} />
            <ReadOnlyRow label="Número de documento" value={profile.document_number} />
            <ReadOnlyRow label="Fecha de expedición" value={formatDate(profile.document_issued_at)} />
            <ReadOnlyRow label="Correo electrónico" value={profile.email} />
          </div>

          <div className={styles.notice}>
            <IconInfo className={styles.noticeIcon} />
            <div>
              <p className={styles.noticeHeading}>¿Necesitas corregir alguno de estos datos?</p>
              <p className={styles.noticeText}>
                Escríbenos a{" "}
                <a className={styles.noticeLink} href={supportMailto("Solicitud de cambio de datos de mi cuenta")}>
                  {SUPPORT_EMAIL}
                </a>{" "}
                contándonos qué dato quieres cambiar y por qué. Para confirmar que eres tú, incluye tu nombre completo,
                tu correo electrónico y tu tipo y número de documento. Revisaremos tu solicitud y te responderemos en un
                plazo máximo de 10 días hábiles.
              </p>
            </div>
          </div>
        </Card>

        <SaveBar
          shown={fields.saveBarShown}
          leaving={fields.saveBarLeaving}
          confirmed={fields.confirmed}
          onConfirmedChange={fields.setConfirmed}
          hasErrors={hasErrors}
          error={profileError}
          saving={updateProfile.isPending}
          onDiscard={discardChanges}
        />
      </form>

      <SecurityCard />

      {profileToast && <Toast message={profileToast} onDismiss={() => setProfileToast(null)} />}
    </div>
  );
}

function SecurityCard() {
  const navigate = useNavigate();
  const { discardSession } = useAuth();
  const changePassword = useCambiarMiPassword();
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
  // and shows up in the form, where the guardian can fix it.
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
    // The server already closed every session, this one too, so the guardian
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
      id="perfil-seguridad"
      icon={<IconKey width={20} height={20} />}
      title="Seguridad"
      hint="Aquí puedes cambiar la contraseña con la que inicias sesión en IRIS. Para confirmar que eres tú, te pediremos tu contraseña actual y un código de tu aplicación autenticadora. Al cambiarla cerraremos tus sesiones abiertas en todos los dispositivos y tendrás que iniciar sesión de nuevo con la nueva contraseña."
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
              id="perfil-password-actual"
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
              id="perfil-nueva-password"
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
                  ? "La nueva contraseña no puede ser igual a la que escribiste en \"Contraseña actual\"."
                  : (newPasswordError ?? undefined)
              }
            />
            <TextField
              id="perfil-confirmar-password"
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

// Signs the account out of every device, this one too. Handy when the
// guardian used IRIS on a computer that isn't theirs, or thinks someone
// else got in.
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
