import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import type { StudentDetail } from "@iris/shared-types";
import {
  useActualizarEstudianteDeTutor,
  useAvatars,
  useCambiarPinDeEstudiante,
  useComprobarPinDeEstudiante,
  useEstudianteDeTutor,
  useSupportConditions,
} from "@/shared/api/hooks/useAuthApi";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { TextField } from "@/features/auth/ui/TextField";
import { SupportConditionsField } from "@/features/auth/ui/SupportConditionsField";
import { formatDate } from "@/features/utils/formatDate";
import { nameError, studentBirthDateError, toIsoDate } from "@/features/utils/personValidation";
import { includesOtherCondition, supportConditionNames } from "@/features/utils/supportCondition";
import { IconImage, IconKey, IconSparkle, IconUserCircle } from "@/shared/ui/icons";
import { StudentAvatarImage } from "@/shared/ui/StudentAvatarImage";
import { Card, EDIT_HINT, EditableRow, SaveBar } from "@/shared/ui/profile/ProfileForm";
import { useProfileForm } from "@/shared/ui/profile/useProfileForm";
import form from "@/shared/ui/profile/ProfileForm.module.css";
import styles from "./SusDatosSection.module.css";
import { ChangePinDialog } from "../ui/ChangePinDialog";
import { Toast } from "@/shared/ui/Toast";
import { TwoFactorCodeDialog } from "@/shared/ui/profile/TwoFactorCodeDialog";
import { isPortalAccessRequired, useWithPortalAccess } from "../portalAccess";

type StudentValues = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  avatarId: string;
  // The ids of the conditions joined with commas ("3,4"), because the form
  // keeps every value as a text. See toIds and fromIds.
  supportConditionIds: string;
  supportConditionOther: string;
  additionalSupportNeed: string;
};

interface SusDatosSectionProps {
  studentId: string;
  /** Tells the kid's space there are unsaved changes, so it can warn
   * before going back. */
  onDirtyChange: (dirty: boolean) => void;
}

/** "Sus datos": lets a guardian see and edit the data of one of their kids,
 * the same way as their own in Mi perfil. It uses GET/PATCH
 * /guardians/me/students/{id} on identity-service. */
export function SusDatosSection({ studentId, onDirtyChange }: SusDatosSectionProps) {
  const studentQuery = useEstudianteDeTutor(studentId);

  if (studentQuery.isLoading) return <p className={form.status}>Cargando sus datos…</p>;
  // Nothing typed yet to keep, so a closed portal just goes to the code screen.
  if (isPortalAccessRequired(studentQuery.error)) return <Navigate to="/guardian/verify-2fa" replace />;
  if (studentQuery.isError || !studentQuery.data) {
    return (
      <p role="alert" className={`${form.status} ${form.error}`}>
        No pudimos cargar sus datos. Intenta recargar la página.
      </p>
    );
  }
  return <StudentEditor student={studentQuery.data} onDirtyChange={onDirtyChange} />;
}

function fromIds(ids: readonly number[]): string {
  return [...ids].sort((a, b) => a - b).join(",");
}

function toIds(text: string): number[] {
  return text ? text.split(",").map(Number) : [];
}

function toValues(student: StudentDetail): StudentValues {
  return {
    firstName: student.first_name,
    lastName: student.last_name,
    dateOfBirth: student.date_of_birth,
    avatarId: String(student.avatar_id),
    supportConditionIds: fromIds(student.support_condition_ids),
    supportConditionOther: student.support_condition_other ?? "",
    additionalSupportNeed: student.additional_support_need ?? "",
  };
}

