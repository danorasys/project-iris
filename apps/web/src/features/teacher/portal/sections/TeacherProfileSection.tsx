import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from "react";
import type { TeacherAccount, TeacherProfile } from "@iris/shared-types";
import { formatPhoneNumberIntl, parsePhoneNumber } from "react-phone-number-input";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { PhoneField } from "@/features/auth/ui/PhoneField";
import { TextField } from "@/features/auth/ui/TextField";
import { formatDate } from "@/features/utils/formatDate";
import {
  adultBirthDateError,
  latestAdultBirthDate,
  MAX_AGE,
  nameError,
  phoneError,
  toIsoDate,
} from "@/features/utils/personValidation";
import { useDocumentTypes } from "@/shared/api/hooks/useAuthApi";
import {
  useChangeMyTeacherPassword,
  useGuardarMiPerfilDocente,
  useMiPerfilDocente,
  useMyTeacherAccount,
  useUpdateMyTeacherAccount,
} from "@/shared/api/hooks/useTeacherProfileApi";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { IconBriefcase, IconGraduationCap, IconLock, IconPencil, IconUserCircle } from "@/shared/ui/icons";
import { IdentityChangeNotice, SecurityCard } from "@/shared/ui/profile/AccountSections";
import { Card, EDIT_HINT, EditableRow, ReadOnlyRow, SaveBar } from "@/shared/ui/profile/ProfileForm";
import form from "@/shared/ui/profile/ProfileForm.module.css";
import { ProfileHero } from "@/shared/ui/profile/ProfileHero";
import styles from "@/shared/ui/profile/ProfileSection.module.css";
import { useProfileForm } from "@/shared/ui/profile/useProfileForm";
import { Toast } from "@/shared/ui/Toast";
import { TeacherProfileFields } from "../../profile/TeacherProfileFields";
import {
  draftFromProfile,
  firstOpenEntry,
  monthLabel,
  OPEN_ENTRY_MESSAGE,
  profileDraftErrors,
  profileFromDraft,
  sortExperiences,
  sortStudies,
  STUDY_LEVEL_LABELS,
  type ExperienceDraft,
  type ProfileDraft,
  type StudyDraft,
} from "../../profile/teacherProfileDraft";
import own from "./TeacherProfileSection.module.css";

const ID_PREFIX = "my-teacher-profile";
const INSTITUTION_MAX = 200;

// A type and not an interface: useProfileForm asks for a plain record of
// texts, and an interface doesn't count as one for TypeScript.
type AccountValues = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string;
  institution: string;
};

interface TeacherProfileSectionProps {
  /** Tells the portal when there are changes not saved yet, so leaving
   * the section asks first. */
  onDirtyChange: (dirty: boolean) => void;
}

/** The teacher's "Mi perfil", built like the guardian's: personal data
 * (HU-71), account data (read only), teacher profile (HU-96) and security
 * (HU-72), with one save bar and its truthful declaration. */
export function TeacherProfileSection({ onDirtyChange }: TeacherProfileSectionProps) {
  const account = useMyTeacherAccount();

  if (account.isLoading) return <p className={styles.status}>Cargando tu perfil…</p>;
  if (account.isError || !account.data) {
    return (
      <p role="alert" className={`${styles.status} ${form.error}`}>
        No pudimos cargar tu perfil. Intenta recargar la página.
      </p>
    );
  }
  // The editor only mounts once the account is here, so it starts with the
  // real data instead of filling itself in later.
  return <AccountEditor account={account.data} onDirtyChange={onDirtyChange} />;
}

function toValues(account: TeacherAccount): AccountValues {
  return {
    firstName: account.first_name,
    lastName: account.last_name,
    dateOfBirth: account.date_of_birth,
    phone: `+${account.phone_country_code}${account.phone_number}`,
    institution: account.institution ?? "",
  };
}

interface AccountEditorProps {
  account: TeacherAccount;
  onDirtyChange: (dirty: boolean) => void;
}

