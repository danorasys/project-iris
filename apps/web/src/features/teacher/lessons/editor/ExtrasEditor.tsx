import { useState } from "react";
import type { Extra, ExtraKind } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { useAddExtra, useDeleteExtra, useSetExtraActivity, useUpdateExtra } from "@/shared/api/hooks/useLessonsApi";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { IconBook, IconQuestion, IconSparkle, IconTrash } from "@/shared/ui/icons";
import { LIMITS } from "../lessonLimits";
import { ActivityEditor } from "./ActivityEditor";
import { toActivity, toBlocks, toEditorActivity, toPages, type EditorActivity, type EditorPage } from "./editorModel";
import { PagesEditor } from "./PagesEditor";
import { SaveStatus } from "./SaveStatus";
import { combineSaveStates, useAutosave } from "./useAutosave";
import styles from "./Editor.module.css";

export interface ClassStudent {
  id: string;
  name: string;
}

interface ExtrasEditorProps {
  lessonId: string;
  extras: Extra[];
  /** The members of the class, to choose who an extra is for. */
  students: ClassStudent[];
  onError: (message: string) => void;
}

/** The extras of a lesson (HU-82): more content or one more activity, for
 * the whole class or only for some kids. They're optional; one that isn't
 * complete yet stays hidden from the kids, and its card says what's missing. */
export function ExtrasEditor({ lessonId, extras, students, onError }: ExtrasEditorProps) {
  const add = useAddExtra(lessonId);

  async function addExtra(kind: ExtraKind) {
    const title = `${kind === "contenido" ? "Contenido extra" : "Actividad extra"} ${extras.length + 1}`;
    try {
      await add.mutateAsync({ kind, title, for_everyone: true, student_ids: [] });
    } catch (error) {
      onError(getAuthErrorMessage(error));
    }
  }

  return (
    <div className={styles.stack}>
      <p className={styles.hint}>
        El extra es opcional: más contenido o una actividad más para profundizar, después de la actividad de la lección.
        Puede ser para toda la clase o solo para algunos peques, como un ajuste para quien lo necesite.
      </p>

      {extras.length === 0 && <p className={styles.hint}>Esta lección todavía no tiene extras.</p>}

      {extras.map((extra) => (
        <ExtraCard key={extra.id} lessonId={lessonId} extra={extra} students={students} onError={onError} />
      ))}

      <div className={styles.row}>
        <button
          type="button"
          className={styles.addBig}
          onClick={() => void addExtra("contenido")}
          disabled={add.isPending || extras.length >= LIMITS.extras}
        >
          <IconBook width={18} height={18} />
          Agregar contenido extra
        </button>
        <button
          type="button"
          className={styles.addBig}
          onClick={() => void addExtra("actividad")}
          disabled={add.isPending || extras.length >= LIMITS.extras}
        >
          <IconQuestion width={18} height={18} />
          Agregar actividad extra
        </button>
      </div>
    </div>
  );
}

interface ExtraCardProps {
  lessonId: string;
  extra: Extra;
  students: ClassStudent[];
  onError: (message: string) => void;
}

interface ExtraMeta {
  title: string;
  for_everyone: boolean;
  student_ids: string[];
}