function StudentEditor({ student, onDirtyChange }: { student: StudentDetail; onDirtyChange: (dirty: boolean) => void }) {
  const supportConditionsQuery = useSupportConditions();
  const avatarsQuery = useAvatars();
  const updateStudent = useActualizarEstudianteDeTutor(student.id);
  const withPortalAccess = useWithPortalAccess();

  const fields = useProfileForm<StudentValues>(() => toValues(student), onDirtyChange);
  const { values } = fields;
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // The catalogs arrive a moment after the kid's data.
  const conditions = supportConditionsQuery.data ?? [];
  // A kid can have several conditions.
  const conditionIds = toIds(values.supportConditionIds);
  const conditionNames = supportConditionNames(conditionIds, conditions);
  const conditionsText = conditionNames.join(", ") || (supportConditionsQuery.isLoading ? "Cargando…" : "—");
  // The free text only goes with "Otra condición (especificar)".
  const isOtherCondition = includesOtherCondition(conditionIds, conditions);
  const avatars = avatarsQuery.data ?? [];
  const avatarName =
    avatars.find((a) => a.id === Number(values.avatarId))?.name ?? (avatarsQuery.isLoading ? "Cargando…" : "—");

  // Same rules the server applies.
  const errors: Partial<Record<keyof StudentValues, string | null>> = {
    firstName: nameError(values.firstName, "Ingresa sus nombres."),
    lastName: nameError(values.lastName, "Ingresa sus apellidos."),
    dateOfBirth: studentBirthDateError(values.dateOfBirth),
    supportConditionIds: conditionIds.length === 0 ? "Marca al menos una condición." : null,
    supportConditionOther: isOtherCondition && !values.supportConditionOther.trim() ? "Especifica la condición." : null,
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const rowProps = (field: keyof StudentValues) => fields.rowProps(field, errors[field] ?? null);

  function discardChanges() {
    fields.discardChanges();
    setSaveError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (hasErrors || !fields.confirmed) return;
    setSaveError(null);
    try {
      const updated = await withPortalAccess(() =>
        updateStudent.mutateAsync({
          first_name: values.firstName.trim(),
          last_name: values.lastName.trim(),
          date_of_birth: values.dateOfBirth,
          avatar_id: Number(values.avatarId),
          support_condition_ids: conditionIds,
          support_condition_other: isOtherCondition ? values.supportConditionOther.trim() : null,
          additional_support_need: values.additionalSupportNeed.trim() || null,
          truthful_declaration: true,
        }),
      );
      // What the server saved, which can differ a bit (it joins extra spaces).
      fields.markSaved(toValues(updated));
      setToast(`Los datos de ${updated.first_name} se guardaron correctamente.`);
    } catch (error) {
      setSaveError(getAuthErrorMessage(error));
    }
  }

  return (
    <div className={styles.stack}>
      <form id="sus-datos-form" className={form.form} onSubmit={handleSubmit}>
        <Card
          id="peque-datos-personales"
          icon={<IconUserCircle width={22} height={22} />}
          title="Datos personales"
          hint={`Estos son los datos personales de tu peque, los que nos diste al registrarlo. ${EDIT_HINT}`}
        >
          <div className={form.fieldGrid}>
            <EditableRow label="Nombres" displayValue={values.firstName} {...rowProps("firstName")}>
              <TextField
                id="peque-first-name"
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
                id="peque-last-name"
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
                id="peque-date-of-birth"
                label="Fecha de nacimiento"
                type="date"
                max={toIsoDate(new Date())}
                value={values.dateOfBirth}
                onChange={(v) => fields.setField("dateOfBirth", v)}
                autoFocus
                required
              />
            </EditableRow>
          </div>
        </Card>

        <Card
          id="peque-apoyos"
          icon={<IconSparkle width={20} height={20} />}
          title="Condición o necesidad de apoyo"
          hint="Cuéntanos si tu peque tiene alguna condición o necesita un apoyo adicional. Con esta información sus docentes pueden conocerlo mejor y darle un mejor seguimiento y acompañamiento. Puedes actualizarla cuando quieras."
        >
          <div className={form.fieldGrid}>
            <EditableRow
              label={conditionIds.length > 1 ? "Condiciones" : "Condición"}
              displayValue={conditionsText}
              {...rowProps("supportConditionIds")}
            >
              <SupportConditionsField
                id="peque-support-condition"
                label="Condición o condiciones"
                options={conditions}
                value={conditionIds}
                onChange={(ids) => fields.setField("supportConditionIds", fromIds(ids))}
                error={errors.supportConditionIds ?? undefined}
                required
              />
            </EditableRow>

            {isOtherCondition && (
              <EditableRow
                label="Cuál condición"
                displayValue={values.supportConditionOther || "Sin especificar"}
                {...rowProps("supportConditionOther")}
              >
                <TextField
                  id="peque-support-condition-other"
                  label="Cuál condición"
                  value={values.supportConditionOther}
                  onChange={(v) => fields.setField("supportConditionOther", v)}
                  maxLength={200}
                  autoFocus
                  required
                />
              </EditableRow>
            )}

            <EditableRow
              label="Necesidad de apoyo adicional"
              displayValue={values.additionalSupportNeed || "No indicada"}
              {...rowProps("additionalSupportNeed")}
            >
              <TextField
                id="peque-additional-support-need"
                label="Necesidad de apoyo adicional (opcional)"
                value={values.additionalSupportNeed}
                onChange={(v) => fields.setField("additionalSupportNeed", v)}
                maxLength={500}
                placeholder="Ej.: le cuesta sostener el mouse, necesita más tiempo para las actividades…"
                multiline
                autoFocus
              />
            </EditableRow>
          </div>
        </Card>

        <Card
          id="peque-avatar"
          icon={<IconImage width={20} height={20} />}
          title="Su avatar"
          hint="Es la imagen con la que tu peque se reconoce al entrar a IRIS."
        >
          <div className={form.fieldGrid}>
            <EditableRow
              label="Avatar"
              // Only the picture: avatars don't show a name. The name stays
              // as the image's text for screen readers.
              displayValue={<StudentAvatarImage avatarId={Number(values.avatarId)} size="large" label={avatarName} />}
              {...rowProps("avatarId")}
            >
              <span className={styles.avatarLabel} id="peque-avatar-label">
                Avatar
              </span>
              <div className={styles.avatarGrid} role="radiogroup" aria-labelledby="peque-avatar-label">
                {avatars.map((option) => {
                  const selected = values.avatarId === String(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={option.name}
                      className={selected ? `${styles.avatarOption} ${styles.avatarOptionSelected}` : styles.avatarOption}
                      onClick={() => fields.setField("avatarId", String(option.id))}
                    >
                      <StudentAvatarImage avatarId={option.id} size="large" label="" />
                    </button>
                  );
                })}
              </div>
            </EditableRow>
          </div>
        </Card>
      </form>

      <PinCard studentId={student.id} firstName={student.first_name} onChanged={setToast} />

      {/* Out of the form and last, so it floats over every card while
          scrolling. It saves the form above through formId. */}
      <SaveBar
        formId="sus-datos-form"
        shown={fields.saveBarShown}
        leaving={fields.saveBarLeaving}
        confirmed={fields.confirmed}
        onConfirmedChange={fields.setConfirmed}
        hasErrors={hasErrors}
        error={saveError}
        saving={updateStudent.isPending}
        onDiscard={discardChanges}
      />

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}

interface PinCardProps {
  studentId: string;
  firstName: string;
  onChanged: (message: string) => void;
}

// The PIN is changed on its own, apart from the rest of the data, in two
// floating dialogs: first the number pad (current PIN, new one, new one
// again) and then the code of the authenticator app.
function PinCard({ studentId, firstName, onChanged }: PinCardProps) {
  const changePin = useCambiarPinDeEstudiante(studentId);
  const checkPin = useComprobarPinDeEstudiante(studentId);
  const withPortalAccess = useWithPortalAccess();
  const [stage, setStage] = useState<"closed" | "pin" | "code">("closed");
  const [pins, setPins] = useState({ currentPin: "", pin: "" });
  // Why the server didn't accept the change, shown when starting again.
  const [error, setError] = useState<string | null>(null);

  function close() {
    setStage("closed");
    setPins({ currentPin: "", pin: "" });
    setError(null);
  }

  // Wrong codes and waits stay inside the code dialog.
  async function changeWithCode(code: string) {
    await changePin.mutateAsync({ current_pin: pins.currentPin, code, pin: pins.pin, pin_confirmation: pins.pin });
    close();
    onChanged(`El PIN de ${firstName} se cambió correctamente.`);
  }

  // Anything else (a wrong current PIN, for example) goes back to the pad,
  // to type the PINs again.
  function startAgain(err: unknown) {
    setPins({ currentPin: "", pin: "" });
    setError(getAuthErrorMessage(err));
    setStage("pin");
  }

  return (
    <Card
      id="peque-pin"
      icon={<IconKey width={20} height={20} />}
      title="Su PIN"
      hint="Son los 4 dígitos con los que tu peque entra a IRIS. Al cambiarlo cerramos sus sesiones abiertas."
    >
      <div className={styles.pinRow}>
        <div className={form.field}>
          <span className={form.fieldLabel}>PIN</span>
          <span className={`${form.fieldValue} ${styles.pinDots}`} aria-label="PIN oculto">
            ••••
          </span>
        </div>
        <button type="button" className={form.secondaryButton} onClick={() => setStage("pin")}>
          Cambiar PIN
        </button>
      </div>
      {stage === "pin" && (
        <ChangePinDialog
          firstName={firstName}
          initialError={error}
          onCheckCurrent={(currentPin) => withPortalAccess(() => checkPin.mutateAsync({ current_pin: currentPin }))}
          onComplete={(typed) => {
            setPins(typed);
            setError(null);
            setStage("code");
          }}
          onCancel={close}
        />
      )}
      {stage === "code" && (
        <TwoFactorCodeDialog
          title="Confirma el cambio de PIN"
          text={`Para cambiar el PIN de ${firstName}, escribe el código de 6 dígitos que muestra tu aplicación autenticadora.`}
          onSubmit={changeWithCode}
          onCancel={close}
          onOtherError={startAgain}
        />
      )}
    </Card>
  );
}
