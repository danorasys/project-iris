import { useEffect, useId, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { ClassroomArea, Unit } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { useClassroomDba, useCreateUnit, useUpdateUnit } from "@/shared/api/hooks/useLessonsApi";
import { CountedTextField } from "@/shared/ui/CountedTextField";
import { IconClose, IconLayers, IconPencil } from "@/shared/ui/icons";
import { IrisRings } from "@/shared/ui/IrisRings";
import { useModalDialog } from "@/shared/ui/useModalDialog";
import dialog from "../classrooms/ClassroomFormDialog.module.css";
import { hasDba } from "../classrooms/classroomDetails";
import { UnitDbaPicker } from "./dba/UnitDbaPicker";
import { toUnitDbaBody, toUnitDbaDraft, unitDbaHasPoints, unitDbaReady, type UnitDbaDraft } from "./dba/unitDbaDraft";
import { LIMITS } from "./lessonLimits";
import styles from "./UnitFormDialog.module.css";

interface UnitFormDialogProps {
  classroomId: string;
  /** The unit to edit. Without it, a new one is created. */
  unit?: Unit;
  /** The class's area: only the areas with DBA ask for the unit's DBA. */
  area?: ClassroomArea | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/** Create or edit a unit (HU-101), in the look of the new class window: its
 * title, the question that guides it and, in the areas with DBA, its DBA with
 * its Evidencias de Aprendizaje, which say what the unit should achieve. All
 * required, like the guiding questions and DBA of the MEN sequences. */
export function UnitFormDialog({ classroomId, unit, area, onClose, onSaved }: UnitFormDialogProps) {
  const titleId = useId();
  const introId = useId();
  const editing = unit !== undefined;
  const [title, setTitle] = useState(unit?.title ?? "");
  const [question, setQuestion] = useState(unit?.guiding_question ?? "");
  const [errors, setErrors] = useState<{ title?: string; question?: string }>({});
  const askDba = hasDba(area);
  const catalog = useClassroomDba(classroomId, askDba);
  const [dba, setDba] = useState<UnitDbaDraft>(() => toUnitDbaDraft(unit?.dba));
  const [tried, setTried] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const create = useCreateUnit(classroomId);
  const update = useUpdateUnit(classroomId);
  const saving = create.isPending || update.isPending;

  // The app behind stays inert while it's open (see useModalDialog).
  const { ref, leaving, close } = useModalDialog<HTMLDivElement>();

  // The title is the first thing to fill in.
  useEffect(() => {
    document.getElementById("unit-title")?.focus();
  }, []);

  // Escape closes it, unless it's saving or a list of a select is open on top.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving && !ref.current?.inert) close(onClose);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    const found = {
      title: title.trim() ? undefined : "Escribe el título de la unidad.",
      question: !question.trim()
        ? "Escribe la pregunta que guía la unidad."
        : question.trim().length > LIMITS.guidingQuestion
          ? `La pregunta puede tener máximo ${LIMITS.guidingQuestion} caracteres.`
          : undefined,
    };
    setErrors(found);
    setTried(true);
    if (found.title || found.question) {
      document.getElementById(found.title ? "unit-title" : "unit-question")?.focus();
      return;
    }
    if (askDba && !unitDbaReady(dba)) {
      document.getElementById(dba.own_name !== null ? "unit-own-dba" : "unit-dba")?.focus();
      return;
    }
    if (askDba && !unitDbaHasPoints(dba)) {
      // Waits a frame so the message exists before focusing it.
      requestAnimationFrame(() => document.getElementById("unit-dba-points-error")?.focus());
      return;
    }
    const body = {
      title: title.trim(),
      guiding_question: question.trim(),
      ...(askDba && { dba: toUnitDbaBody(dba) }),
    };
    try {
      if (editing) await update.mutateAsync({ unitId: unit.id, body });
      else await create.mutateAsync(body);
    } catch (error) {
      setSubmitError(getAuthErrorMessage(error));
      return;
    }
    close(() => onSaved(editing ? "Los cambios de la unidad se guardaron." : "La unidad se creó."));
  }

  return createPortal(
    <div
      ref={ref}
      className={leaving ? `${dialog.backdrop} ${dialog.leaving}` : dialog.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={introId}
    >
      <form className={`${dialog.card} ${styles.card}`} onSubmit={submit} noValidate>
        {/* The same header as the new class window: light sky, the rings of
            the iris behind and the icon on a white disc. */}
        <header className={dialog.header}>
          <IrisRings className={dialog.headerRings} />
          <span className={dialog.badge} aria-hidden="true">
            {editing ? <IconPencil width={26} height={26} /> : <IconLayers width={28} height={28} />}
          </span>
          <div className={dialog.headerText}>
            <p className={dialog.eyebrow}>Unidades y lecciones</p>
            <h2 id={titleId} className={dialog.title}>
              {editing ? "Editar unidad" : "Nueva unidad"}
            </h2>
            <p id={introId} className={dialog.intro}>
              {editing
                ? "Cambia el título, la pregunta que la guía o lo que trabaja la unidad."
                : "Una unidad agrupa las lecciones de un mismo tema, guiadas por una pregunta."}
            </p>
          </div>
          <button
            type="button"
            className={dialog.closeButton}
            onClick={() => close(onClose)}
            disabled={saving}
            aria-label="Cerrar"
          >
            <IconClose width={20} height={20} />
          </button>
        </header>

        <div className={`${dialog.body} ${styles.body}`}>
          <div className={dialog.fields}>
            <section className={dialog.step} aria-labelledby={`${titleId}-details`}>
              <h3 id={`${titleId}-details`} className={dialog.stepTitle}>
                <span className={dialog.stepNumber} aria-hidden="true">
                  1
                </span>
                Datos de la unidad
              </h3>
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
            </section>

            {askDba && (
              <section className={dialog.step} aria-labelledby={`${titleId}-dba`}>
                <h3 id={`${titleId}-dba`} className={dialog.stepTitle}>
                  <span className={dialog.stepNumber} aria-hidden="true">
                    2
                  </span>
                  DBA de la unidad
                </h3>
                <p className={dialog.stepHint}>
                  El Derecho Básico de Aprendizaje del Ministerio de Educación que trabajan sus lecciones, o uno
                  propio, y las Evidencias de Aprendizaje que trabaja de él.
                </p>
                <UnitDbaPicker
                  catalog={catalog.data}
                  loading={catalog.isLoading}
                  failed={catalog.isError}
                  value={dba}
                  onChange={setDba}
                  showErrors={tried}
                  disabled={saving}
                />
              </section>
            )}
          </div>
        </div>

        {/* Always at the bottom, so the buttons never scroll away. */}
        <footer className={dialog.footer}>
          {submitError && (
            <p role="alert" className={dialog.error}>
              {submitError}
            </p>
          )}
          <div className={dialog.buttons}>
            <button type="button" className={dialog.cancelButton} onClick={() => close(onClose)} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className={dialog.saveButton} disabled={saving}>
              {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear unidad"}
            </button>
          </div>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
