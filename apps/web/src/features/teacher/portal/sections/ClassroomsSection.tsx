import { useState } from "react";
import type { Classroom, TeacherClassroom } from "@iris/shared-types";
import { useTeacherClassrooms } from "@/shared/api/hooks/useClassroomsApi";
import { useContentSummary } from "@/shared/api/hooks/useLessonsApi";
import { IconArchive, IconArrowDown, IconArrowRight, IconClassroom, IconPlus } from "@/shared/ui/icons";
import { Toast } from "@/shared/ui/Toast";
import { ViewEnter } from "@/shared/ui/ViewEnter";
import { ClassroomAvatar } from "../../classrooms/ClassroomAvatar";
import { classroomAudience } from "../../classrooms/classroomDetails";
import { ClassroomFormDialog } from "../../classrooms/ClassroomFormDialog";
import { ClassroomSpace, type ClassroomView } from "./ClassroomSpace";
import styles from "../portalSection.module.css";

interface ClassroomsSectionProps {
  /** Opens this classroom right away, like when coming back from a lesson. */
  initialClassroomId?: string;
  initialView?: ClassroomView;
  /** Opens the dialog of a new classroom, like from "Nueva clase" in Inicio. */
  startCreating?: boolean;
}

/** "Mis clases" (HU-73), laid out like "Mis peques" of the Portal de
 * Padres: a light header with how many classes and requests there are, and
 * a white panel with the classrooms and the dashed card to create one. Each
 * classroom is a profile card: a band of its color, its avatar, who it's
 * for and three numbers (students, published lessons and requests).
 * Picking a card opens that classroom (HU-74). The archived ones (HU-105)
 * wait folded under the active ones, faded. */
