import { useState } from "react";
import type { Classroom } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import {
  useArchiveClassroom,
  useClassroomDetail,
  useDeleteClassroom,
  useRestoreClassroom,
  useTeacherClassrooms,
} from "@/shared/api/hooks/useClassroomsApi";
import { formatDay } from "@/features/utils/formatArrival";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { OptionsPanel, type OptionItem } from "@/shared/ui/portal/OptionsPanel";
import { ViewEnter } from "@/shared/ui/ViewEnter";
import {
  IconArchive,
  IconArrowLeft,
  IconBook,
  IconChart,
  IconChild,
  IconMessage,
  IconPencil,
  IconTrash,
  IconUndo,
} from "@/shared/ui/icons";
import { ClassroomAvatar } from "../../classrooms/ClassroomAvatar";
import { classroomAudience } from "../../classrooms/classroomDetails";
import { ClassroomFormDialog } from "../../classrooms/ClassroomFormDialog";
import { UnitsPanel } from "../../lessons/UnitsPanel";
import { StatisticsPanel } from "../../statistics/StatisticsPanel";
import { MembersPanel } from "./MembersPanel";
import { MessagesPanel } from "./MessagesPanel";
import styles from "../portalSection.module.css";

export type ClassroomView = "inicio" | "miembros" | "lecciones" | "mensajes" | "estadisticas";

interface ClassroomSpaceProps {
  classroomId: string;
  initialView?: ClassroomView;
  /** Back to "Mis clases". */
  onBack: () => void;
  onToast: (message: string) => void;
}

const OPTIONS: OptionItem<Exclude<ClassroomView, "inicio">>[] = [
  {
    id: "miembros",
    title: "Miembros",
    hint: "Tus estudiantes con el contacto de su familia, y las solicitudes de ingreso que esperan tu respuesta.",
    Icon: IconChild,
  },
  {
    id: "lecciones",
    title: "Unidades y lecciones",
    hint: "Organiza la clase en unidades, prepara sus lecciones con su actividad y publícalas para tus estudiantes.",
    Icon: IconBook,
  },
  {
    id: "mensajes",
    title: "Mensajes",
    hint: "Escríbele a un estudiante o a su familia, y lee los mensajes que las familias te envían.",
    Icon: IconMessage,
  },
  {
    id: "estadisticas",
    title: "Estadísticas",
    hint: "Cuánto ha avanzado la clase, cómo va cada estudiante y los resultados de cada lección.",
    Icon: IconChart,
  },
];

// What each button of the header asks before doing it.
type Confirming = "archive" | "delete" | null;

/** The space of one classroom (HU-74): its header with "Editar" (HU-90)
 * and "Archivar" (HU-105), and its options as a list. An archived class is
 * read only and offers "Restaurar" and "Eliminar" (HU-85). */
