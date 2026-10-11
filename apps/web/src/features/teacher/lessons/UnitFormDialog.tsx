import { useState } from "react";
import type { ClassroomArea, Unit } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { useClassroomDba, useCreateUnit, useUpdateUnit } from "@/shared/api/hooks/useLessonsApi";
import { CountedTextField } from "@/shared/ui/CountedTextField";
import { FormDialog } from "@/shared/ui/FormDialog";
import { IconLayers, IconPencil } from "@/shared/ui/icons";
import { hasDba } from "../classrooms/classroomDetails";
import { UnitDbaPicker } from "./dba/UnitDbaPicker";
import { toUnitDbaBody, toUnitDbaDraft, unitDbaHasPoints, unitDbaReady, type UnitDbaDraft } from "./dba/unitDbaDraft";
import { LIMITS } from "./lessonLimits";

interface UnitFormDialogProps {
  classroomId: string;
  /** The unit to edit. Without it, a new one is created. */
  unit?: Unit;
  /** The class's area: only the areas with DBA ask for the unit's DBA. */
  area?: ClassroomArea | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/** Create or edit a unit (HU-101): its title, the question that guides it,
 * what the kids should manage after all its lessons and, in the areas with
 * DBA, its DBA with its Evidencias de Aprendizaje, all required, like the
 * guiding questions, expected performances and DBA of the MEN sequences. */
export function UnitFormDialog({ classroomId, unit, area, onClose, onSaved }: UnitFormDialogProps) {
  const editing = unit !== undefined;
  const [title, setTitle] = useState(unit?.title ?? "");
  const [question, setQuestion] = useState(unit?.guiding_question ?? "");
  const [goal, setGoal] = useState(unit?.learning_goal ?? "");
  const [errors, setErrors] = useState<{ title?: string; question?: string; goal?: string }>({});
  const askDba = hasDba(area);
  const catalog = useClassroomDba(classroomId, askDba);
  const [dba, setDba] = useState<UnitDbaDraft>(() => toUnitDbaDraft(unit?.dba));
  const [tried, setTried] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const create = useCreateUnit(classroomId);
  const update = useUpdateUnit(classroomId);
  const saving = create.isPending || update.isPending;

  async function submit(): Promise<boolean> {
    setSubmitError(null);
    const found = {
      title: title.trim() ? undefined : "Escribe el título de la unidad.",
      question: !question.trim()
        ? "Escribe la pregunta que guía la unidad."
        : question.trim().length > LIMITS.guidingQuestion
          ? `La pregunta puede tener máximo ${LIMITS.guidingQuestion} caracteres.`
          : undefined,
      goal: !goal.trim()
        ? "Escribe el desempeño esperado de la unidad."
        : goal.trim().length > LIMITS.learningGoal
          ? `El desempeño esperado puede tener máximo ${LIMITS.learningGoal} caracteres.`
          : undefined,
    };
    setErrors(found);
    setTried(true);
    if (found.title || found.question || found.goal) {
      document.getElementById(found.title ? "unit-title" : found.question ? "unit-question" : "unit-goal")?.focus();
      return false;
    }
    if (askDba && !unitDbaReady(dba)) {
      document.getElementById(dba.own_name !== null ? "unit-own-dba" : "unit-dba")?.focus();
      return false;
    }
    if (askDba && !unitDbaHasPoints(dba)) {
      // Waits a frame so the message exists before focusing it.
      requestAnimationFrame(() => document.getElementById("unit-dba-points-error")?.focus());
      return false;
    }
    const body = {
      title: title.trim(),
      guiding_question: question.trim(),
      learning_goal: goal.trim(),
      ...(askDba && { dba: toUnitDbaBody(dba) }),
    };
    try {
      if (editing) await update.mutateAsync({ unitId: unit.id, body });
      else await create.mutateAsync(body);
    } catch (error) {
      setSubmitError(getAuthErrorMessage(error));
      return false;
    }
    onSaved(editing ? "Los cambios de la unidad se guardaron." : "La unidad se creó.");
    return true;
  }

  return (
    <FormDialog
      eyebrow="Unidades"
      title={editing ? "Editar unidad" : "Nueva unidad"}
      intro="Una unidad agrupa las lecciones de un mismo tema, guiadas por una pregunta y con una meta para todas."
      icon={editing ? <IconPencil width={24} height={24} /> : <IconLayers width={26} height={26} />}
      submitLabel={editing ? "Guardar cambios" : "Crear unidad"}
      saving={saving}
      error={submitError}
      onSubmit={submit}
      onClose={onClose}
    >
      <CountedTextField
        id="unit-title"
        label="Título de la unidad"
        value={title}
        onChange={(value) => {
          setTitle(value);
          setErrors((current) => ({ ...current, title: undefined }));
        }}
        max={LIMITS.unitTitle}
        error={errors.title}
        required
        disabled={saving}
      />
      <CountedTextField
        id="unit-question"
        label="Pregunta guía"
        value={question}
        onChange={(value) => {
          setQuestion(value);
          setErrors((current) => ({ ...current, question: undefined }));
        }}
        max={LIMITS.guidingQuestion}
        error={errors.question}
        required
        disabled={saving}
        multiline
        rows={2}
        hint="La pregunta que tus estudiantes podrán responder al terminar la unidad."
      />
      <CountedTextField
        id="unit-goal"
        label="Desempeño esperado de la unidad"
        value={goal}
        onChange={(value) => {
          setGoal(value);
          setErrors((current) => ({ ...current, goal: undefined }));
        }}
        max={LIMITS.learningGoal}
        error={errors.goal}
        required
        disabled={saving}
        multiline
        rows={2}
        hint="Lo que tus estudiantes podrán hacer al terminar todas sus lecciones, a partir del DBA de su grado y área."
      />
      {askDba && (
        <UnitDbaPicker
          catalog={catalog.data}
          loading={catalog.isLoading}
          failed={catalog.isError}
          value={dba}
          onChange={setDba}
          showErrors={tried}
          disabled={saving}
        />
      )}
    </FormDialog>
  );
}
