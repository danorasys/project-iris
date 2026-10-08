import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { LessonDetail, UnitWithLessons } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { SelectField } from "@/features/auth/ui/SelectField";
import { useClassroomDetail } from "@/shared/api/hooks/useClassroomsApi";
import {
  useClassroomUnits,
  useDeleteLesson,
  useLessonDetail,
  usePublishLesson,
  useSetActivity,
  useUpdateLesson,
} from "@/shared/api/hooks/useLessonsApi";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { CountedTextField } from "@/shared/ui/CountedTextField";
import { IconArrowLeft, IconBook, IconCheck, IconInfo, IconTrash } from "@/shared/ui/icons";
import { usePortalTheme } from "@/shared/ui/portal/usePortalTheme";
import { Toast } from "@/shared/ui/Toast";
import { useEnterAnimation } from "@/shared/ui/enterAnimation";
import type { TeacherPortalState } from "../portal/TeacherPortalPage";
import { ActivityEditor } from "./editor/ActivityEditor";
import {
  toActivity,
  toBlocks,
  toEditorActivity,
  toPages,
  type EditorActivity,
  type EditorPage,
} from "./editor/editorModel";
import { ExtrasEditor, type ClassStudent } from "./editor/ExtrasEditor";
import { PagesEditor } from "./editor/PagesEditor";
import { SaveStatus } from "./editor/SaveStatus";
import { combineSaveStates, useAutosave } from "./editor/useAutosave";
import { LIMITS } from "./lessonLimits";
import styles from "./LessonEditorPage.module.css";

type Tab = "details" | "content" | "activity" | "extra";
// Left to right, so the next tab comes in from the right.
const TAB_ORDER: Tab[] = ["details", "content", "activity", "extra"];

interface Details {
  unit_id: string;
  title: string;
  purpose: string;
  learning_goal: string;
}

/** `/teacher/classrooms/:classroomId/lessons/:lessonId/edit`: the whole lesson
 * in one place (HU-78 to HU-84, HU-102, HU-103). The editor keeps its own copy
 * and saves it by itself, so a refetch never undoes what's being typed. */
export default function LessonEditorPage() {
  // The same colors as the Portal Docente it comes from.
  usePortalTheme();
  const { classroomId = "", lessonId = "" } = useParams<{ classroomId: string; lessonId: string }>();
  const lesson = useLessonDetail(lessonId);
  const units = useClassroomUnits(classroomId);
  const classroom = useClassroomDetail(classroomId);

  if (lesson.isLoading || units.isLoading) {
    return <p className={styles.loading}>Abriendo la lección…</p>;
  }
  if (lesson.isError || !lesson.data || !units.data) {
    return (
      <p role="alert" className={styles.loading}>
        No pudimos abrir esta lección. Vuelve a la clase e intenta de nuevo.
      </p>
    );
  }

  const students: ClassStudent[] = (classroom.data?.students ?? [])
    .filter((student) => student.status === "aceptada")
    .map((student) => ({ id: student.student_id, name: student.first_name }));

  return (
    <Editor
      key={lesson.data.id}
      lesson={lesson.data}
      units={units.data}
      students={students}
      classroomId={classroomId}
    />
  );
}

interface EditorProps {
  lesson: LessonDetail;
  units: UnitWithLessons[];
  students: ClassStudent[];
  classroomId: string;
}

