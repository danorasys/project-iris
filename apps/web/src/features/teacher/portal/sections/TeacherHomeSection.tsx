import type { ClassroomContentSummary, NotificationItem, TeacherClassroom } from "@iris/shared-types";
import { formatArrival } from "@/features/utils/formatArrival";
import { useTeacherClassrooms } from "@/shared/api/hooks/useClassroomsApi";
import { useContentSummary } from "@/shared/api/hooks/useLessonsApi";
import { useNotificationTray } from "@/shared/api/hooks/useNotifications";
import {
  IconAlert,
  IconArrowRight,
  IconBell,
  IconBook,
  IconCheck,
  IconChild,
  IconClassroom,
  IconClock,
  IconLayers,
  IconPlus,
} from "@/shared/ui/icons";
import { ClassroomAvatar } from "../../classrooms/ClassroomAvatar";
import { classroomAudience } from "../../classrooms/classroomDetails";
import { notificationSubject } from "../../notifications/teacherNotificationText";
import type { ClassroomView } from "./ClassroomSpace";
import { Empty, Panel, RowsSkeleton, Stat } from "@/shared/ui/portal/PortalHome";
import { WelcomeBanner } from "@/shared/ui/portal/WelcomeBanner";
import styles from "@/shared/ui/portal/PortalHome.module.css";

interface TeacherHomeSectionProps {
  /** For the greeting; while the account loads it just says "docente". */
  firstName?: string;
  onOpenClassroom: (classroomId: string, view?: ClassroomView) => void;
  onOpenClassrooms: () => void;
  onCreateClassroom: () => void;
  onOpenNotifications: () => void;
  /** Opens that notification in Notificaciones, read in full. */
  onOpenNotification: (notification: NotificationItem) => void;
}

// How many classes and notifications fit before "Ver todas".
const CLASSES_SHOWN = 5;
const NOTICES_SHOWN = 4;
const TASKS_SHOWN = 5;

interface Task {
  key: string;
  text: string;
  hint: string;
  tone: "orange" | "blue";
  onOpen: () => void;
}

/** "Inicio" of the Portal Docente: what's going on in the teacher's classes
 * at a glance. Four counts on top (classes, students, requests, lessons),
 * then the classes with their students and units, what needs the
 * teacher, and the latest notifications. Everything is real data. */
