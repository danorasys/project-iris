import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { formatPhoneNumberIntl, parsePhoneNumber } from "react-phone-number-input";
import {
  useActualizarMiPerfilTutor,
  useCambiarMiPassword,
  useDocumentTypes,
  useMiPerfilTutor,
  useRelationshipTypes,
} from "@/shared/api/hooks/useAuthApi";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { TextField } from "@/features/auth/ui/TextField";
import { PhoneField } from "@/features/auth/ui/PhoneField";
import { SelectField } from "@/features/auth/ui/SelectField";
import { CheckboxField } from "@/features/auth/ui/CheckboxField";
import { PasswordRequirements, passwordMeetsRequirements } from "@/features/auth/ui/PasswordRequirements";
import { IconInfo, IconPencil } from "@/shared/ui/icons";
import { Toast } from "../ui/Toast";
import styles from "./MiPerfilSection.module.css";

type FieldKey = "firstName" | "lastName" | "dateOfBirth" | "phone" | "relationship";

interface OriginalValues {
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
 * This talks to the real backend — GET/PATCH /guardians/me and POST
 * /guardians/me/password on identity-service — nothing here is mock
 * data. */
export function MiPerfilSection({ onDirtyChange }: MiPerfilSectionProps) {
  const profileQuery = useMiPerfilTutor();
  const documentTypesQuery = useDocumentTypes();
  const relationshipTypesQuery = useRelationshipTypes();
  const updateProfile = useActualizarMiPerfilTutor();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [phone, setPhone] = useState("");
  const [relationshipTypeId, setRelationshipTypeId] = useState("");
  const [editingField, setEditingField] = useState<FieldKey | null>(null);
  const [truthfulConfirmed, setTruthfulConfirmed] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileToast, setProfileToast] = useState<string | null>(null);

  // Keeps a copy of the loaded profile so we can compare it against the
  // current form values and know if something changed (`isDirty` below).
  // This has to be state, not a ref: a ref would let us read a value that
  // is out of date, since changing a ref does not trigger a new render.
  const [original, setOriginal] = useState<OriginalValues | null>(null);