function Editor({ lesson, units, students, classroomId }: EditorProps) {
  const navigate = useNavigate();
  const update = useUpdateLesson();
  const saveActivity = useSetActivity();
  const publish = usePublishLesson();
  const remove = useDeleteLesson(classroomId);
  const [tab, setTab] = useState<Tab>("details");
  // Each tab comes in with the same entrance as the rest of the portal.
  const panelRef = useEnterAnimation<HTMLElement>(tab, { level: TAB_ORDER.indexOf(tab) });
  const [toast, setToast] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // The editor's own copy, seeded once from what was loaded.
  const [details, setDetails] = useState<Details>({
    unit_id: lesson.unit_id,
    title: lesson.title,
    purpose: lesson.purpose,
    learning_goal: lesson.learning_goal,
  });
  const [pages, setPages] = useState<EditorPage[]>(() => toPages(lesson.blocks));
  const [activity, setActivity] = useState<EditorActivity>(() => toEditorActivity(lesson.activity));

  const detailsOk =
    details.title.trim().length > 0 &&
    details.purpose.trim().length > 0 &&
    details.learning_goal.trim().length > 0 &&
    details.learning_goal.trim().length <= LIMITS.learningGoal;
  const detailsState = useAutosave(
    details,
    (value) =>
      update.mutateAsync({
        lessonId: lesson.id,
        body: {
          unit_id: value.unit_id,
          title: value.title.trim(),
          purpose: value.purpose.trim(),
          learning_goal: value.learning_goal.trim(),
        },
      }),
    detailsOk,
  );
  const pagesState = useAutosave(pages, (value) =>
    update.mutateAsync({ lessonId: lesson.id, body: { blocks: toBlocks(value) } }),
  );
  const activityState = useAutosave(activity, (value) =>
    saveActivity.mutateAsync({ lessonId: lesson.id, activity: toActivity(value) }),
  );
  const saveState = combineSaveStates([detailsState, pagesState, activityState]);

  const unit = units.find((item) => item.id === lesson.unit_id);
  const unitNumber = unit ? unit.order_index + 1 : null;
  const published = lesson.status === "publicada";
  const busy = saveState.status === "saving" || publish.isPending;
  const blockCount = useMemo(() => pages.reduce((total, page) => total + page.blocks.length, 0), [pages]);

  function goBack() {
    const back: TeacherPortalState = { section: "clases", classroomId, view: "lecciones" };
    navigate("/teacher/portal", { state: back });
  }

  async function doPublish() {
    try {
      await publish.mutateAsync(lesson.id);
      setToast("La lección se publicó. Tus estudiantes ya la ven.");
    } catch (error) {
      setToast(getAuthErrorMessage(error));
    }
  }

  async function doDelete() {
    setConfirming(false);
    try {
      await remove.mutateAsync(lesson.id);
      goBack();
    } catch (error) {
      setToast(getAuthErrorMessage(error));
    }
  }

  const tabs: { id: Tab; label: string; count?: string }[] = [
    { id: "details", label: "Datos" },
    { id: "content", label: "Contenido", count: `${pages.length} ${pages.length === 1 ? "página" : "páginas"}` },
    {
      id: "activity",
      label: "Actividad",
      count: `${activity.questions.length} ${activity.questions.length === 1 ? "pregunta" : "preguntas"}`,
    },
    { id: "extra", label: "Extra", count: `${lesson.extras.length}` },
  ];

  return (
    <main className={styles.page}>
      <button type="button" className={styles.back} onClick={goBack}>
        <IconArrowLeft width={18} height={18} />
        Volver a unidades y lecciones
      </button>

      <header className={styles.header}>
        <span className={styles.badge} aria-hidden="true">
          <IconBook width={26} height={26} />
        </span>
        <div className={styles.headerText}>
          <p className={styles.eyebrow}>{unitNumber ? `Unidad ${unitNumber} · ${unit?.title}` : "Lección"}</p>
          <h1 className={styles.title}>{details.title.trim() || lesson.title}</h1>
          <p className={styles.purpose}>{details.purpose.trim() || lesson.purpose}</p>
          <div className={styles.meta}>
            <span className={published ? `${styles.chip} ${styles.chipPublished}` : styles.chip}>
              {published ? "Publicada" : "Borrador, solo la ves tú"}
            </span>
            <SaveStatus state={saveState} />
          </div>
        </div>
        <div className={styles.headerActions}>
          {!published && (
            <button
              type="button"
              className={styles.publish}
              onClick={() => void doPublish()}
              disabled={busy || lesson.missing.length > 0}
            >
              <IconCheck width={18} height={18} />
              {publish.isPending ? "Publicando…" : "Publicar lección"}
            </button>
          )}
          <button type="button" className={styles.delete} onClick={() => setConfirming(true)}>
            <IconTrash width={18} height={18} />
            Eliminar
          </button>
        </div>
      </header>

      {/* What's still missing to publish it, or that it's ready / already published. */}
      <section
        className={lesson.missing.length ? styles.checklist : `${styles.checklist} ${styles.checklistReady}`}
        aria-live="polite"
      >
        <IconInfo width={20} height={20} aria-hidden="true" />
        {published ? (
          <p className={styles.checklistText}>
            Tus estudiantes ya ven esta lección. Los cambios se guardan solo si la lección sigue completa.
          </p>
        ) : lesson.missing.length === 0 ? (
          <p className={styles.checklistText}>La lección está completa: ya puedes publicarla.</p>
        ) : (
          <div>
            <p className={styles.checklistText}>Para publicarla te falta:</p>
            <ul className={styles.missingList}>
              {lesson.missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className={styles.tabs} role="tablist" aria-label="Partes de la lección">
        {tabs.map((item) => (
          <button
            key={item.id}
            id={`tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`panel-${item.id}`}
            className={tab === item.id ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            {item.count !== undefined && <span className={styles.tabCount}>{item.count}</span>}
          </button>
        ))}
      </div>

      <section
        ref={panelRef}
        id={`panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        className={styles.panel}
      >
        {tab === "details" && (
          <div className={styles.form}>
            <SelectField
              id="lesson-unit"
              label="Unidad"
              value={details.unit_id}
              onChange={(value) => setDetails((current) => ({ ...current, unit_id: value }))}
              options={units.map((item) => ({ value: item.id, label: `${item.order_index + 1}. ${item.title}` }))}
              required
            />
            <CountedTextField
              id="lesson-title"
              label="Título de la lección"
              value={details.title}
              onChange={(value) => setDetails((current) => ({ ...current, title: value }))}
              max={LIMITS.lessonTitle}
              error={details.title.trim() ? undefined : "Escribe el título de la lección."}
              required
            />
            <CountedTextField
              id="lesson-purpose"
              label="Propósito"
              value={details.purpose}
              onChange={(value) => setDetails((current) => ({ ...current, purpose: value }))}
              max={LIMITS.purpose}
              error={details.purpose.trim() ? undefined : "Escribe el propósito de la lección."}
              required
              hint="Una frase para el peque, la dice la mascota al abrir la lección."
            />
            <CountedTextField
              id="lesson-goal"
              label="Desempeño esperado"
              value={details.learning_goal}
              onChange={(value) => setDetails((current) => ({ ...current, learning_goal: value }))}
              max={LIMITS.learningGoal}
              error={details.learning_goal.trim() ? undefined : "Escribe el desempeño esperado."}
              required
              multiline
              rows={2}
              hint="Lo que el peque podrá hacer al terminar, a partir del DBA de su grado y área."
            />
          </div>
        )}
        {tab === "content" && (
          <PagesEditor lessonId={lesson.id} pages={pages} onChange={setPages} onError={setToast} owner="la lección" />
        )}
        {tab === "activity" && <ActivityEditor activity={activity} onChange={setActivity} name="lesson" />}
        {tab === "extra" && (
          <ExtrasEditor lessonId={lesson.id} extras={lesson.extras} students={students} onError={setToast} />
        )}
      </section>

      <p className={styles.footnote}>
        {blockCount} {blockCount === 1 ? "bloque" : "bloques"} en {pages.length}{" "}
        {pages.length === 1 ? "página" : "páginas"} · Los cambios se guardan solos.
      </p>

      {confirming && (
        <ConfirmDialog
          title="Eliminar lección"
          message={`¿Seguro que quieres eliminar "${lesson.title}"? Se borran sus páginas, su actividad, sus extras y sus imágenes.`}
          acceptLabel="Sí, eliminar la lección"
          cancelLabel="Cancelar"
          danger
          onAccept={() => void doDelete()}
          onCancel={() => setConfirming(false)}
        />
      )}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </main>
  );
}
