import { useState, type FormEvent } from "react";
import type { GuardianProfile } from "@iris/shared-types";
import { formatPhoneNumberIntl, parsePhoneNumber } from "react-phone-number-input";
import {
  useActualizarMiPerfilTutor,
  useCambiarMiPassword,
  useDocumentTypes,
  useMiPerfilTutor,
  useRelationshipTypes,
} from "@/shared/api/hooks/useAuthApi";
import { Navigate } from "react-router-dom";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { TextField } from "@/features/auth/ui/TextField";
import { PhoneField } from "@/features/auth/ui/PhoneField";
import { SelectField } from "@/features/auth/ui/SelectField";
import {
  adultBirthDateError,
  latestAdultBirthDate,
  MAX_AGE,
  nameError,
  phoneError,
  toIsoDate,
} from "@/features/utils/personValidation";
import { formatDate } from "@/features/utils/formatDate";
import { IconLock, IconUserCircle } from "@/shared/ui/icons";
import { Card, EDIT_HINT, EditableRow, ReadOnlyRow, SaveBar } from "@/shared/ui/profile/ProfileForm";
import { useProfileForm } from "@/shared/ui/profile/useProfileForm";
import form from "@/shared/ui/profile/ProfileForm.module.css";
import { Toast } from "@/shared/ui/Toast";
import { IdentityChangeNotice, SecurityCard } from "@/shared/ui/profile/AccountSections";
import { ProfileHero } from "@/shared/ui/profile/ProfileHero";
import { isPortalAccessRequired, useWithPortalAccess } from "../portalAccess";
import styles from "@/shared/ui/profile/ProfileSection.module.css";

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
  const changePassword = useCambiarMiPassword();
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
      <ProfileHero
        firstName={original.firstName}
        lastName={original.lastName}
        role={relationshipName(original.relationshipTypeId)}
        email={profile.email}
      />

      <form id="perfil-datos-form" className={form.form} onSubmit={handleConfirmProfile}>
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

          <IdentityChangeNotice />
        </Card>
      </form>

      <SecurityCard changePassword={changePassword} />

      {/* Out of the form and last, so it floats over every card while
          scrolling. It saves the form above through formId. */}
      <SaveBar
        formId="perfil-datos-form"
        shown={fields.saveBarShown}
        leaving={fields.saveBarLeaving}
        confirmed={fields.confirmed}
        onConfirmedChange={fields.setConfirmed}
        hasErrors={hasErrors}
        error={profileError}
        saving={updateProfile.isPending}
        onDiscard={discardChanges}
      />

      {profileToast && <Toast message={profileToast} onDismiss={() => setProfileToast(null)} />}
    </div>
  );
}