// The teacher profile while it's being edited: the draft, each study and
// job as it was last confirmed (check), whether anything was typed at all,
// and the errors found when saving.
interface TeachingEdit {
  draft: ProfileDraft;
  confirmed: Record<string, StudyDraft | ExperienceDraft>;
  touched: boolean;
  errors: Record<string, string>;
}

// The profile as the save bar sees it: "Sobre mí" as typed, but studies and
// jobs only as they were confirmed (check). A reopened card counts with its
// old values until confirmed again; a removed one is gone at once.
function confirmedProfileText(edit: Pick<TeachingEdit, "draft" | "confirmed">): string {
  const confirmedOnly = <T extends StudyDraft | ExperienceDraft>(entries: T[]): T[] =>
    entries.flatMap((entry) => {
      if (!entry.editing) return [entry];
      const before = edit.confirmed[entry.key] as T | undefined;
      return before ? [before] : [];
    });
  return JSON.stringify(
    profileFromDraft({
      about: edit.draft.about,
      studies: sortStudies(confirmedOnly(edit.draft.studies)),
      experiences: sortExperiences(confirmedOnly(edit.draft.experiences)),
    }),
  );
}

function confirmedEntries(draft: ProfileDraft): Record<string, StudyDraft | ExperienceDraft> {
  const confirmed: Record<string, StudyDraft | ExperienceDraft> = {};
  for (const entry of [...draft.studies, ...draft.experiences]) {
    if (!entry.editing) confirmed[entry.key] = entry;
  }
  return confirmed;
}