export function ClassroomSpace({ classroomId, initialView = "inicio", onBack, onToast }: ClassroomSpaceProps) {
  const detail = useClassroomDetail(classroomId);
  // The pending count comes with the list, already cached.
  const listed = useTeacherClassrooms().data?.find((c) => c.id === classroomId);
  const archiveClassroom = useArchiveClassroom();
  const restoreClassroom = useRestoreClassroom();
  const deleteClassroom = useDeleteClassroom();
  const [view, setView] = useState<ClassroomView>(initialView);
  // "Escribir" in Miembros: Mensajes opens on a new message to that kid.
  const [writeTo, setWriteTo] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = archiveClassroom.isPending || restoreClassroom.isPending || deleteClassroom.isPending;

  // Moving between the options starts each one as usual.
  function openView(next: ClassroomView) {
    setWriteTo(null);
    setView(next);
  }

  // The three do the same: run it, say how it went, and on deleting go back.
  async function run(action: () => Promise<unknown>, done: string, leave = false) {
    setConfirming(null);
    setError(null);
    try {
      await action();
      onToast(done);
      if (leave) onBack();
      else setView("inicio");
    } catch (failure) {
      setError(getAuthErrorMessage(failure));
    }
  }

  function archive(classroom: Classroom) {
    void run(() => archiveClassroom.mutateAsync(classroom.id), `La clase "${classroom.name}" se archivó.`);
  }

  function restore(classroom: Classroom) {
    void run(() => restoreClassroom.mutateAsync(classroom.id), `La clase "${classroom.name}" volvió a tus clases.`);
  }

  function remove(classroom: Classroom) {
    void run(() => deleteClassroom.mutateAsync(classroom.id), `La clase "${classroom.name}" se eliminó.`, true);
  }

  if (detail.isLoading) return <p className={styles.status}>Cargando la clase…</p>;
  if (detail.isError || !detail.data) {
    return (
      <div className={styles.section}>
        <button type="button" className={styles.backButton} onClick={onBack}>
          <IconArrowLeft width={18} height={18} />
          Regresar a mis clases
        </button>
        <p role="alert" className={`${styles.status} ${styles.error}`}>
          No pudimos abrir esta clase. Puede que ya no exista.
        </p>
      </div>
    );
  }

  const classroom = detail.data;
  const students = classroom.students.length;
  const pending = listed?.pending_requests ?? 0;
  const audience = classroomAudience(classroom.area, classroom.grade, classroom.area_other);
  const archived = Boolean(classroom.archived_at);
  // Nothing can be sent from an archived class, so its messages are out.
  const options = archived ? OPTIONS.filter((option) => option.id !== "mensajes") : OPTIONS;
  const current = options.find((option) => option.id === view) ?? null;

  return (
    <div className={styles.section}>
      <button type="button" className={styles.backButton} onClick={current ? () => openView("inicio") : onBack}>
        <IconArrowLeft width={18} height={18} />
        {current ? "Regresar a la clase" : "Regresar a mis clases"}
      </button>

      {/* The classroom's header: a band of its color with the avatar hanging
          from it, the name, the chips and, on the space itself, its actions. */}
      <header className={styles.spaceHeader} data-color={classroom.color} data-archived={archived}>
        <span className={styles.spaceBanner} aria-hidden="true" />
        <div className={styles.spaceRow}>
          <span className={styles.spaceAvatar}>
            <ClassroomAvatar classroom={classroom} size={84} />
          </span>
          <div className={styles.spaceBody}>
            <p className={styles.eyebrow}>{current ? current.title : "Clase"}</p>
            <h1 className={styles.heroTitle}>{classroom.name}</h1>
            <p className={styles.heroMeta}>
              {audience && <span className={styles.chip}>{audience}</span>}
              {archived ? (
                <span className={styles.archivedChip}>
                  <IconArchive width={14} height={14} />
                  Archivada
                </span>
              ) : (
                <span className={styles.chip}>Código de ingreso: {classroom.enrollment_code}</span>
              )}
              <span className={styles.chip}>{students === 1 ? "1 estudiante" : `${students} estudiantes`}</span>
              {pending > 0 && (
                <span className={styles.pendingChip}>
                  {pending === 1 ? "1 solicitud pendiente" : `${pending} solicitudes pendientes`}
                </span>
              )}
            </p>
            {!current && classroom.description && <p className={styles.heroDescription}>{classroom.description}</p>}
          </div>
          {!current && !archived && (
            <div className={styles.heroActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setEditing(true)}>
                <IconPencil width={16} height={16} />
                Editar
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setConfirming("archive")}
                disabled={busy}
              >
                <IconArchive width={16} height={16} />
                {archiveClassroom.isPending ? "Archivando…" : "Archivar"}
              </button>
            </div>
          )}
          {!current && archived && (
            <div className={styles.heroActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => restore(classroom)}
                disabled={busy}
              >
                <IconUndo width={16} height={16} />
                {restoreClassroom.isPending ? "Restaurando…" : "Restaurar"}
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => setConfirming("delete")}
                disabled={busy}
              >
                <IconTrash width={16} height={16} />
                {deleteClassroom.isPending ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          )}
        </div>
      </header>

      {archived && classroom.archived_at && (
        <div className={styles.archivedNotice} role="status">
          <IconArchive width={20} height={20} />
          <p>
            Archivaste esta clase el {formatDay(classroom.archived_at)}. Puedes consultar sus miembros, lecciones y
            estadísticas, pero no cambiarla. Sus estudiantes ya no la ven y su código no recibe solicitudes.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className={`${styles.status} ${styles.error}`}>
          {error}
        </p>
      )}

      {/* Under the header, the option or the menu of options, with the
          entrance every time one is opened or closed. */}
      <ViewEnter view={view} level={current ? 1 : 0} className={styles.section}>
        {/* One under the other, like the options of a kid's class. */}
        {!current && (
          <OptionsPanel
            titleId="classroom-options-title"
            title="Opciones de la clase"
            options={options}
            onPick={openView}
          />
        )}

        {view === "miembros" && (
          <MembersPanel
            classroom={classroom}
            onToast={onToast}
            readOnly={archived}
            onWrite={(enrollmentId) => {
              setWriteTo(enrollmentId);
              setView("mensajes");
            }}
          />
        )}
        {view === "lecciones" && (
          <UnitsPanel classroomId={classroom.id} area={classroom.area} onToast={onToast} readOnly={archived} />
        )}
        {view === "mensajes" && <MessagesPanel classroom={classroom} onToast={onToast} composeFor={writeTo} />}
        {view === "estadisticas" && <StatisticsPanel classroomId={classroom.id} />}
      </ViewEnter>

      {editing && (
        <ClassroomFormDialog
          classroom={classroom}
          onClose={() => setEditing(false)}
          onSaved={(_saved, message) => {
            setEditing(false);
            onToast(message);
          }}
        />
      )}

      {confirming === "archive" && (
        <ConfirmDialog
          title="Archivar clase"
          message={archiveQuestion(classroom.name, pending)}
          acceptLabel="Sí, archivar la clase"
          cancelLabel="Cancelar"
          onAccept={() => archive(classroom)}
          onCancel={() => setConfirming(null)}
        />
      )}

      {confirming === "delete" && (
        <ConfirmDialog
          title="Eliminar clase"
          message={deleteQuestion(classroom.name, students)}
          acceptLabel="Sí, eliminar la clase"
          cancelLabel="Cancelar"
          danger
          onAccept={() => remove(classroom)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

// What archiving does, said before it happens: the requests still waiting
// are closed, so it says how many.
function archiveQuestion(name: string, pending: number): string {
  const closed =
    pending === 0
      ? ""
      : ` y se cerrarán ${pending === 1 ? "la solicitud que espera" : `las ${pending} solicitudes que esperan`} respuesta`;
  return `¿Quieres archivar la clase "${name}"? Sus estudiantes dejarán de verla, su código no recibirá solicitudes${closed}. Les avisaremos a sus familias. Podrás restaurarla cuando quieras.`;
}

// Deleting can't be undone, so it says how many kids lose their progress.
function deleteQuestion(name: string, students: number): string {
  const lost =
    students === 0
      ? ""
      : `, y ${students === 1 ? "su estudiante perderá su progreso" : `sus ${students} estudiantes perderán su progreso`}`;
  return `¿Seguro que quieres eliminar la clase "${name}"? Se borrarán sus unidades, lecciones y archivos${lost}. Les avisaremos a sus familias. No se puede deshacer.`;
}
