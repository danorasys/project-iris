import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { LessonDetail, Unit, UnitWithLessons } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { useClassroomUnits, useDeleteUnit, useReorderLessons, useReorderUnits } from "@/shared/api/hooks/useLessonsApi";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import {
  IconArrowDown,
  IconArrowRight,
  IconArrowUp,
  IconBook,
  IconLayers,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@/shared/ui/icons";
import type { TeacherPortalState } from "../portal/TeacherPortalPage";
import { NewLessonDialog } from "./NewLessonDialog";
import { UnitFormDialog } from "./UnitFormDialog";
import styles from "./UnitsPanel.module.css";

interface UnitsPanelProps {
  classroomId: string;
  onToast: (message: string) => void;
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
 * (only when empty) and every lesson opens in the editor. */
export function UnitsPanel({ classroomId, onToast }: UnitsPanelProps) {
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
      <div className={styles.top}>
        <div>
          {/* The tab above already says it, so it's only for screen readers. */}
          <h2 id="units-title" className={styles.visuallyHidden}>
            Unidades y lecciones
          </h2>
          <p className={styles.lead}>
            Cada unidad agrupa las lecciones de un tema. Tus estudiantes ven las unidades en este orden.
          </p>
        </div>
        <button type="button" className={styles.primaryButton} onClick={() => setUnitDialog({})}>
          <IconPlus width={16} height={16} />
          Nueva unidad
        </button>
      </div>

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
          <p className={styles.emptyText}>Crea la primera unidad con su pregunta guía. Después agrégale lecciones.</p>
        </div>
      )}

      <ol className={styles.units}>
        {list.map((unit, unitIndex) => (
          <li key={unit.id} className={styles.unit}>
            <div className={styles.unitHead}>
              <span className={styles.unitNumber} aria-hidden="true">
                {unitIndex + 1}
              </span>
              <div className={styles.unitText}>
                <p className={styles.unitEyebrow}>Unidad {unitIndex + 1}</p>
                <h3 className={styles.unitTitle}>{unit.title}</h3>
                <p className={styles.unitQuestion}>{unit.guiding_question}</p>
              </div>
              <div className={styles.unitActions}>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => moveUnit(unitIndex, -1)}
                  disabled={unitIndex === 0 || busy}
                  aria-label={`Subir la unidad ${unit.title}`}
                >
                  <IconArrowUp width={18} height={18} />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => moveUnit(unitIndex, 1)}
                  disabled={unitIndex === list.length - 1 || busy}
                  aria-label={`Bajar la unidad ${unit.title}`}
                >
                  <IconArrowDown width={18} height={18} />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => setUnitDialog({ unit })}
                  aria-label={`Editar la unidad ${unit.title}`}
                >
                  <IconPencil width={18} height={18} />
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
                  title={unit.lessons.length > 0 ? "Primero mueve o elimina sus lecciones" : undefined}
                >
                  <IconTrash width={18} height={18} />
                </button>
              </div>
            </div>

            {unit.lessons.length === 0 ? (
              <p className={styles.noLessons}>Esta unidad aún no tiene lecciones.</p>
            ) : (
              <ol className={styles.lessons}>
                {unit.lessons.map((lesson, lessonIndex) => (
                  <li key={lesson.id} className={styles.lesson}>
                    <button type="button" className={styles.lessonMain} onClick={() => openLesson(lesson.id)}>
                      <span className={styles.lessonIcon} aria-hidden="true">
                        <IconBook width={20} height={20} />
                      </span>
                      <span className={styles.lessonText}>
                        <span className={styles.lessonTitle}>{lesson.title}</span>
                        <span className={styles.lessonPurpose}>{lesson.purpose}</span>
                      </span>
                      <span
                        className={
                          lesson.status === "publicada" ? `${styles.statusChip} ${styles.published}` : styles.statusChip
                        }
                      >
                        {lesson.status === "publicada" ? "Publicada" : "Borrador"}
                      </span>
                      <IconArrowRight width={18} height={18} className={styles.lessonArrow} />
                    </button>
                    <div className={styles.lessonMove}>
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => moveLesson(unit, lessonIndex, -1)}
                        disabled={lessonIndex === 0 || busy}
                        aria-label={`Subir la lección ${lesson.title}`}
                      >
                        <IconArrowUp width={16} height={16} />
                      </button>
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => moveLesson(unit, lessonIndex, 1)}
                        disabled={lessonIndex === unit.lessons.length - 1 || busy}
                        aria-label={`Bajar la lección ${lesson.title}`}
                      >
                        <IconArrowDown width={16} height={16} />
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            <button type="button" className={styles.addLesson} onClick={() => setNewLessonUnit(unit.id)}>
              <IconPlus width={16} height={16} />
              Nueva lección en esta unidad
            </button>
          </li>
        ))}
      </ol>

      {unitDialog && (
        <UnitFormDialog
          classroomId={classroomId}
          unit={unitDialog.unit}
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
