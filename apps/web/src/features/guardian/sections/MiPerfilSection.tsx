import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { GuardianProfile } from "@iris/shared-types";
import { formatPhoneNumberIntl, parsePhoneNumber } from "react-phone-number-input";
import {
  useActualizarMiPerfilTutor,
  useCambiarMiPassword,
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
import { CheckboxField } from "@/features/auth/ui/CheckboxField";
import { PasswordRequirements, passwordMeetsRequirements } from "@/features/auth/ui/PasswordRequirements";
import {
  adultBirthDateError,
  latestAdultBirthDate,
  MAX_AGE,
  nameError,
  phoneError,
  toIsoDate,
} from "@/features/utils/personValidation";
import { initials } from "@/features/utils/initials";
import { SUPPORT_EMAIL, supportMailto } from "@/shared/supportContact";
import { leaveLoginNotice } from "@/shared/ui/loginNotice";
import { IconInfo, IconKey, IconLock, IconPencil, IconUserCircle } from "@/shared/ui/icons";
import { Toast } from "../ui/Toast";
import { TwoFactorCodeDialog } from "../ui/TwoFactorCodeDialog";
import { isPortalAccessRequired, useWithPortalAccess } from "../portalAccess";
import styles from "./MiPerfilSection.module.css";

interface ProfileValues {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string;
  relationshipTypeId: string;
}

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
      <p role="alert" className={`${styles.status} ${styles.error}`}>
        No pudimos cargar tu perfil. Intenta recargar la página.
      </p>
    );
  }
  // The editor only mounts once the profile is here, so it can start with
  // the real data instead of filling itself in later.
  return <ProfileEditor profile={profileQuery.data} onDirtyChange={onDirtyChange} />;
}

