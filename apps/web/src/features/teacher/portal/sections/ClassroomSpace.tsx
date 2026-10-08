import { useState, type ComponentType, type SVGProps } from "react";
import type { Classroom } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { useClassroomDetail, useDeleteClassroom, useTeacherClassrooms } from "@/shared/api/hooks/useClassroomsApi";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { ViewEnter } from "@/shared/ui/ViewEnter";
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
import { classroomAudience } from "../../classrooms/classroomDetails";
import { ClassroomFormDialog } from "../../classrooms/ClassroomFormDialog";
import { UnitsPanel } from "../../lessons/UnitsPanel";
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
  { view: "lecciones", title: "Unidades y lecciones", hint: "Organiza y publica el material", Icon: IconBook },
  { view: "mensajes", title: "Mensajes", hint: "Escríbele a un estudiante o a su tutor", Icon: IconMessage },
  { view: "estadisticas", title: "Estadísticas", hint: "El avance de la clase", Icon: IconChart },
];

/** The space of one classroom (HU-74): a header with a band of its color,
 * its avatar, name, code and students, "Editar" (HU-90) and "Eliminar"
 * (HU-85), and its options as cards like a kid's space in the Portal de
 * Padres (members, lessons, messages and statistics). */
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
  const audience = classroomAudience(classroom.area, classroom.grade, classroom.area_other);
  const current = OPTIONS.find((option) => option.view === view) ?? null;

  return (
    <div className={styles.section}>
      <button type="button" className={styles.backButton} onClick={current ? () => setView("inicio") : onBack}>
        <IconArrowLeft width={18} height={18} />
        {current ? "Regresar a la clase" : "Regresar a mis clases"}
      </button>

      {/* The classroom's header: a band of its color with the avatar hanging
          from it, the name, the chips and, on the space itself, its actions. */}
      <header className={styles.spaceHeader} data-color={classroom.color}>
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
              <span className={styles.chip}>Código de ingreso: {classroom.enrollment_code}</span>
              <span className={styles.chip}>{students === 1 ? "1 estudiante" : `${students} estudiantes`}</span>
              {pending > 0 && (
                <span className={styles.pendingChip}>
                  {pending === 1 ? "1 solicitud pendiente" : `${pending} solicitudes pendientes`}
                </span>
              )}
            </p>
            {!current && classroom.description && <p className={styles.heroDescription}>{classroom.description}</p>}
          </div>
          {!current && (
            <div className={styles.heroActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setEditing(true)}>
                <IconPencil width={16} height={16} />
                Editar
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => setConfirmingDelete(true)}
                disabled={deleteClassroom.isPending}
              >
                <IconTrash width={16} height={16} />
                {deleteClassroom.isPending ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          )}
        </div>
      </header>

      {error && (
        <p role="alert" className={`${styles.status} ${styles.error}`}>
          {error}
        </p>
      )}

      {/* Under the header, the option or the menu of options, with the
          entrance every time one is opened or closed. */}
      <ViewEnter view={view} level={current ? 1 : 0} className={styles.section}>
        {!current && (
          <div className={styles.options}>
            {OPTIONS.map(({ view: target, title, hint, Icon }) => (
              <button key={target} type="button" className={styles.optionCard} onClick={() => setView(target)}>
                <span className={styles.optionIcon} aria-hidden="true">
                  <Icon width={20} height={20} />
                </span>
                <span className={styles.optionText}>
                  <span className={styles.optionTitle}>{title}</span> <span className={styles.optionHint}>{hint}</span>
                </span>
                <IconArrowRight width={18} height={18} className={styles.optionArrow} />
              </button>
            ))}
          </div>
        )}

        {view === "miembros" && <MembersPanel classroom={classroom} onToast={onToast} />}
        {view === "lecciones" && <UnitsPanel classroomId={classroom.id} onToast={onToast} />}
        {(view === "mensajes" || view === "estadisticas") && (
          <div className={styles.comingSoon}>
            <span className={styles.optionIcon} aria-hidden="true">
              {view === "mensajes" ? <IconMessage width={20} height={20} /> : <IconChart width={20} height={20} />}
            </span>
            <div>
              <p className={styles.comingSoonTitle}>Estamos construyendo esta sección</p>
              <p className={styles.comingSoonText}>
                {view === "mensajes"
                  ? "Pronto podrás escribirle a un estudiante o a su tutor desde aquí."
                  : "Pronto verás aquí el avance de tus estudiantes en esta clase, con gráficos."}
              </p>
            </div>
          </div>
        )}
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