export function ClassroomsSection({ initialClassroomId, initialView, startCreating = false }: ClassroomsSectionProps) {
  const classrooms = useTeacherClassrooms();
  const summary = useContentSummary();
  const [openId, setOpenId] = useState<string | null>(initialClassroomId ?? null);
  const [creating, setCreating] = useState(startCreating);
  const [showArchived, setShowArchived] = useState(false);
  // Here and not in the classroom's space, so it stays when going back.
  const [toast, setToast] = useState<string | null>(null);

  function created(classroom: Classroom, message: string) {
    setCreating(false);
    setToast(message);
    setOpenId(classroom.id);
  }

  // The list and a classroom's space are in the same ViewEnter, so going
  // from one to the other plays the entrance. The toast stays out of it.
  if (openId) {
    return (
      <>
        <ViewEnter view={openId} level={1}>
          <ClassroomSpace
            classroomId={openId}
            initialView={openId === initialClassroomId ? initialView : undefined}
            onBack={() => setOpenId(null)}
            onToast={setToast}
          />
        </ViewEnter>
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

  const all = classrooms.data ?? [];
  const list = all.filter((classroom) => !classroom.archived_at);
  const archived = all.filter((classroom) => classroom.archived_at);
  const pending = list.reduce((total, classroom) => total + classroom.pending_requests, 0);
  const published = new Map((summary.data ?? []).map((item) => [item.classroom_id, item.published_lessons]));

  return (
    <>
      <ViewEnter view="list">
        <div className={styles.section}>
          <header className={styles.hero}>
            <span className={styles.heroBadge} aria-hidden="true">
              <IconClassroom width={34} height={34} />
            </span>
            <div className={styles.heroText}>
              <p className={styles.eyebrow}>Mis clases</p>
              <h1 className={styles.heroTitle}>Tus clases</h1>
              <p className={styles.heroMeta}>
                <span className={styles.chip}>{list.length === 1 ? "1 clase" : `${list.length} clases`}</span>
                {archived.length > 0 && (
                  <span className={styles.archivedChip}>
                    {archived.length === 1 ? "1 archivada" : `${archived.length} archivadas`}
                  </span>
                )}
                {pending > 0 && (
                  <span className={styles.pendingChip}>
                    {pending === 1 ? "1 solicitud pendiente" : `${pending} solicitudes pendientes`}
                  </span>
                )}
              </p>
            </div>
          </header>

          {/* The classrooms go on their own white panel, like the kids' profiles. */}
          <section className={styles.panel} aria-label="Tus clases">
            {list.length === 0 && (
              <div className={styles.empty}>
                <span className={styles.emptyIcon} aria-hidden="true">
                  <IconClassroom width={24} height={24} />
                </span>
                <p className={styles.emptyTitle}>Todavía no tienes clases</p>
                <p className={styles.emptyText}>
                  Crea tu primera clase con "Nueva clase". Después comparte su código de ingreso con las familias de tus
                  estudiantes.
                </p>
              </div>
            )}

            <ul className={styles.grid}>
              {list.map((classroom) => (
                <li key={classroom.id}>
                  <ClassCard
                    classroom={classroom}
                    lessons={published.get(classroom.id) ?? 0}
                    onOpen={() => setOpenId(classroom.id)}
                  />
                </li>
              ))}
              <li>
                <button type="button" className={styles.addCard} onClick={() => setCreating(true)}>
                  <span className={styles.addIcon} aria-hidden="true">
                    <IconPlus width={34} height={34} />
                  </span>
                  <span className={styles.addTitle}>Nueva clase</span>
                </button>
              </li>
            </ul>
          </section>

          {archived.length > 0 && (
            <section className={styles.panel} aria-label="Clases archivadas">
              <button
                type="button"
                className={styles.disclosure}
                onClick={() => setShowArchived((shown) => !shown)}
                aria-expanded={showArchived}
                aria-controls="archived-classrooms"
              >
                <span>
                  {showArchived ? "Ocultar" : "Ver"} clases archivadas ({archived.length})
                </span>
                <IconArrowDown width={18} height={18} />
              </button>
              {showArchived && (
                <ul id="archived-classrooms" className={styles.grid}>
                  {archived.map((classroom) => (
                    <li key={classroom.id}>
                      <ClassCard
                        classroom={classroom}
                        lessons={published.get(classroom.id) ?? 0}
                        onOpen={() => setOpenId(classroom.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {creating && <ClassroomFormDialog onClose={() => setCreating(false)} onSaved={created} />}
        </div>
      </ViewEnter>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </>
  );
}

// One classroom as a profile card: the band of its color, its avatar, who
// it's for and its three numbers. An archived one fades and says so.
function ClassCard({
  classroom,
  lessons,
  onOpen,
}: {
  classroom: TeacherClassroom;
  lessons: number;
  onOpen: () => void;
}) {
  const audience = classroomAudience(classroom.area, classroom.grade, classroom.area_other);
  const archived = Boolean(classroom.archived_at);
  return (
    <button
      type="button"
      className={styles.classCard}
      data-color={classroom.color}
      data-archived={archived}
      onClick={onOpen}
    >
      <span className={styles.cardBanner} aria-hidden="true" />
      <span className={styles.cardAvatar}>
        <ClassroomAvatar classroom={classroom} size={76} />
      </span>
      <span className={styles.cardName}>{classroom.name}</span>
      {audience && <span className={styles.cardAudience}>{audience}</span>}
      {archived && (
        <span className={styles.archivedChip}>
          <IconArchive width={14} height={14} />
          Archivada
        </span>
      )}
      <span className={styles.cardStats}>
        <span className={styles.cardStat}>
          <span className={styles.cardStatValue}>{classroom.student_count}</span>
          <span className={styles.cardStatLabel}>{classroom.student_count === 1 ? "Estudiante" : "Estudiantes"}</span>
        </span>
        <span className={styles.cardStat}>
          <span className={styles.cardStatValue}>{lessons}</span>
          <span className={styles.cardStatLabel}>{lessons === 1 ? "Lección" : "Lecciones"}</span>
        </span>
        <span className={styles.cardStat} data-pending={classroom.pending_requests > 0}>
          <span className={styles.cardStatValue}>{classroom.pending_requests}</span>
          <span className={styles.cardStatLabel}>{classroom.pending_requests === 1 ? "Solicitud" : "Solicitudes"}</span>
        </span>
      </span>
      <span className={styles.cardAction}>
        {archived ? "Ver la clase" : "Entrar a la clase"}
        <IconArrowRight width={16} height={16} />
      </span>
    </button>
  );
}
