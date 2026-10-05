import { useState } from "react";
import type { Classroom } from "@iris/shared-types";
import { useTeacherClassrooms } from "@/shared/api/hooks/useClassroomsApi";
import { IconArrowRight, IconPlus, IconSchool } from "@/shared/ui/icons";
import { Toast } from "@/shared/ui/Toast";
import { ClassroomAvatar } from "../../classrooms/ClassroomAvatar";
import { ClassroomFormDialog } from "../../classrooms/ClassroomFormDialog";
import { ClassroomSpace, type ClassroomView } from "./ClassroomSpace";
import styles from "../portalSection.module.css";

interface ClassroomsSectionProps {
  /** Opens this classroom right away, like when coming back from a lesson. */
  initialClassroomId?: string;
  initialView?: ClassroomView;
}

/** "Mis clases" (HU-73): one card per classroom with its avatar and name,
 * and the number of join requests waiting, plus the card to create a new
 * one. Picking a card opens that classroom's space (HU-74). */
export function ClassroomsSection({ initialClassroomId, initialView }: ClassroomsSectionProps) {
  const classrooms = useTeacherClassrooms();
  const [openId, setOpenId] = useState<string | null>(initialClassroomId ?? null);
  const [creating, setCreating] = useState(false);
  // Here and not in the classroom's space, so it stays when going back.
  const [toast, setToast] = useState<string | null>(null);

  function created(classroom: Classroom, message: string) {
    setCreating(false);
    setToast(message);
    setOpenId(classroom.id);
  }

  if (openId) {
    return (
      <>
        <ClassroomSpace
          classroomId={openId}
          initialView={openId === initialClassroomId ? initialView : undefined}
          onBack={() => setOpenId(null)}
          onToast={setToast}
        />
        {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
      </>
    );
  }

  if (classrooms.isLoading) return <p className={styles.status}>Cargando tus clases…</p>;
  if (classrooms.isError) {
    return (
      <p role="alert" className={`${styles.status} ${styles.error}`}>
        No pudimos cargar tus clases. Intenta recargar la página.
      </p>
    );
  }

  const list = classrooms.data ?? [];
  const pending = list.reduce((total, classroom) => total + classroom.pending_requests, 0);

  return (
    <div className={styles.section}>
      <header className={styles.hero}>
        <span className={styles.heroBadge} aria-hidden="true">
          <IconSchool width={34} height={34} />
        </span>
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>Mis clases</p>
          <h1 className={styles.heroTitle}>Tus clases</h1>
          <p className={styles.heroMeta}>
            <span className={styles.chip}>{list.length === 1 ? "1 clase" : `${list.length} clases`}</span>
            {pending > 0 && (
              <span className={styles.chip}>
                {pending === 1 ? "1 solicitud pendiente" : `${pending} solicitudes pendientes`}
              </span>
            )}
          </p>
        </div>
      </header>

      <ul className={styles.grid} aria-label="Tus clases">
        <li>
          <button type="button" className={styles.addCard} onClick={() => setCreating(true)}>
            <span className={styles.addIcon} aria-hidden="true">
              <IconPlus width={34} height={34} />
            </span>
            <span className={styles.addTitle}>Nueva clase</span>
          </button>
        </li>
        {list.map((classroom) => (
          <li key={classroom.id}>
            <button type="button" className={styles.card} onClick={() => setOpenId(classroom.id)}>
              {classroom.pending_requests > 0 && (
                <span className={styles.cardBadge}>
                  {classroom.pending_requests}
                  <span className={styles.visuallyHidden}>
                    {classroom.pending_requests === 1 ? " solicitud pendiente" : " solicitudes pendientes"}
                  </span>
                </span>
              )}
              <span className={`${styles.avatarRing} ${styles.squareRing}`}>
                <ClassroomAvatar classroom={classroom} size={88} />
              </span>
              <span className={styles.cardName}>{classroom.name}</span>
              <span className={styles.cardAction}>
                Entrar a la clase
                <IconArrowRight width={16} height={16} />
              </span>
            </button>
          </li>
        ))}
      </ul>

      {list.length === 0 && (
        <div className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden="true">
            <IconSchool width={24} height={24} />
          </span>
          <p className={styles.emptyTitle}>Todavía no tienes clases</p>
          <p className={styles.emptyText}>
            Crea tu primera clase con "Nueva clase". Después comparte su código de ingreso con las familias de tus
            estudiantes.
          </p>
        </div>
      )}

      {creating && <ClassroomFormDialog onClose={() => setCreating(false)} onSaved={created} />}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