// How long the save bar takes to slide out. Same as the save-bar-out
// animation in MiPerfilSection.module.css.
const SAVE_BAR_LEAVE_MS = 220;

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

  const [values, setValues] = useState<ProfileValues>(() => toValues(profile));
  // The last saved values, to know if something changed and to undo it.
  const [original, setOriginal] = useState<ProfileValues>(() => toValues(profile));
  const [editing, setEditing] = useState<keyof ProfileValues | null>(null);
  const [truthfulConfirmed, setTruthfulConfirmed] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileToast, setProfileToast] = useState<string | null>(null);

  const isDirty = (Object.keys(values) as (keyof ProfileValues)[]).some((key) => values[key] !== original[key]);

  // When the changes go away (discarded or saved) the bar stays on screen a
  // moment longer, so it can slide down instead of vanishing at once.
  const [saveBarShown, setSaveBarShown] = useState(isDirty);
  if (isDirty && !saveBarShown) setSaveBarShown(true);
  const saveBarLeaving = saveBarShown && !isDirty;

  useEffect(() => {
    if (!saveBarLeaving) return;
    const timer = window.setTimeout(() => setSaveBarShown(false), SAVE_BAR_LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [saveBarLeaving]);

  // Same rules the server applies. They show under each field once it's
  // closed, and while any is left "Guardar cambios" stays locked.
  const errors: Partial<Record<keyof ProfileValues, string | null>> = {
    firstName: nameError(values.firstName, "Ingresa tus nombres."),
    lastName: nameError(values.lastName, "Ingresa tus apellidos."),
    dateOfBirth: adultBirthDateError(values.dateOfBirth, { documentIssuedAt: profile.document_issued_at }),
    phone: phoneError(values.phone),
  };
  const hasErrors = Object.values(errors).some(Boolean);

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  // Warns before leaving the app with unsaved changes (closing the tab or
  // reloading). Moving between sections is handled by the portal itself.
  useEffect(() => {
    function handler(event: BeforeUnloadEvent) {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  function setField(key: keyof ProfileValues, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function startEditing(field: keyof ProfileValues) {
    setEditing(field);
  }

  // Keeps what was typed. Only the keyboard (Enter) moves the focus back to
  // the pencil, a click outside leaves it wherever the guardian clicked.
  function finishEditing(restoreFocus = false) {
    if (editing && restoreFocus) focusEditButton(editing);
    setEditing(null);
  }

  // Always goes back to the saved value, even if the field was already
  // changed and closed before opening it again.
  function cancelEditing() {
    if (!editing) return;
    setField(editing, original[editing]);
    focusEditButton(editing);
    setEditing(null);
  }

  function discardChanges() {
    setValues(original);
    setEditing(null);
    setTruthfulConfirmed(false);
    setProfileError(null);
  }

  async function handleConfirmProfile(event: FormEvent) {
    event.preventDefault();
    if (hasErrors || !truthfulConfirmed) return;
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
      const saved = toValues(updated);
      setValues(saved);
      setOriginal(saved);
      setEditing(null);
      setTruthfulConfirmed(false);
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

  // Same props for every editable row, only the field changes.
  const rowProps = (field: keyof ProfileValues) => ({
    field,
    editing: editing === field,
    onStartEdit: () => startEditing(field),
    onDone: finishEditing,
    onCancel: cancelEditing,
    error: errors[field] ?? null,
  });

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

      <form className={styles.form} onSubmit={handleConfirmProfile}>
        <Card
          id="perfil-datos-personales"
          icon={<IconUserCircle width={22} height={22} />}
          title="Datos personales"
          hint="Toca el lápiz o haz doble clic sobre un dato para cambiarlo. Al terminar, haz clic fuera de la casilla o pulsa Cancelar si cambias de decisión. Para que tus cambios queden guardados, pulsa Guardar cambios en la barra que aparecerá en la parte inferior."
        >
          <div className={styles.fieldGrid}>
            <EditableRow
              label="Nombres"
              displayValue={values.firstName}
              {...rowProps("firstName")}
            >
              <TextField
                id="perfil-first-name"
                label="Nombres"
                value={values.firstName}
                onChange={(v) => setField("firstName", v)}
                maxLength={120}
                autoFocus
                required
              />
            </EditableRow>

            <EditableRow
              label="Apellidos"
              displayValue={values.lastName}
              {...rowProps("lastName")}
            >
              <TextField
                id="perfil-last-name"
                label="Apellidos"
                value={values.lastName}
                onChange={(v) => setField("lastName", v)}
                maxLength={120}
                autoFocus
                required
              />
            </EditableRow>

            <EditableRow
              label="Fecha de nacimiento"
              displayValue={formatDateEs(values.dateOfBirth)}
              {...rowProps("dateOfBirth")}
            >
              <TextField
                id="perfil-date-of-birth"
                label="Fecha de nacimiento"
                type="date"
                min={earliestBirthDate}
                max={latestBirthDate}
                value={values.dateOfBirth}
                onChange={(v) => setField("dateOfBirth", v)}
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
                onChange={(v) => setField("phone", v)}
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
                onChange={(v) => setField("relationshipTypeId", v)}
                options={(relationshipTypesQuery.data ?? []).map((r) => ({ value: String(r.id), label: r.name }))}
              />
            </EditableRow>
          </div>
        </Card>

        <Card
          id="perfil-identificacion"
          icon={<IconLock width={20} height={20} />}
          title="Identificación de la cuenta"
          hint="Estos datos identifican tu cuenta, por eso no se pueden cambiar aquí."
          muted
        >
          <div className={styles.fieldGrid}>
            <ReadOnlyRow label="Tipo de documento" value={documentTypeName} />
            <ReadOnlyRow label="Número de documento" value={profile.document_number} />
            <ReadOnlyRow label="Fecha de expedición" value={formatDateEs(profile.document_issued_at)} />
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

        {/* Only shows up when something changed, and stays at the bottom of
            the screen so the save button is always at hand. While it slides
            out it can't be used, and screen readers already skip it. */}
        {saveBarShown && (
          <div
            className={saveBarLeaving ? `${styles.saveBar} ${styles.saveBarLeaving}` : styles.saveBar}
            role={saveBarLeaving ? undefined : "region"}
            aria-label={saveBarLeaving ? undefined : "Cambios sin guardar"}
            aria-hidden={saveBarLeaving || undefined}
            inert={saveBarLeaving}
          >
            <div className={styles.saveBarText}>
              <p className={styles.saveBarTitle}>Tienes cambios sin guardar</p>
              {/* If this sentence changes, also change PROFILE_DECLARATION_VERSION
                  in identity-service, so each saved change keeps which one was accepted. */}
              <CheckboxField id="perfil-declaro-veraz" checked={truthfulConfirmed} onChange={setTruthfulConfirmed}>
                Declaro que la información que modifiqué es correcta y veraz.
              </CheckboxField>
              {hasErrors && (
                <p className={styles.fixNotice}>
                  <span className={styles.fixNoticeIcon} aria-hidden="true">
                    <IconInfo width={16} height={16} />
                  </span>
                  <span>
                    Corrige los datos <strong>marcados en rojo</strong> para poder guardar.
                  </span>
                </p>
              )}
              {profileError && (
                <p role="alert" className={styles.error}>
                  {profileError}
                </p>
              )}
            </div>
            <div className={styles.saveBarButtons}>
              <button type="button" className={styles.secondaryButton} onClick={discardChanges}>
                Descartar
              </button>
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={!truthfulConfirmed || hasErrors || updateProfile.isPending}
              >
                {updateProfile.isPending ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>
        )}
      </form>

      <SecurityCard />

      {profileToast && <Toast message={profileToast} onDismiss={() => setProfileToast(null)} />}
    </div>
  );
}

function Card({
  id,
  icon,
  title,
  hint,
  muted = false,
  children,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  hint?: string;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={muted ? `${styles.card} ${styles.cardMuted}` : styles.card} aria-labelledby={id}>
      <header className={styles.cardHeader}>
        <span className={styles.cardIcon} aria-hidden="true">
          {icon}
        </span>
        <div>
          <h2 id={id} className={styles.cardTitle}>
            {title}
          </h2>
          {hint && <p className={styles.cardHint}>{hint}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

function EditableRow({
  field,
  label,
  displayValue,
  editing,
  onStartEdit,
  onDone,
  onCancel,
  error,
  children,
}: {
  field: string;
  label: string;
  displayValue: string;
  editing: boolean;
  onStartEdit: () => void;
  onDone: (restoreFocus?: boolean) => void;
  onCancel: () => void;
  error: string | null;
  children: ReactNode;
}) {
  if (editing) {
    return (
      <EditingPanel onDone={onDone} onCancel={onCancel}>
        {children}
      </EditingPanel>
    );
  }
  return (
    <div className={error ? `${styles.field} ${styles.fieldInvalid}` : styles.field} onDoubleClick={onStartEdit}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.fieldValueRow}>
        <span className={styles.fieldValue}>{displayValue}</span>
        <button
          type="button"
          id={editButtonId(field)}
          className={styles.editButton}
          onClick={onStartEdit}
          aria-label={`Editar ${label.toLowerCase()}`}
          aria-describedby={error ? `${editButtonId(field)}-error` : undefined}
        >
          <IconPencil width={16} height={16} />
        </button>
      </div>
      {error && (
        <span id={`${editButtonId(field)}-error`} role="alert" className={styles.fieldError}>
          {error}
        </span>
      )}
    </div>
  );
}

// The field while it's being edited. Clicking outside, Tab or Enter keep the
// change; Cancelar or Esc put back the saved value.
function EditingPanel({
  onDone,
  onCancel,
  children,
}: {
  onDone: (restoreFocus?: boolean) => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // pointerdown and not blur: in some browsers clicking a button doesn't
    // focus it, so a blur would close the panel before Cancelar is clicked.
    function onPointerDown(event: PointerEvent) {
      if (!panelRef.current?.contains(event.target as Node)) onDone(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onDone]);

  return (
    <div
      ref={panelRef}
      className={styles.fieldEditing}
      onBlur={(event) => {
        // Only when the focus goes somewhere else on the page (Tab).
        const next = event.relatedTarget;
        if (next && !panelRef.current?.contains(next)) onDone(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        } else if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) {
          // Without this, Enter would try to submit the whole form.
          event.preventDefault();
          onDone(true);
        }
      }}
    >
      <div className={styles.fieldEditingInput}>{children}</div>
      <button type="button" className={styles.cancelEditingButton} onClick={onCancel}>
        Cancelar
      </button>
    </div>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${styles.field} ${styles.fieldReadOnly}`}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.fieldValue}>{value}</span>
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
      hint="Al cambiar tu contraseña cerramos todas tus sesiones abiertas."
    >
      {!expanded ? (
        <div className={styles.securityRow}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Contraseña</span>
            <span className={`${styles.fieldValue} ${styles.passwordDots}`} aria-label="Contraseña oculta">
              ••••••••••
            </span>
          </div>
          <button type="button" className={styles.secondaryButton} onClick={() => setExpanded(true)}>
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
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <div className={styles.passwordButtons}>
            <button type="button" className={styles.secondaryButton} onClick={cancel}>
              Cancelar
            </button>
            <button type="submit" className={styles.primaryButton} disabled={!canSubmit || changePassword.isPending}>
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
    </Card>
  );
}

function editButtonId(field: string): string {
  return `perfil-editar-${field}`;
}

// After closing a field, the focus goes back to its pencil so keyboard
// users don't end up at the top of the page. It waits one frame because
// the pencil only exists again after the next render.
function focusEditButton(field: string) {
  requestAnimationFrame(() => document.getElementById(editButtonId(field))?.focus());
}

function formatDateEs(isoDate: string): string {
  if (!isoDate) return "—";
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