  // Fills the form the first time the profile finishes loading. The same
  // pattern is used in the registration forms for filling in catalog
  // defaults once they arrive.
  useEffect(() => {
    if (!profileQuery.data || original) return;
    const data = profileQuery.data;
    const phoneE164 = `+${data.phone_country_code}${data.phone_number}`;
    setFirstName(data.first_name);
    setLastName(data.last_name);
    setDateOfBirth(data.date_of_birth);
    setPhone(phoneE164);
    setRelationshipTypeId(String(data.relationship_type_id));
    setOriginal({
      firstName: data.first_name,
      lastName: data.last_name,
      dateOfBirth: data.date_of_birth,
      phone: phoneE164,
      relationshipTypeId: String(data.relationship_type_id),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileQuery.data]);

  const isDirty =
    original !== null &&
    (firstName !== original.firstName ||
      lastName !== original.lastName ||
      dateOfBirth !== original.dateOfBirth ||
      phone !== original.phone ||
      relationshipTypeId !== original.relationshipTypeId);

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  // Warns before actually leaving the app (closing the tab, reloading).
  // Switching sections while staying inside the portal is handled
  // separately, by the shell through onDirtyChange.
  useEffect(() => {
    function handler(event: BeforeUnloadEvent) {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  async function handleConfirmProfile(event: FormEvent) {
    event.preventDefault();
    setProfileError(null);
    const parsedPhone = parsePhoneNumber(phone);
    try {
      await updateProfile.mutateAsync({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        date_of_birth: dateOfBirth,
        phone_country_code: parsedPhone?.countryCallingCode ?? "",
        phone_number: parsedPhone?.nationalNumber ?? "",
        relationship_type_id: Number(relationshipTypeId),
      });
      setOriginal({ firstName, lastName, dateOfBirth, phone, relationshipTypeId });
      setEditingField(null);
      setTruthfulConfirmed(false);
      setProfileToast("Tus datos se guardaron correctamente.");
    } catch (error) {
      setProfileError(getAuthErrorMessage(error));
    }
  }

  if (profileQuery.isLoading) return <p>Cargando tu perfil…</p>;
  if (profileQuery.isError || !profileQuery.data) {
    return (
      <p role="alert" className={styles.error}>
        No pudimos cargar tu perfil. Intenta recargar la página.
      </p>
    );
  }

  const documentTypeName =
    documentTypesQuery.data?.find((d) => d.id === profileQuery.data.document_type_id)?.name ??
    "Cargando…";

  return (
    <div className={styles.section}>
      <div className={styles.notice}>
        <IconInfo className={styles.noticeIcon} />
        <div>
          <p className={styles.noticeHeading}>Cómo modificar tus datos:</p>
          <p className={styles.noticeText}>
            Toca el ícono de lápiz o haz doble clic sobre un campo editable para reescribirlo. Tu tipo y número de
            documento y tu correo electrónico son de solo lectura, porque identifican tu cuenta. Si decides cambiar
            tu contraseña, debe cumplir los mismos requisitos de seguridad que usaste al registrarte.
          </p>
        </div>
      </div>

      <form className={styles.form} onSubmit={handleConfirmProfile}>
        <h2 className={styles.groupTitle}>Mis datos</h2>

        <EditableRow
          label="Nombres"
          displayValue={firstName}
          editing={editingField === "firstName"}
          onStartEdit={() => setEditingField("firstName")}
        >
          <TextField
            id="perfil-first-name"
            label="Nombres"
            value={firstName}
            onChange={setFirstName}
            onBlur={() => setEditingField(null)}
            autoFocus
            required
          />
        </EditableRow>

        <EditableRow
          label="Apellidos"
          displayValue={lastName}
          editing={editingField === "lastName"}
          onStartEdit={() => setEditingField("lastName")}
        >
          <TextField
            id="perfil-last-name"
            label="Apellidos"
            value={lastName}
            onChange={setLastName}
            onBlur={() => setEditingField(null)}
            autoFocus
            required
          />
        </EditableRow>

        <EditableRow
          label="Fecha de nacimiento"
          displayValue={formatDateEs(dateOfBirth)}
          editing={editingField === "dateOfBirth"}
          onStartEdit={() => setEditingField("dateOfBirth")}
        >
          <TextField
            id="perfil-date-of-birth"
            label="Fecha de nacimiento"
            type="date"
            value={dateOfBirth}
            onChange={setDateOfBirth}
            onBlur={() => setEditingField(null)}
            autoFocus
            required
          />
        </EditableRow>

        <EditableRow
          label="Teléfono"
          displayValue={formatPhoneNumberIntl(phone) || phone}
          editing={editingField === "phone"}
          onStartEdit={() => setEditingField("phone")}
        >
          <PhoneField id="perfil-phone" label="Teléfono" value={phone} onChange={setPhone} required />
          <button type="button" className={styles.doneEditingButton} onClick={() => setEditingField(null)}>
            Listo
          </button>
        </EditableRow>

        <EditableRow
          label="Relación con el estudiante"
          displayValue={
            relationshipTypesQuery.data?.find((r) => r.id === Number(relationshipTypeId))?.name ?? "—"
          }
          editing={editingField === "relationship"}
          onStartEdit={() => setEditingField("relationship")}
        >
          <SelectField
            id="perfil-relationship"
            label="Relación con el estudiante"
            value={relationshipTypeId}
            onChange={(value) => {
              setRelationshipTypeId(value);
              setEditingField(null);
            }}
            options={(relationshipTypesQuery.data ?? []).map((r) => ({ value: String(r.id), label: r.name }))}
          />
        </EditableRow>

        <h2 className={styles.groupTitle}>Datos de solo lectura</h2>

        <ReadOnlyRow label="Tipo de documento" value={documentTypeName} />
        <ReadOnlyRow label="Número de documento" value={profileQuery.data.document_number} />
        <ReadOnlyRow label="Fecha de expedición del documento" value={formatDateEs(profileQuery.data.document_issued_at)} />
        <ReadOnlyRow label="Correo electrónico" value={profileQuery.data.email} />

        {isDirty && (
          <div className={styles.confirmBlock}>
            <CheckboxField id="perfil-declaro-veraz" checked={truthfulConfirmed} onChange={setTruthfulConfirmed}>
              Declaro que la información que acabo de modificar es correcta y veraz.
            </CheckboxField>
            {profileError && (
              <p role="alert" className={styles.error}>
                {profileError}
              </p>
            )}
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={!truthfulConfirmed || updateProfile.isPending}
            >
              {updateProfile.isPending ? "Guardando…" : "Confirmar cambios"}
            </button>
          </div>
        )}
      </form>

      <CambiarPasswordForm onSuccess={() => setProfileToast("Tu contraseña se actualizó correctamente.")} />

      {profileToast && <Toast message={profileToast} onDismiss={() => setProfileToast(null)} />}
    </div>
  );
}

function EditableRow({
  label,
  displayValue,
  editing,
  onStartEdit,
  children,
}: {
  label: string;
  displayValue: string;
  editing: boolean;
  onStartEdit: () => void;
  children: ReactNode;
}) {
  if (editing) {
    return <div className={styles.fieldEditing}>{children}</div>;
  }
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.editableValue} onDoubleClick={onStartEdit}>
        <span>{displayValue}</span>
        <button
          type="button"
          className={styles.editButton}
          onClick={onStartEdit}
          aria-label={`Editar ${label.toLowerCase()}`}
        >
          <IconPencil width={16} height={16} />
        </button>
      </div>
    </div>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.readOnlyValue}>{value}</div>
    </div>
  );
}

function CambiarPasswordForm({ onSuccess }: { onSuccess: () => void }) {
  const changePassword = useCambiarMiPassword();
  const [expanded, setExpanded] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);

  const passwordsMatch = password.length > 0 && password === passwordConfirmation;
  const canSubmit = passwordMeetsRequirements(password) && passwordsMatch;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await changePassword.mutateAsync({ password, password_confirmation: passwordConfirmation });
      setPassword("");
      setPasswordConfirmation("");
      setExpanded(false);
      onSuccess();
    } catch (err) {
      setError(getAuthErrorMessage(err));
    }
  }

  if (!expanded) {
    return (
      <button type="button" className={styles.textLink} onClick={() => setExpanded(true)}>
        Cambiar mi contraseña
      </button>
    );
  }

  return (
    <form className={styles.passwordForm} onSubmit={handleSubmit}>
      <h2 className={styles.groupTitle}>Cambiar mi contraseña</h2>
      <TextField
        id="perfil-nueva-password"
        label="Nueva contraseña"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        required
      />
      <PasswordRequirements password={password} />
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
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.passwordFormButtons}>
        <button type="button" className={styles.secondaryButton} onClick={() => setExpanded(false)}>
          Cancelar
        </button>
        <button type="submit" className={styles.primaryButton} disabled={!canSubmit || changePassword.isPending}>
          {changePassword.isPending ? "Actualizando…" : "Actualizar contraseña"}
        </button>
      </div>
    </form>
  );
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
