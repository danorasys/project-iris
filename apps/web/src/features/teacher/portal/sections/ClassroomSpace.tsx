import { useState, type ComponentType, type SVGProps } from "react";
import type { Classroom } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { useClassroomDetail, useDeleteClassroom, useTeacherClassrooms } from "@/shared/api/hooks/useClassroomsApi";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import {
  IconArrowLeft,
  IconArrowRight,
  IconBook,
  IconChart,
  IconChild,
  IconMessage,
  IconPencil,
  IconTrash,
} from "@/shared/ui/icons";
import { ClassroomAvatar } from "../../classrooms/ClassroomAvatar";
import { ClassroomFormDialog } from "../../classrooms/ClassroomFormDialog";
import { LessonsPanel } from "./LessonsPanel";
import { MembersPanel } from "./MembersPanel";
import styles from "../portalSection.module.css";

export type ClassroomView = "inicio" | "miembros" | "lecciones" | "mensajes" | "estadisticas";

interface ClassroomSpaceProps {
  classroomId: string;
  initialView?: ClassroomView;
  /** Back to "Mis clases". */
  onBack: () => void;
  onToast: (message: string) => void;
}

interface Option {
  view: Exclude<ClassroomView, "inicio">;
  title: string;
  hint: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const OPTIONS: Option[] = [
  { view: "miembros", title: "Miembros", hint: "Tus estudiantes y sus familias", Icon: IconChild },
  { view: "lecciones", title: "Lecciones", hint: "Crea y publica el material", Icon: IconBook },
  { view: "mensajes", title: "Mensajes", hint: "Escríbele a un estudiante o a su tutor", Icon: IconMessage },
  { view: "estadisticas", title: "Estadísticas", hint: "El avance de la clase", Icon: IconChart },
];

/** The space of one classroom (HU-74): its avatar, name, description and
 * code on top, with "Editar" (HU-90) and "Eliminar" (HU-85), and its
 * options as cards: members, lessons, messages, statistics and back. */
export function ClassroomSpace({ classroomId, initialView = "inicio", onBack, onToast }: ClassroomSpaceProps) {
  const detail = useClassroomDetail(classroomId);
  // The pending count comes with the list, already cached.
  const listed = useTeacherClassrooms().data?.find((c) => c.id === classroomId);
  const deleteClassroom = useDeleteClassroom();
  const [view, setView] = useState<ClassroomView>(initialView);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(classroom: Classroom) {
    setConfirmingDelete(false);
    setError(null);
    try {
      await deleteClassroom.mutateAsync(classroom.id);
      onToast(`La clase "${classroom.name}" se eliminó.`);
      onBack();
    } catch (failure) {
      setError(getAuthErrorMessage(failure));
    }
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

  return (
    <div className={styles.section}>
      <button
        type="button"
        className={styles.backButton}
        onClick={view === "inicio" ? onBack : () => setView("inicio")}
      >
        <IconArrowLeft width={18} height={18} />
        {view === "inicio" ? "Regresar a mis clases" : "Regresar a la clase"}
      </button>

      <header className={styles.hero}>
        <span className={`${styles.avatarRing} ${styles.squareRing}`}>
          <ClassroomAvatar classroom={classroom} size={76} />
        </span>
        <div className={styles.heroBody}>
          <p className={styles.eyebrow}>Clase</p>
          <h1 className={styles.heroTitle}>{classroom.name}</h1>
          <p className={styles.heroMeta}>
            <span className={styles.chip}>Código de ingreso: {classroom.enrollment_code}</span>
            <span className={styles.chip}>{students === 1 ? "1 estudiante" : `${students} estudiantes`}</span>
            {pending > 0 && (
              <span className={styles.chip}>
                {pending === 1 ? "1 solicitud pendiente" : `${pending} solicitudes pendientes`}
              </span>
            )}
          </p>
          <p className={styles.heroDescription}>{classroom.description}</p>
        </div>
        {view === "inicio" && (
          <div className={styles.heroActions}>
            <button type="button" className={styles.heroButton} onClick={() => setEditing(true)}>
              <IconPencil width={16} height={16} />
              Editar
            </button>
            <button
              type="button"
              className={`${styles.heroButton} ${styles.heroButtonDanger}`}
              onClick={() => setConfirmingDelete(true)}
              disabled={deleteClassroom.isPending}
            >
              <IconTrash width={16} height={16} />
              {deleteClassroom.isPending ? "Eliminando…" : "Eliminar"}
            </button>
          </div>
        )}
      </header>

      {error && (
        <p role="alert" className={`${styles.status} ${styles.error}`}>
          {error}
        </p>
      )}

      {view === "inicio" && (
        <div className={styles.options}>
          {OPTIONS.map(({ view: target, title, hint, Icon }) => (
            <button key={target} type="button" className={styles.optionCard} onClick={() => setView(target)}>
              <span className={styles.optionIcon} aria-hidden="true">
                <Icon width={22} height={22} />
              </span>
              <span className={styles.optionText}>
                <span className={styles.optionTitle}>{title}</span>{" "}
                <span className={styles.optionHint}>{hint}</span>
              </span>
              <IconArrowRight width={18} height={18} className={styles.optionArrow} />
            </button>
          ))}
          <button type="button" className={styles.optionCard} onClick={onBack}>
            <span className={styles.optionIcon} aria-hidden="true">
              <IconArrowLeft width={22} height={22} />
            </span>
            <span className={styles.optionText}>
              <span className={styles.optionTitle}>Regresar</span>{" "}
              <span className={styles.optionHint}>Volver a mis clases</span>
            </span>
          </button>
        </div>
      )}

      {view === "miembros" && <MembersPanel classroom={classroom} onToast={onToast} />}
      {view === "lecciones" && <LessonsPanel classroomId={classroom.id} />}
      {(view === "mensajes" || view === "estadisticas") && (
        <div className={styles.comingSoon}>
          <span className={styles.optionIcon} aria-hidden="true">
            {view === "mensajes" ? <IconMessage width={22} height={22} /> : <IconChart width={22} height={22} />}
          </span>
          <div>
            <p className={styles.comingSoonTitle}>{view === "mensajes" ? "Mensajes" : "Estadísticas"}</p>
            <p className={styles.comingSoonText}>
              {view === "mensajes"
                ? "Pronto podrás escribirle a un estudiante o a su tutor desde aquí."
                : "Pronto verás aquí el avance de tus estudiantes en esta clase, con gráficos."}
            </p>
          </div>
        </div>
      )}

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

      {confirmingDelete && (
        <ConfirmDialog
          title="Eliminar clase"
          message={`¿Seguro que quieres eliminar la clase "${classroom.name}"? También se eliminarán sus lecciones y las inscripciones de sus estudiantes. No se puede deshacer.`}
          acceptLabel="Sí, eliminar la clase"
          cancelLabel="Cancelar"
          danger
          onAccept={() => void remove(classroom)}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}