function AccountEditor({ account, onDirtyChange }: AccountEditorProps) {
  const documentTypes = useDocumentTypes();
  const updateAccount = useUpdateMyTeacherAccount();
  const changePassword = useChangeMyTeacherPassword();
  const teachingProfile = useMiPerfilDocente();
  const saveTeachingProfile = useGuardarMiPerfilDocente();

  // null while the teacher profile is only being read.
  const [teaching, setTeaching] = useState<TeachingEdit | null>(null);
  const editTeachingButton = useRef<HTMLButtonElement>(null);

  // The saved teacher profile, as the save bar compares it.
  const savedTeachingText = useMemo(() => {
    if (!teachingProfile.data) return null;
    const draft = draftFromProfile(teachingProfile.data);
    return confirmedProfileText({ draft, confirmed: {} });
  }, [teachingProfile.data]);
  const teachingDirty = teaching !== null && confirmedProfileText(teaching) !== savedTeachingText;

  // One bar for everything: it shows up when the personal data or the
  // confirmed part of the teacher profile changed, and its "Guardar cambios"
  // saves both.
  const [formDirty, setFormDirty] = useState(false);
  const fields = useProfileForm<AccountValues>(() => toValues(account), setFormDirty, teachingDirty);
  const { values, original } = fields;

  // Leaving the section asks first also while a card is half typed, even if
  // the bar isn't showing yet: what was typed would be lost.
  const unsaved = formDirty || (teaching?.touched ?? false);
  useEffect(() => {
    onDirtyChange(unsaved);
  }, [unsaved, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function openTeaching() {
    if (!teachingProfile.data) return;
    const draft = draftFromProfile(teachingProfile.data);
    setTeaching({ draft, confirmed: confirmedEntries(draft), touched: false, errors: {} });
  }

  // The focus goes back to the button that opened the editor. It waits one
  // frame because the button only exists again after the next render.
  function closeTeaching() {
    setTeaching(null);
    requestAnimationFrame(() => editTeachingButton.current?.focus());
  }

  // Every card that is closed now is how it was confirmed last.
  const changeTeaching = useCallback((draft: ProfileDraft) => {
    setTeaching((current) =>
      current
        ? { ...current, draft, confirmed: { ...current.confirmed, ...confirmedEntries(draft) }, touched: true }
        : current,
    );
  }, []);

  // Same rules the server applies. They show under each field once it's
  // closed, and while any is left "Guardar cambios" stays locked.
  const errors: Partial<Record<keyof AccountValues, string | null>> = {
    firstName: nameError(values.firstName, "Ingresa tus nombres."),
    lastName: nameError(values.lastName, "Ingresa tus apellidos."),
    dateOfBirth: adultBirthDateError(values.dateOfBirth, { documentIssuedAt: account.document_issued_at }),
    phone: phoneError(values.phone),
    institution:
      values.institution.trim().length > INSTITUTION_MAX
        ? `La institución puede tener hasta ${INSTITUTION_MAX} caracteres.`
        : null,
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const rowProps = (field: keyof AccountValues) => fields.rowProps(field, errors[field] ?? null);

  // "Descartar" puts back everything: the personal data and the teacher
  // profile being edited.
  function discardChanges() {
    fields.discardChanges();
    if (teaching) closeTeaching();
    setSaveError(null);
  }

  // The teacher profile is checked first, so nothing is saved while one of
  // its cards is still open or has a mistake.
  function teachingToSave(): TeacherProfile | "fix" | null {
    if (!teaching || !teachingDirty) return null;
    const open = firstOpenEntry(teaching.draft);
    if (open) {
      setSaveError(OPEN_ENTRY_MESSAGE);
      document.getElementById(`${ID_PREFIX}-${open}`)?.focus();
      return "fix";
    }
    const found = profileDraftErrors(teaching.draft);
    setTeaching({ ...teaching, errors: found });
    const firstKey = Object.keys(found)[0];
    if (firstKey) {
      setSaveError("Revisa los datos marcados en tu perfil docente.");
      document.getElementById(`${ID_PREFIX}-${firstKey}`)?.focus();
      return "fix";
    }
    return profileFromDraft(teaching.draft);
  }

  async function handleConfirm(event: FormEvent) {
    event.preventDefault();
    if (!fields.confirmed || (fields.fieldsDirty && hasErrors)) return;
    setSaveError(null);
    const teachingProfileBody = teachingToSave();
    if (teachingProfileBody === "fix") return;
    try {
      // Each part goes to its own route, and each one leaves its own record
      // of what changed, with the same declaration.
      if (fields.fieldsDirty) {
        const parsedPhone = parsePhoneNumber(values.phone);
        const saved = await updateAccount.mutateAsync({
          first_name: values.firstName.trim(),
          last_name: values.lastName.trim(),
          date_of_birth: values.dateOfBirth,
          phone_country_code: parsedPhone?.countryCallingCode ?? "",
          phone_number: parsedPhone?.nationalNumber ?? "",
          institution: values.institution.trim() || null,
          truthful_declaration: true,
        });
        // What the server saved, which can differ a bit (it joins extra spaces).
        fields.markSaved(toValues(saved));
      }
      if (teachingProfileBody) {
        // The saved profile becomes the cached one, the card reads it.
        await saveTeachingProfile.mutateAsync(teachingProfileBody);
        closeTeaching();
      }
      fields.setConfirmed(false);
      setToast("Tus datos se guardaron correctamente.");
    } catch (error) {
      setSaveError(getAuthErrorMessage(error));
    }
  }

  const documentTypeName =
    documentTypes.data?.find((d) => d.id === account.document_type_id)?.name ??
    (documentTypes.isLoading ? "Cargando…" : "—");

  // The calendar only offers birth dates of adults, and not after the
  // document was issued.
  const today = new Date();
  const latestBirthDate = [latestAdultBirthDate(today), account.document_issued_at]
    .filter((date): date is string => Boolean(date))
    .sort()[0];
  const earliestBirthDate = toIsoDate(new Date(today.getFullYear() - MAX_AGE, today.getMonth(), today.getDate()));

  return (
    <div className={styles.section}>
      {/* The header shows the saved data, not what is being typed. */}
      <ProfileHero firstName={original.firstName} lastName={original.lastName} role="Docente" email={account.email} />

      <form id="profile-data-form" className={form.form} onSubmit={handleConfirm}>
        <Card
          id="profile-personal-data"
          icon={<IconUserCircle width={22} height={22} />}
          title="Datos personales"
          hint={`Estos son tus datos personales, los que nos diste al crear tu cuenta. ${EDIT_HINT}`}
        >
          <div className={form.fieldGrid}>
            <EditableRow label="Nombres" displayValue={values.firstName} {...rowProps("firstName")}>
              <TextField
                id="profile-first-name"
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
                id="profile-last-name"
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
                id="profile-date-of-birth"
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
                id="profile-phone"
                label="Teléfono"
                value={values.phone}
                onChange={(v) => fields.setField("phone", v)}
                required
              />
            </EditableRow>

            <EditableRow
              label="Institución (opcional)"
              displayValue={values.institution.trim() || "Sin indicar"}
              {...rowProps("institution")}
            >
              <TextField
                id="profile-institution"
                label="Institución (opcional)"
                value={values.institution}
                onChange={(v) => fields.setField("institution", v)}
                maxLength={INSTITUTION_MAX}
                autoFocus
              />
            </EditableRow>
          </div>
        </Card>

        <Card
          id="profile-identification"
          icon={<IconLock width={20} height={20} />}
          title="Identificación de la cuenta"
          hint="Tu documento de identidad y tu correo electrónico son los datos con los que IRIS te reconoce como titular de esta cuenta y con los que inicias sesión. Para proteger tu cuenta y la información de tus estudiantes, no se pueden cambiar directamente desde aquí."
          muted
        >
          <div className={form.fieldGrid}>
            <ReadOnlyRow label="Tipo de documento" value={documentTypeName} />
            <ReadOnlyRow label="Número de documento" value={account.document_number} />
            <ReadOnlyRow
              label="Fecha de expedición"
              value={account.document_issued_at ? formatDate(account.document_issued_at) : "Sin registrar"}
            />
            <ReadOnlyRow label="Correo electrónico" value={account.email} />
          </div>
          <IdentityChangeNotice />
        </Card>
      </form>

      <TeachingProfileCard
        profile={teachingProfile.data}
        loading={teachingProfile.isLoading}
        failed={teachingProfile.isError}
        editing={teaching}
        saving={saveTeachingProfile.isPending}
        editButton={editTeachingButton}
        onOpen={openTeaching}
        onChange={changeTeaching}
        onClose={closeTeaching}
      />

      <SecurityCard changePassword={changePassword} />

      {/* Out of the form and last, so it floats over every card while
          scrolling. It saves the form above through formId. */}
      <SaveBar
        formId="profile-data-form"
        shown={fields.saveBarShown}
        leaving={fields.saveBarLeaving}
        confirmed={fields.confirmed}
        onConfirmedChange={fields.setConfirmed}
        hasErrors={fields.fieldsDirty && hasErrors}
        error={saveError}
        saving={updateAccount.isPending || saveTeachingProfile.isPending}
        onDiscard={discardChanges}
      />

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}

// The teacher profile (HU-96), what the families see. Read only until
// "Editar perfil docente" opens the editor; its changes are saved with the
// floating bar, together with the personal data.
interface TeachingProfileCardProps {
  profile: TeacherProfile | undefined;
  loading: boolean;
  failed: boolean;
  /** null while it's only being read. */
  editing: TeachingEdit | null;
  saving: boolean;
  editButton: RefObject<HTMLButtonElement | null>;
  onOpen: () => void;
  onChange: (draft: ProfileDraft) => void;
  onClose: () => void;
}

function TeachingProfileCard({
  profile,
  loading,
  failed,
  editing,
  saving,
  editButton,
  onOpen,
  onChange,
  onClose,
}: TeachingProfileCardProps) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  // Closing the editor after typing anything asks first, it would be lost.
  function cancel() {
    if (editing?.touched) setConfirmingCancel(true);
    else onClose();
  }

  return (
    <Card
      id="profile-teacher"
      icon={<IconBriefcase width={20} height={20} />}
      title="Perfil docente"
      hint='Tu presentación, tus estudios y tu experiencia: lo que ven las familias de tus estudiantes. Para cambiarlos, pulsa Editar perfil docente. Para que tus cambios queden guardados, pulsa "Guardar cambios" en la barra que aparecerá en la parte inferior.'
    >
      {loading && <p className={styles.status}>Cargando tu perfil docente…</p>}
      {failed && (
        <p role="alert" className={`${styles.status} ${form.error}`}>
          No pudimos cargar tu perfil docente. Intenta recargar la página.
        </p>
      )}
      {profile &&
        (editing ? (
          <div className={own.form} role="group" aria-label="Editar perfil docente">
            <TeacherProfileFields
              idPrefix={ID_PREFIX}
              draft={editing.draft}
              onChange={onChange}
              errors={editing.errors}
              disabled={saving}
              showIntro={false}
            />
            <div className={own.actions}>
              <button type="button" className={form.secondaryButton} onClick={cancel} disabled={saving}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <>
            <TeachingProfileView profile={profile} />
            <div className={own.actions}>
              <button ref={editButton} type="button" className={form.secondaryButton} onClick={onOpen}>
                <IconPencil width={16} height={16} aria-hidden="true" />
                Editar perfil docente
              </button>
            </div>
          </>
        ))}
      {confirmingCancel && (
        <ConfirmDialog
          title="Cambios sin guardar"
          message="Tienes cambios sin guardar en tu perfil docente. Se perderán si cancelas."
          acceptLabel="Descartar cambios"
          cancelLabel="Seguir editando"
          danger
          onAccept={() => {
            setConfirmingCancel(false);
            onClose();
          }}
          onCancel={() => setConfirmingCancel(false)}
        />
      )}
    </Card>
  );
}

// The saved profile to read, with the same labels and texts as the rest of
// Mi perfil. The newest study and job come first, like the server keeps them.
function TeachingProfileView({ profile }: { profile: TeacherProfile }) {
  return (
    <div className={own.view}>
      <div className={form.field}>
        <span className={form.fieldLabel}>Sobre mí</span>
        {profile.about ? (
          <p className={own.about}>{profile.about}</p>
        ) : (
          <p className={own.empty}>Aún no has escrito tu presentación.</p>
        )}
      </div>

      <div className={form.field}>
        <span className={form.fieldLabel}>Estudios</span>
        {profile.studies.length === 0 ? (
          <p className={own.empty}>Aún no has agregado estudios.</p>
        ) : (
          <ul className={own.entries} aria-label="Tus estudios">
            {profile.studies.map((study, index) => (
              <li key={index} className={own.entry}>
                <span className={own.entryIcon} aria-hidden="true">
                  <IconGraduationCap width={18} height={18} />
                </span>
                <div className={own.entryText}>
                  <p className={own.entryTitle}>{study.title}</p>
                  <p className={own.entryLine}>
                    {study.institution} · {STUDY_LEVEL_LABELS[study.level]}
                  </p>
                  <p className={own.entryLine}>
                    {study.in_progress || !study.end_month ? "En curso" : `Terminó en ${monthLabel(study.end_month)}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={form.field}>
        <span className={form.fieldLabel}>Experiencia</span>
        {profile.experiences.length === 0 ? (
          <p className={own.empty}>Aún no has agregado experiencia.</p>
        ) : (
          <ul className={own.entries} aria-label="Tu experiencia">
            {profile.experiences.map((job, index) => (
              <li key={index} className={own.entry}>
                <span className={own.entryIcon} aria-hidden="true">
                  <IconBriefcase width={18} height={18} />
                </span>
                <div className={own.entryText}>
                  <p className={own.entryTitle}>{job.role}</p>
                  <p className={own.entryLine}>{job.place}</p>
                  <p className={own.entryLine}>
                    {monthLabel(job.start_month)} – {job.end_month ? monthLabel(job.end_month) : "actualidad"}
                  </p>
                  {job.description && <p className={own.description}>{job.description}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
