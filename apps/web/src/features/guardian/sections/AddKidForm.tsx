import { useState, type FormEvent } from "react";
import type { StudentProfile } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { SupportConditionsField } from "@/features/auth/ui/SupportConditionsField";
import { TextField } from "@/features/auth/ui/TextField";
import { nameError, studentBirthDateError } from "@/features/utils/personValidation";
import { includesOtherCondition } from "@/features/utils/supportCondition";
import { useAddStudent, useAvatars, useSupportConditions } from "@/shared/api/hooks/useAuthApi";
import { IconArrowLeft, IconImage, IconKey, IconUserCircle } from "@/shared/ui/icons";
import { Card } from "@/shared/ui/profile/ProfileForm";
import form from "@/shared/ui/profile/ProfileForm.module.css";
import { StudentAvatarImage } from "@/shared/ui/StudentAvatarImage";
import { PIN_LENGTH } from "../ui/ChangePinDialog";
import { useWithPortalAccess } from "../portalAccess";
import kidData from "./SusDatosSection.module.css";
import styles from "./MisPequesSection.module.css";

type Field = "firstName" | "lastName" | "birthDate" | "conditions" | "conditionOther" | "pin" | "pinAgain";

interface AddKidFormProps {
  onBack: () => void;
  /** With the new kid, to open their space. */
  onCreated: (student: StudentProfile) => void;
}

/** HU-50: a new kid under the same guardian, with only their own data: the
 * same fields as the first kid of the registration (their data, their
 * conditions, the avatar the family picks and their PIN). Their gaze is
 * calibrated by the kid the first time they come in. */