function ExtraCard({ lessonId, extra, students, onError }: ExtraCardProps) {
  const update = useUpdateExtra(lessonId);
  const setActivity = useSetExtraActivity(lessonId);
  const remove = useDeleteExtra(lessonId);
  const [confirming, setConfirming] = useState(false);
  const [meta, setMeta] = useState<ExtraMeta>({
    title: extra.title,
    for_everyone: extra.for_everyone,
    student_ids: extra.student_ids,
  });
  const [pages, setPages] = useState<EditorPage[]>(() => toPages(extra.blocks));
  const [activity, setActivityState] = useState<EditorActivity>(() => toEditorActivity(extra.activity));
  const isContent = extra.kind === "contenido";

  const metaState = useAutosave(
    meta,
    (value) => update.mutateAsync({ extraId: extra.id, body: { ...value, title: value.title.trim() } }),
    meta.title.trim().length > 0,
  );
  const pagesState = useAutosave(
    pages,
    (value) => update.mutateAsync({ extraId: extra.id, body: { blocks: toBlocks(value) } }),
    isContent,
  );
  const activityState = useAutosave(
    activity,
    (value) => setActivity.mutateAsync({ extraId: extra.id, activity: toActivity(value) }),
    !isContent && activity.questions.length > 0,
  );

  function toggleStudent(id: string) {
    setMeta((current) => ({
      ...current,
      student_ids: current.student_ids.includes(id)
        ? current.student_ids.filter((item) => item !== id)
        : [...current.student_ids, id],
    }));
  }

  async function confirmDelete() {
    setConfirming(false);
    try {
      await remove.mutateAsync(extra.id);
    } catch (error) {
      onError(getAuthErrorMessage(error));
    }
  }

  const ready = extra.missing.length === 0;

  return (
    <section className={styles.card} aria-label={meta.title || "Extra sin título"}>
      <div className={styles.cardHead}>
        <span className={styles.number} aria-hidden="true">
          <IconSparkle width={16} height={16} />
        </span>
        <h3 className={styles.cardTitle}>{isContent ? "Contenido extra" : "Actividad extra"}</h3>
        <span className={`${styles.chip} ${ready ? styles.ready : styles.notReady}`}>
          {ready ? "Listo, los peques lo ven" : "Incompleto, aún no lo ven"}
        </span>
        <button
          type="button"
          className={`${styles.iconButton} ${styles.danger}`}
          onClick={() => setConfirming(true)}
          aria-label={`Eliminar el extra ${meta.title}`}
        >
          <IconTrash width={16} height={16} />
        </button>
      </div>

      <SaveStatus state={combineSaveStates([metaState, pagesState, activityState])} />

      <input
        className={`${styles.input} ${meta.title.trim() ? "" : styles.inputMissing}`}
        value={meta.title}
        maxLength={LIMITS.extraTitle}
        onChange={(event) => setMeta((current) => ({ ...current, title: event.target.value }))}
        aria-label="Título del extra"
        placeholder="Título del extra"
      />

      <fieldset className={styles.optionGroup}>
        <legend className={styles.hint}>¿Para quién es?</legend>
        <div className={styles.audience}>
          <label className={styles.pill}>
            <input
              type="radio"
              name={`audience-${extra.id}`}
              checked={meta.for_everyone}
              onChange={() => setMeta((current) => ({ ...current, for_everyone: true }))}
            />
            <span>Toda la clase</span>
          </label>
          <label className={styles.pill}>
            <input
              type="radio"
              name={`audience-${extra.id}`}
              checked={!meta.for_everyone}
              onChange={() => setMeta((current) => ({ ...current, for_everyone: false }))}
            />
            <span>Solo algunos peques</span>
          </label>
        </div>
        {!meta.for_everyone &&
          (students.length === 0 ? (
            <p className={styles.hint}>La clase todavía no tiene estudiantes.</p>
          ) : (
            <div className={styles.audience}>
              {students.map((student) => (
                <label key={student.id} className={styles.pill}>
                  <input
                    type="checkbox"
                    checked={meta.student_ids.includes(student.id)}
                    onChange={() => toggleStudent(student.id)}
                  />
                  <span>{student.name}</span>
                </label>
              ))}
            </div>
          ))}
      </fieldset>

      {isContent ? (
        <PagesEditor lessonId={lessonId} pages={pages} onChange={setPages} onError={onError} owner="el extra" />
      ) : (
        <ActivityEditor activity={activity} onChange={setActivityState} name={`extra-${extra.id}`} />
      )}

      {!ready && (
        <ul className={styles.list}>
          {extra.missing.map((item) => (
            <li key={item} className={styles.missing}>
              {item}
            </li>
          ))}
        </ul>
      )}

      {confirming && (
        <ConfirmDialog
          title="Eliminar extra"
          message={`¿Seguro que quieres eliminar "${meta.title}"? Se borra con todo lo que tiene.`}
          acceptLabel="Sí, eliminar el extra"
          cancelLabel="Cancelar"
          danger
          onAccept={() => void confirmDelete()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </section>
  );
}
