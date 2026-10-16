import { useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { ClassroomArea, LessonDetail, Unit, UnitWithLessons } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { useClassroomUnits, useDeleteUnit, useReorderLessons, useReorderUnits } from "@/shared/api/hooks/useLessonsApi";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import {
  IconAlert,
  IconArrowDown,
  IconArrowRight,
  IconArrowUp,
  IconBook,
  IconCheck,
  IconInfo,
  IconLayers,
  IconPencil,
  IconPlus,
  IconQuestion,
  IconSparkle,
  IconTrash,
} from "@/shared/ui/icons";
import { SectionOverview } from "@/shared/ui/portal/SectionOverview";
import { hasDba, unitDbaText } from "../classrooms/classroomDetails";
import type { TeacherPortalState } from "../portal/TeacherPortalPage";
import { NewLessonDialog } from "./NewLessonDialog";
import { UnitFormDialog } from "./UnitFormDialog";
import styles from "./UnitsPanel.module.css";

interface UnitsPanelProps {
  classroomId: string;
  /** The class's area: the areas with DBA ask each unit for its DBA. */
  area?: ClassroomArea | null;
  onToast: (message: string) => void;
  /** An archived class (HU-105): the units and lessons are only listed. */
  readOnly?: boolean;
}

// The same list with one item moved one place up (-1) or down (+1).
function moved<T extends { id: string }>(items: T[], index: number, step: -1 | 1): string[] {
  const ids = items.map((item) => item.id);
  const target = index + step;
  [ids[index], ids[target]] = [ids[target], ids[index]];
  return ids;
}

/** "Lecciones" of a classroom: its units in order, each with its lessons
 * (HU-101). Units and lessons go up and down, units are edited or deleted
 * (only when empty) and every lesson opens in the editor. In an archived
 * class it's only the list, without any of that. */
export function UnitsPanel({ classroomId, area, onToast, readOnly = false }: UnitsPanelProps) {
  const navigate = useNavigate();
  const units = useClassroomUnits(classroomId);
  const reorderUnits = useReorderUnits(classroomId);
  const reorderLessons = useReorderLessons(classroomId);
  const deleteUnit = useDeleteUnit(classroomId);
  const [unitDialog, setUnitDialog] = useState<{ unit?: Unit } | null>(null);
  const [newLessonUnit, setNewLessonUnit] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Unit | null>(null);

  const list = units.data ?? [];
  const busy = reorderUnits.isPending || reorderLessons.isPending;
  const lessons = list.flatMap((unit) => unit.lessons);
  const published = lessons.filter((lesson) => lesson.status === "publicada").length;

  function openLesson(lessonId: string) {
    const back: TeacherPortalState = { section: "clases", classroomId, view: "lecciones" };
    navigate(`/teacher/classrooms/${classroomId}/lessons/${lessonId}/edit`, { state: back });
  }

  async function confirmDelete(unit: Unit) {
    setToDelete(null);
    try {
      await deleteUnit.mutateAsync(unit.id);
      onToast(`La unidad "${unit.title}" se eliminó.`);
    } catch (error) {
      onToast(getAuthErrorMessage(error));
    }
  }

  function moveUnit(index: number, step: -1 | 1) {
    reorderUnits.mutate(moved(list, index, step), { onError: (error) => onToast(getAuthErrorMessage(error)) });
  }

  function moveLesson(unit: UnitWithLessons, index: number, step: -1 | 1) {
    reorderLessons.mutate(
      { unitId: unit.id, ids: moved(unit.lessons, index, step) },
      { onError: (error) => onToast(getAuthErrorMessage(error)) },
    );
  }

  return (
    <section aria-labelledby="units-title" className={styles.section}>
      {/* The option above already says it, so it's only for screen readers. */}
      <h2 id="units-title" className={styles.visuallyHidden}>
        Unidades y lecciones
      </h2>

      {/* The same card the family sees on top of the class's structure. */}
      <SectionOverview
        titleId="units-overview-title"
        Icon={IconLayers}
        title="Cómo está organizada la clase"
        text={
          <>
            Tiene <strong>{list.length === 1 ? "1 unidad" : `${list.length} unidades`}</strong> con{" "}
            <strong>{lessons.length === 1 ? "1 lección" : `${lessons.length} lecciones`}</strong>
            {lessons.length > 0 && ` (${published === 1 ? "1 publicada" : `${published} publicadas`})`}.{" "}
            {readOnly
              ? "La clase está archivada: puedes ver sus unidades y lecciones, pero no cambiarlas."
              : "Tus estudiantes ven las unidades en este orden."}
          </>
        }
        action={
          !readOnly && (
            <button type="button" className={styles.primaryButton} onClick={() => setUnitDialog({})}>
              <IconPlus width={16} height={16} />
              Nueva unidad
            </button>
          )
        }
        guides={[
          {
            title: "En cada unidad",
            Icon: IconLayers,
            items: [
              { key: "question", Icon: IconQuestion, text: "La pregunta que la guía" },
              ...(hasDba(area)
                ? [
                    {
                      key: "dba",
                      Icon: IconBook,
                      text: "Su Derecho Básico de Aprendizaje (DBA) y sus Evidencias de Aprendizaje",
                    },
                  ]
                : []),
            ],
          },
          {
            title: "En cada lección",
            Icon: IconBook,
            items: [
              { key: "purpose", Icon: IconInfo, text: "Para qué es y qué debería lograr el estudiante" },
              { key: "moments", Icon: IconCheck, text: "Su inicio, su contenido y su actividad" },
              { key: "extras", Icon: IconSparkle, text: "Sus extras, si quieres darle más a alguien" },
            ],
          },
        ]}
      />

      {units.isLoading && <p className={styles.status}>Cargando las unidades…</p>}
      {units.isError && (
        <p role="alert" className={`${styles.status} ${styles.error}`}>
          No pudimos cargar las unidades. Intenta recargar la página.
        </p>
      )}

      {units.data && list.length === 0 && (
        <div className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden="true">
            <IconLayers width={26} height={26} />
          </span>
          <p className={styles.emptyTitle}>Esta clase aún no tiene unidades</p>
          {!readOnly && (
            <p className={styles.emptyText}>Crea una unidad. Después agrégale lecciones.</p>
          )}
        </div>
      )}

      <ol className={styles.units}>
        {list.map((unit, unitIndex) => {
          const unitPublished = unit.lessons.filter((lesson) => lesson.status === "publicada").length;
          const drafts = unit.lessons.length - unitPublished;
          return (
            <li key={unit.id} className={styles.unit} style={{ "--order": unitIndex } as CSSProperties}>
              <div className={styles.unitHead}>
                <span className={styles.unitNumber} aria-hidden="true">
                  {unitIndex + 1}
                </span>
                <div className={styles.unitText}>
                  <p className={styles.unitEyebrow}>Unidad {unitIndex + 1}</p>
                  <h3 className={styles.unitTitle}>{unit.title}</h3>
                  <p className={styles.unitTags}>
                    <span className={styles.tag}>
                      <IconBook width={14} height={14} aria-hidden="true" />
                      {unit.lessons.length === 1 ? "1 lección" : `${unit.lessons.length} lecciones`}
                    </span>
                    {unitPublished > 0 && (
                      <span className={styles.tag} data-tone="mint">
                        <IconCheck width={14} height={14} aria-hidden="true" />
                        {unitPublished === 1 ? "1 publicada" : `${unitPublished} publicadas`}
                      </span>
                    )}
                    {drafts > 0 && (
                      <span className={styles.tag} data-tone="sun">
                        <IconPencil width={14} height={14} aria-hidden="true" />
                        {drafts === 1 ? "1 en borrador" : `${drafts} en borrador`}
                      </span>
                    )}
                  </p>
                </div>
                {!readOnly && (
                  <div className={styles.unitActions}>
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={() => moveUnit(unitIndex, -1)}
                      disabled={unitIndex === 0 || busy}
                      aria-label={`Subir la unidad ${unit.title}`}
                      title="Subir"
                    >
                      <IconArrowUp width={17} height={17} />
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={() => moveUnit(unitIndex, 1)}
                      disabled={unitIndex === list.length - 1 || busy}
                      aria-label={`Bajar la unidad ${unit.title}`}
                      title="Bajar"
                    >
                      <IconArrowDown width={17} height={17} />
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={() => setUnitDialog({ unit })}
                      aria-label={`Editar la unidad ${unit.title}`}
                      title="Editar"
                    >
                      <IconPencil width={17} height={17} />
                    </button>
                    {/* A unit with lessons can't go: first move or delete them. */}
                    <button
                      type="button"
                      className={`${styles.iconButton} ${styles.iconDanger}`}
                      onClick={() => setToDelete(unit)}
                      disabled={unit.lessons.length > 0}
                      aria-label={
                        unit.lessons.length > 0
                          ? `No se puede eliminar la unidad ${unit.title} mientras tenga lecciones`
                          : `Eliminar la unidad ${unit.title}`
                      }
                      title={unit.lessons.length > 0 ? "Primero mueve o elimina sus lecciones" : "Eliminar"}
                    >
                      <IconTrash width={17} height={17} />
                    </button>
                  </div>
                )}
              </div>

              {/* The question that guides it, set apart like a quote. */}
              <p className={styles.question}>
                <span className={styles.questionIcon} aria-hidden="true">
                  <IconQuestion width={16} height={16} />
                </span>
                <span>
                  <span className={styles.questionLabel}>Pregunta guía</span>
                  <span className={styles.questionText}>{unit.guiding_question}</span>
                </span>
              </p>

              {unit.dba ? (
                // The DBA and its evidences in a box that opens, so the card stays short.
                <details className={styles.dba}>
                  <summary className={styles.dbaSummary}>
                    <span className={styles.dbaIcon} aria-hidden="true">
                      <IconBook width={16} height={16} />
                    </span>
                    <span className={styles.dbaText}>
                      <span className={styles.unitGoalLabel}>DBA:</span> {unitDbaText(unit.dba)}
                    </span>
                    <span className={styles.dbaToggle} aria-hidden="true">
                      <IconArrowDown width={16} height={16} />
                    </span>
                  </summary>
                  {unit.dba.points.length > 0 ? (
                    <div className={styles.dbaBody}>
                      <p className={styles.dbaPointsTitle}>Evidencias de Aprendizaje</p>
                      <ul
                        className={styles.unitPoints}
                        aria-label={`Evidencias de Aprendizaje de la unidad ${unit.title}`}
                      >
                        {unit.dba.points.map((point, index) => (
                          <li key={point.evidence_id ?? `own-${index}`}>
                            <IconCheck width={15} height={15} aria-hidden="true" />
                            {point.text}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </details>
              ) : null}
              {unit.dba && unit.dba.points.length === 0 && !readOnly && (
                <MissingNote action="Marcarlas" onFix={() => setUnitDialog({ unit })}>
                  Faltan las Evidencias de Aprendizaje de la unidad: sin ellas no se pueden publicar sus lecciones.
                </MissingNote>
              )}
              {/* In the areas with DBA its lessons can't be published without it. */}
              {!unit.dba && hasDba(area) && !readOnly && (
                <MissingNote action="Elegirlo" onFix={() => setUnitDialog({ unit })}>
                  Falta el DBA de la unidad: sin él no se pueden publicar sus lecciones.
                </MissingNote>
              )}

              {unit.lessons.length === 0 ? (
                <p className={styles.noLessons}>Esta unidad aún no tiene lecciones.</p>
              ) : (
                <ol className={styles.lessons}>
                  {unit.lessons.map((lesson, lessonIndex) => (
                    <li key={lesson.id} className={styles.lesson}>
                      {readOnly ? (
                        <div className={`${styles.lessonMain} ${styles.lessonStatic}`}>
                          <LessonSummary lesson={lesson} number={lessonIndex + 1} />
                        </div>
                      ) : (
                        <button type="button" className={styles.lessonMain} onClick={() => openLesson(lesson.id)}>
                          <LessonSummary lesson={lesson} number={lessonIndex + 1} />
                          <IconArrowRight width={18} height={18} className={styles.lessonArrow} aria-hidden="true" />
                        </button>
                      )}
                      {!readOnly && (
                        <div className={styles.lessonMove}>
                          <button
                            type="button"
                            className={styles.iconButton}
                            onClick={() => moveLesson(unit, lessonIndex, -1)}
                            disabled={lessonIndex === 0 || busy}
                            aria-label={`Subir la lección ${lesson.title}`}
                            title="Subir"
                          >
                            <IconArrowUp width={15} height={15} />
                          </button>
                          <button
                            type="button"
                            className={styles.iconButton}
                            onClick={() => moveLesson(unit, lessonIndex, 1)}
                            disabled={lessonIndex === unit.lessons.length - 1 || busy}
                            aria-label={`Bajar la lección ${lesson.title}`}
                            title="Bajar"
                          >
                            <IconArrowDown width={15} height={15} />
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}

              {!readOnly && (
                <button type="button" className={styles.addLesson} onClick={() => setNewLessonUnit(unit.id)}>
                  <span className={styles.addLessonIcon} aria-hidden="true">
                    <IconPlus width={16} height={16} />
                  </span>
                  Nueva lección en esta unidad
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {unitDialog && (
        <UnitFormDialog
          classroomId={classroomId}
          unit={unitDialog.unit}
          area={area}
          onClose={() => setUnitDialog(null)}
          onSaved={onToast}
        />
      )}
      {newLessonUnit && (
        <NewLessonDialog
          units={list}
          unitId={newLessonUnit}
          onClose={() => setNewLessonUnit(null)}
          onCreated={(lesson: LessonDetail) => {
            onToast("La lección se creó. Ahora agrégale sus páginas y su actividad.");
            openLesson(lesson.id);
          }}
        />
      )}
      {toDelete && (
        <ConfirmDialog
          title="Eliminar unidad"
          message={`¿Seguro que quieres eliminar la unidad "${toDelete.title}"? Está vacía, no se pierde ninguna lección.`}
          acceptLabel="Sí, eliminar la unidad"
          cancelLabel="Cancelar"
          danger
          onAccept={() => void confirmDelete(toDelete)}
          onCancel={() => setToDelete(null)}
        />
      )}
    </section>
  );
}

// Something the unit still lacks to publish its lessons, with the button
// that opens the unit's form to fill it in.
function MissingNote({ action, onFix, children }: { action: string; onFix: () => void; children: ReactNode }) {
  return (
    <p className={styles.unitGoalMissing}>
      <IconAlert width={16} height={16} aria-hidden="true" />
      <span>{children}</span>
      <button type="button" className={styles.unitGoalButton} onClick={onFix}>
        {action}
      </button>
    </p>
  );
}

// What a lesson row shows: its number, title, purpose and whether it's out.
function LessonSummary({ lesson, number }: { lesson: UnitWithLessons["lessons"][number]; number: number }) {
  const published = lesson.status === "publicada";
  return (
    <>
      <span className={styles.lessonNumber} aria-hidden="true">
        {number}
      </span>
      <span className={styles.lessonText}>
        <span className={styles.lessonTitle}>{lesson.title}</span>
        <span className={styles.lessonPurpose}>{lesson.purpose}</span>
      </span>
      <span className={styles.statusChip} data-published={published}>
        <span className={styles.statusDot} aria-hidden="true" />
        {published ? "Publicada" : "Borrador"}
      </span>
    </>
  );
}