export function AddKidForm({ onBack, onCreated }: AddKidFormProps) {
  const add = useAddStudent();
  const withPortalAccess = useWithPortalAccess();
  const conditions = useSupportConditions().data ?? [];
  const avatars = useAvatars().data ?? [];
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [conditionIds, setConditionIds] = useState<number[]>([]);
  const [conditionOther, setConditionOther] = useState("");
  const [supportNeed, setSupportNeed] = useState("");
  const [chosenAvatar, setChosenAvatar] = useState<number | null>(null);
  const [pin, setPin] = useState("");
  const [pinAgain, setPinAgain] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // The first avatar until the family picks another one, like the registration.
  const avatarId = chosenAvatar ?? avatars[0]?.id ?? null;
  const isOther = includesOtherCondition(conditionIds, conditions);

  function validate(): Partial<Record<Field, string>> {
    const found: Partial<Record<Field, string>> = {};
    const first = nameError(firstName, "Escribe los nombres de tu peque.");
    const last = nameError(lastName, "Escribe los apellidos de tu peque.");
    const birth = birthDate ? studentBirthDateError(birthDate) : "Escribe la fecha de nacimiento de tu peque.";
    if (first) found.firstName = first;
    if (last) found.lastName = last;
    if (birth) found.birthDate = birth;
    if (conditionIds.length === 0) found.conditions = "Marca al menos una condición de tu peque.";
    if (isOther && !conditionOther.trim()) found.conditionOther = "Escribe cuál es la condición de tu peque.";
    if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) found.pin = `El PIN tiene ${PIN_LENGTH} números.`;
    else if (pin !== pinAgain) found.pinAgain = "Los dos PIN no son iguales.";
    return found;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    const found = validate();
    setErrors(found);
    const first = (Object.keys(found) as Field[])[0];
    if (first) {
      document.getElementById(`add-kid-${first}`)?.focus();
      return;
    }
    if (avatarId === null) {
      setSubmitError("No pudimos cargar los avatares. Intenta de nuevo en un momento.");
      return;
    }
    try {
      const student = await withPortalAccess(() =>
        add.mutateAsync({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          date_of_birth: birthDate,
          avatar_id: avatarId,
          pin,
          support_condition_ids: conditionIds,
          support_condition_other: isOther ? conditionOther.trim() : null,
          additional_support_need: supportNeed.trim() || null,
        }),
      );
      onCreated(student);
    } catch (err) {
      setSubmitError(getAuthErrorMessage(err));
    }
  }

  return (
    <div className={styles.section}>
      <button type="button" className={styles.backButton} onClick={onBack}>
        <IconArrowLeft width={18} height={18} />
        Regresar a mis peques
      </button>
      <h2 className={styles.addTitle}>Agregar un peque</h2>
      <p className={styles.addIntro}>
        Solo necesitamos los datos de tu peque: los tuyos ya los tenemos. La primera vez que entre con la mirada, IRIS
        le enseñará a calibrarla.
      </p>

      <form className={styles.section} onSubmit={submit} noValidate aria-label="Datos del nuevo peque">
        <Card id="add-kid-card-data" icon={<IconUserCircle width={20} height={20} />} title="Sus datos">
          <div className={form.fieldGrid}>
            <TextField
              id="add-kid-firstName"
              label="Nombres"
              value={firstName}
              onChange={setFirstName}
              maxLength={60}
              error={errors.firstName}
              required
            />
            <TextField
              id="add-kid-lastName"
              label="Apellidos"
              value={lastName}
              onChange={setLastName}
              maxLength={60}
              error={errors.lastName}
              required
            />
            <TextField
              id="add-kid-birthDate"
              label="Fecha de nacimiento"
              type="date"
              value={birthDate}
              onChange={setBirthDate}
              error={errors.birthDate}
              required
            />
            <SupportConditionsField
              id="add-kid-conditions"
              label="Condición de tu peque"
              options={conditions}
              value={conditionIds}
              onChange={setConditionIds}
              error={errors.conditions}
              required
            />
            {isOther && (
              <TextField
                id="add-kid-conditionOther"
                label="Cuál condición"
                value={conditionOther}
                onChange={setConditionOther}
                maxLength={200}
                error={errors.conditionOther}
                required
              />
            )}
            <TextField
              id="add-kid-supportNeed"
              label="Necesidad de apoyo adicional (opcional)"
              value={supportNeed}
              onChange={setSupportNeed}
              maxLength={500}
              placeholder="Ej.: le cuesta sostener el mouse, necesita más tiempo para las actividades…"
              multiline
            />
          </div>
        </Card>

        <Card
          id="add-kid-card-avatar"
          icon={<IconImage width={20} height={20} />}
          title="Su avatar"
          hint="Lo eliges tú: es la imagen con la que tu peque se reconoce al entrar a IRIS."
        >
          <div className={kidData.avatarGrid} role="radiogroup" aria-label="Avatar de tu peque">
            {avatars.map((option) => {
              const selected = avatarId === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={option.name}
                  className={
                    selected ? `${kidData.avatarOption} ${kidData.avatarOptionSelected}` : kidData.avatarOption
                  }
                  onClick={() => setChosenAvatar(option.id)}
                >
                  <StudentAvatarImage avatarId={option.id} size="large" label="" />
                </button>
              );
            })}
          </div>
        </Card>

        <Card
          id="add-kid-card-pin"
          icon={<IconKey width={20} height={20} />}
          title="Su PIN"
          hint={`${PIN_LENGTH} números que tu peque escribe con la mirada para entrar. Ayúdale a recordarlo.`}
        >
          <div className={form.fieldGrid}>
            <TextField
              id="add-kid-pin"
              label="PIN"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={PIN_LENGTH}
              value={pin}
              onChange={(value) => setPin(value.replace(/\D/g, ""))}
              error={errors.pin}
              required
            />
            <TextField
              id="add-kid-pinAgain"
              label="Escribe el PIN otra vez"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={PIN_LENGTH}
              value={pinAgain}
              onChange={(value) => setPinAgain(value.replace(/\D/g, ""))}
              error={errors.pinAgain}
              required
            />
          </div>
        </Card>

        {submitError && (
          <p role="alert" className={`${styles.status} ${styles.error}`}>
            {submitError}
          </p>
        )}
        <div className={styles.addActions}>
          <button type="button" className={styles.secondaryAction} onClick={onBack} disabled={add.isPending}>
            Cancelar
          </button>
          <button type="submit" className={styles.primaryAction} disabled={add.isPending}>
            {add.isPending ? "Agregando…" : "Agregar peque"}
          </button>
        </div>
      </form>
    </div>
  );
}
