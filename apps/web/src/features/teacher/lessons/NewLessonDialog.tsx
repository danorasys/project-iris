import { useState } from "react";
import type { LessonDetail, Unit } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { SelectField } from "@/features/auth/ui/SelectField";
import { useCreateLesson } from "@/shared/api/hooks/useLessonsApi";
import { CountedTextField } from "@/shared/ui/CountedTextField";
import { FormDialog } from "@/shared/ui/FormDialog";
import { IconBook } from "@/shared/ui/icons";
import { LIMITS } from "./lessonLimits";

interface NewLessonDialogProps {
  units: Unit[];
  /** The unit picked when it opens. */
  unitId: string;
  onClose: () => void;
  /** With the new lesson, to open its editor. */
  onCreated: (lesson: LessonDetail) => void;
}

type Field = "title" | "purpose" | "goal";

/** A new lesson inside a unit (HU-78, HU-102): its title, the purpose the
 * mascot will tell the kid and the learning goal, all required. The pages,
 * the activity and the extras come after, in the editor. */
export function NewLessonDialog({ units, unitId, onClose, onCreated }: NewLessonDialogProps) {
  const [unit, setUnit] = useState(unitId);
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [goal, setGoal] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const create = useCreateLesson();

  function clear(field: Field) {
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(): Promise<boolean> {
    setSubmitError(null);
    const found: Partial<Record<Field, string>> = {};
    if (!title.trim()) found.title = "Escribe el título de la lección.";
    if (!purpose.trim()) found.purpose = "Escribe el propósito de la lección.";
    if (!goal.trim()) found.goal = "Escribe el desempeño esperado.";
    else if (goal.trim().length > LIMITS.learningGoal)
      found.goal = `El desempeño puede tener máximo ${LIMITS.learningGoal} caracteres.`;
    setErrors(found);
    const first = (["title", "purpose", "goal"] as const).find((field) => found[field]);
    if (first) {
      document.getElementById(`new-lesson-${first}`)?.focus();
      return false;
    }
    try {
      const lesson = await create.mutateAsync({
        unitId: unit,
        body: { title: title.trim(), purpose: purpose.trim(), learning_goal: goal.trim() },
      });
      onCreated(lesson);
    } catch (error) {
      setSubmitError(getAuthErrorMessage(error));
      return false;
    }
    return true;
  }

  return (
    <FormDialog
      eyebrow="Lecciones"
      title="Nueva lección"
      intro="Después le agregas sus páginas, su actividad y, si quieres, contenido extra."
      icon={<IconBook width={24} height={24} />}
      submitLabel="Crear lección"
      saving={create.isPending}
      error={submitError}
      onSubmit={submit}
      onClose={onClose}
    >
      <SelectField
        id="new-lesson-unit"
        label="Unidad"
        value={unit}
        onChange={setUnit}
        options={units.map((item) => ({ value: item.id, label: `${item.order_index + 1}. ${item.title}` }))}
        required
        disabled={create.isPending}
      />
      <CountedTextField
        id="new-lesson-title"
        label="Título de la lección"
        value={title}
        onChange={(value) => {
          setTitle(value);
          clear("title");
        }}
        max={LIMITS.lessonTitle}
        error={errors.title}
        required
        disabled={create.isPending}
      />
      <CountedTextField
        id="new-lesson-purpose"
        label="Propósito"
        value={purpose}
        onChange={(value) => {
          setPurpose(value);
          clear("purpose");
        }}
        max={LIMITS.purpose}
        error={errors.purpose}
        required
        disabled={create.isPending}
        hint="Una frase para el peque, la dice la mascota al abrir la lección. Por ejemplo: Hoy vas a aprender a diferenciar animales terrestres y acuáticos."
      />
      <CountedTextField
        id="new-lesson-goal"
        label="Desempeño esperado"
        value={goal}
        onChange={(value) => {
          setGoal(value);
          clear("goal");
        }}
        max={LIMITS.learningGoal}
        error={errors.goal}
        required
        disabled={create.isPending}
        multiline
        rows={2}
        hint="Lo que el peque podrá hacer al terminar, a partir del DBA de su grado y área."
      />
    </FormDialog>
  );
}