export function TeacherHomeSection({
  firstName,
  onOpenClassroom,
  onOpenClassrooms,
  onCreateClassroom,
  onOpenNotifications,
  onOpenNotification,
}: TeacherHomeSectionProps) {
  const classrooms = useTeacherClassrooms();
  const summary = useContentSummary();
  const tray = useNotificationTray("teacher", 1, NOTICES_SHOWN);

  // The archived classes (HU-105) don't count in what's going on now.
  const list = (classrooms.data ?? []).filter((c) => !c.archived_at);
  const content = new Map((summary.data ?? []).map((item) => [item.classroom_id, item]));
  const students = list.reduce((total, c) => total + c.student_count, 0);
  const pending = list.reduce((total, c) => total + c.pending_requests, 0);
  const published = (summary.data ?? []).reduce((total, item) => total + item.published_lessons, 0);
  const drafts = (summary.data ?? []).reduce((total, item) => total + item.draft_lessons, 0);
  const loading = classrooms.isLoading || summary.isLoading;

  if (classrooms.isError) {
    return (
      <p role="alert" className={styles.status}>
        No pudimos cargar tu inicio. Intenta recargar la página.
      </p>
    );
  }

  const tasks = buildTasks(list, content, onOpenClassroom);

  return (
    <div className={styles.home}>
      <WelcomeBanner
        name={firstName ?? "docente"}
        text="Así van tus clases en IRIS: lo que piden tus estudiantes y lo que falta por publicar."
        actions={
          <button type="button" className={styles.primaryButton} onClick={onCreateClassroom}>
            <IconPlus width={18} height={18} />
            Nueva clase
          </button>
        }
      />

      <section className={styles.stats} aria-label="Resumen de tus clases">
        <Stat label="Clases" value={list.length} hint={gradesHint(list)} Icon={IconClassroom} loading={loading} />
        <Stat
          label="Estudiantes"
          value={students}
          hint={list.length === 1 ? "en tu clase" : "en todas tus clases"}
          Icon={IconChild}
          loading={loading}
        />
        <Stat
          label="Solicitudes"
          value={pending}
          hint={pending > 0 ? "esperan tu respuesta" : "ninguna pendiente"}
          Icon={IconClock}
          loading={loading}
          highlight={pending > 0}
        />
        <Stat
          label="Lecciones publicadas"
          value={published}
          hint={drafts === 1 ? "1 en borrador" : `${drafts} en borrador`}
          Icon={IconBook}
          loading={loading}
        />
      </section>

      <div className={styles.columns}>
        <Panel
          title="Tus clases"
          action={list.length > 0 ? { label: "Ver todas", onClick: onOpenClassrooms } : undefined}
        >
          {loading ? (
            <RowsSkeleton />
          ) : list.length === 0 ? (
            // "Nueva clase" is already in the welcome, one button is enough.
            <Empty
              Icon={IconClassroom}
              title="Todavía no tienes clases"
              text="Crea tu primera clase con «Nueva clase» y comparte su código de ingreso con las familias de tus estudiantes."
            />
          ) : (
            <ul className={styles.classList}>
              <li className={styles.tableHead} aria-hidden="true">
                <span>Clase</span>
                <span>Estudiantes</span>
                <span>Unidades</span>
              </li>
              {list.slice(0, CLASSES_SHOWN).map((classroom) => (
                <ClassRow
                  key={classroom.id}
                  classroom={classroom}
                  content={content.get(classroom.id)}
                  onOpen={() => onOpenClassroom(classroom.id)}
                />
              ))}
            </ul>
          )}
        </Panel>

        <div className={styles.side}>
          <Panel title="Requiere tu atención">
            {loading ? (
              <RowsSkeleton rows={2} />
            ) : tasks.length === 0 ? (
              <Empty
                Icon={IconCheck}
                done
                title="Todo al día"
                text={
                  list.length === 0 ? "Cuando tengas clases, aquí verás lo pendiente." : "No hay nada esperando por ti."
                }
              />
            ) : (
              <ul className={styles.tasks}>
                {tasks.slice(0, TASKS_SHOWN).map((task) => (
                  <li key={task.key}>
                    <button type="button" className={styles.task} onClick={task.onOpen}>
                      <span className={`${styles.taskIcon} ${styles[task.tone]}`} aria-hidden="true">
                        {task.tone === "orange" ? (
                          <IconAlert width={18} height={18} />
                        ) : (
                          <IconLayers width={18} height={18} />
                        )}
                      </span>
                      <span className={styles.taskText}>
                        <span className={styles.taskTitle}>{task.text}</span>
                        <span className={styles.taskHint}>{task.hint}</span>
                      </span>
                      <IconArrowRight width={16} height={16} className={styles.chevron} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Notificaciones recientes" action={{ label: "Ver todas", onClick: onOpenNotifications }}>
            {tray.isLoading ? (
              <RowsSkeleton rows={3} />
            ) : (tray.data?.items ?? []).length === 0 ? (
              <Empty Icon={IconBell} title="No tienes notificaciones por ahora" />
            ) : (
              <ul className={styles.notices}>
                {(tray.data?.items ?? []).map((notice) => (
                  <li key={notice.id}>
                    <button type="button" className={styles.notice} onClick={() => onOpenNotification(notice)}>
                      <span className={notice.read ? styles.readDot : styles.unreadDot} aria-hidden="true" />
                      <span className={styles.noticeText}>
                        <span className={styles.noticeTitle}>
                          {notificationSubject(notice)}
                          {!notice.read && <span className={styles.visuallyHidden}> (sin leer)</span>}
                        </span>
                        <span className={styles.noticeTime}>{formatArrival(notice.created_at)}</span>
                      </span>
                      <IconArrowRight width={16} height={16} className={styles.chevron} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

// What's waiting for the teacher, most urgent first: join requests, then
// classes without units, then lessons still as drafts.
function buildTasks(
  list: TeacherClassroom[],
  content: Map<string, ClassroomContentSummary>,
  onOpenClassroom: TeacherHomeSectionProps["onOpenClassroom"],
): Task[] {
  const requests: Task[] = list
    .filter((c) => c.pending_requests > 0)
    .map((c) => ({
      key: `requests-${c.id}`,
      text: c.pending_requests === 1 ? "1 solicitud de ingreso" : `${c.pending_requests} solicitudes de ingreso`,
      hint: c.name,
      tone: "orange",
      onOpen: () => onOpenClassroom(c.id, "miembros"),
    }));
  const noUnits: Task[] = list
    .filter((c) => !content.get(c.id)?.units)
    .map((c) => ({
      key: `units-${c.id}`,
      text: "Aún no tiene unidades",
      hint: c.name,
      tone: "blue",
      onOpen: () => onOpenClassroom(c.id, "lecciones"),
    }));
  const withDrafts: Task[] = list
    .filter((c) => (content.get(c.id)?.draft_lessons ?? 0) > 0)
    .map((c) => {
      const count = content.get(c.id)?.draft_lessons ?? 0;
      return {
        key: `drafts-${c.id}`,
        text: count === 1 ? "1 lección en borrador" : `${count} lecciones en borrador`,
        hint: c.name,
        tone: "blue",
        onOpen: () => onOpenClassroom(c.id, "lecciones"),
      };
    });
  return [...requests, ...noUnits, ...withDrafts];
}

// "Grados 1.° a 3.°" from the classes, or a nudge when there are none.
function gradesHint(list: TeacherClassroom[]): string {
  if (list.length === 0) return "crea la primera";
  const grades = list.map((c) => c.grade);
  const low = Math.min(...grades);
  const high = Math.max(...grades);
  return low === high ? `de ${low}.° grado` : `de ${low}.° a ${high}.° grado`;
}

// One class: who it's for, how many students and how many units it has.
function ClassRow({
  classroom,
  content,
  onOpen,
}: {
  classroom: TeacherClassroom;
  content: ClassroomContentSummary | undefined;
  onOpen: () => void;
}) {
  const units = content?.units ?? 0;
  const audience = classroomAudience(classroom.area, classroom.grade, classroom.area_other);

  return (
    <li>
      <button type="button" className={styles.classRow} onClick={onOpen}>
        <span className={styles.className}>
          <ClassroomAvatar classroom={classroom} size={44} />
          <span className={styles.classTitle}>{classroom.name}</span>
          {audience && <span className={styles.classAudience}>{audience}</span>}
        </span>
        {/* The word after each number: on a computer only screen readers get
            it (the table heading says it), a phone shows it. */}
        <span className={styles.classCount}>
          <IconChild width={16} height={16} aria-hidden="true" />
          {classroom.student_count}
          <span className={styles.countWord}>{classroom.student_count === 1 ? " estudiante" : " estudiantes"}</span>
        </span>
        <span className={`${styles.classCount} ${styles.classUnits}`}>
          <IconLayers width={16} height={16} aria-hidden="true" />
          {units}
          <span className={styles.countWord}>{units === 1 ? " unidad" : " unidades"}</span>
        </span>
        {classroom.pending_requests > 0 ? (
          <span className={styles.pendingPill}>
            {classroom.pending_requests}
            <span className={styles.visuallyHidden}>
              {classroom.pending_requests === 1 ? " solicitud pendiente" : " solicitudes pendientes"}
            </span>
          </span>
        ) : (
          <IconArrowRight width={16} height={16} className={styles.chevron} />
        )}
      </button>
    </li>
  );
}
