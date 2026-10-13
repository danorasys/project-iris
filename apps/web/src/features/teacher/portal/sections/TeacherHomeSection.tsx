import type { ClassroomContentSummary, NotificationItem, TeacherClassroom } from "@iris/shared-types";
import { formatArrival } from "@/features/utils/formatArrival";
import { useTeacherClassrooms } from "@/shared/api/hooks/useClassroomsApi";
import { useContentSummary } from "@/shared/api/hooks/useLessonsApi";
import { useNotificationTray } from "@/shared/api/hooks/useNotifications";
import {
  IconArrowRight,
  IconBell,
  IconBook,
  IconCheck,
  IconChild,
  IconClassroom,
  IconClock,
  IconImage,
  IconKey,
  IconLayers,
  IconPlus,
  IconQuestion,
  IconText,
} from "@/shared/ui/icons";
import { ClassroomAvatar } from "../../classrooms/ClassroomAvatar";
import { classroomAudience } from "../../classrooms/classroomDetails";
import { notificationSubject } from "../../notifications/teacherNotificationText";
import type { ClassroomView } from "./ClassroomSpace";
import {
  Empty,
  Panel,
  RowsSkeleton,
  Stat,
  TaskList,
  TipList,
  type HomeTask,
  type HomeTip,
} from "@/shared/ui/portal/PortalHome";
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

// How many classes and notifications fit; the rest are in "Ver todas" of
// the panel. 3 classes, like the 3 kids on the parents' Inicio.
const CLASSES_SHOWN = 3;
const NOTICES_SHOWN = 4;
const TASKS_SHOWN = 4;

// What helps a class work with the gaze, at hand on Inicio like the
// parents' tips before a session. The alt text and the 2 to 4 options are
// also what a lesson needs to be published.
const TIPS: HomeTip[] = [
  {
    title: "Poco texto por página",
    text: "Frases cortas y pocas en cada página: se leen mejor siguiendo con la mirada.",
    Icon: IconText,
  },
  {
    title: "Cada imagen con su descripción",
    text: "Escribe su texto alternativo. IRIS lo pide para publicar la lección.",
    Icon: IconImage,
  },
  {
    title: "Preguntas con pocas opciones",
    text: "De 2 a 4 opciones claras, para que tus estudiantes elijan mirando la respuesta.",
    Icon: IconQuestion,
  },
  {
    title: "Comparte el código de la clase",
    text: "Las familias lo escriben para pedir el ingreso de su peque, y tú aceptas cada solicitud.",
    Icon: IconKey,
  },
];

/** "Inicio" of the Portal Docente: what's going on in the teacher's classes
 * at a glance. Four counts on top (classes, students, requests, lessons),
 * then the classes with their students, what needs the teacher, tips to
 * teach with IRIS and the latest notifications. Everything but the tips
 * is real data. */
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
        text="Enseñar también es acompañar: prepara tus clases, guía a tus estudiantes y mira cómo avanzan en IRIS."
      />

      <section className={styles.stats} aria-label="Resumen de tus clases">
        <Stat label="Clases" value={list.length} Icon={IconClassroom} loading={loading} />
        <Stat label="Estudiantes" value={students} Icon={IconChild} loading={loading} />
        <Stat label="Solicitudes" value={pending} Icon={IconClock} loading={loading} />
        <Stat label="Lecciones publicadas" value={published} Icon={IconBook} loading={loading} />
      </section>

      {/* Like the parents' Inicio, two rows of two panels: the classes next
          to what to keep in mind, the tips next to the notifications. The
          panels of a row take the same height, so their edges line up. */}
      <div className={styles.columns}>
        <Panel
          title="Tus clases"
          className={styles.classesArea}
          action={list.length > 0 ? { label: "Ver todas", onClick: onOpenClassrooms } : undefined}
        >
          {loading ? (
            <RowsSkeleton />
          ) : list.length === 0 ? (
            // The only "Nueva clase" of Inicio: once there are classes, new
            // ones are made from "Mis clases".
            <Empty
              Icon={IconClassroom}
              title="Todavía no tienes clases"
              text="Crea tu primera clase y comparte su código de ingreso con las familias de tus estudiantes."
            >
              <button type="button" className={styles.primaryButton} onClick={onCreateClassroom}>
                <IconPlus width={18} height={18} />
                Nueva clase
              </button>
            </Empty>
          ) : (
            <ul className={styles.itemList}>
              {list.slice(0, CLASSES_SHOWN).map((classroom) => (
                <ClassRow
                  key={classroom.id}
                  classroom={classroom}
                  onOpen={() => onOpenClassroom(classroom.id)}
                  onOpenMembers={() => onOpenClassroom(classroom.id, "miembros")}
                />
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Para tener en cuenta" className={`${styles.tasksArea} ${styles.tasksPanel}`}>
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
            <TaskList tasks={tasks.slice(0, TASKS_SHOWN)} />
          )}
        </Panel>

        <Panel
          title="Notificaciones recientes"
          className={styles.noticesArea}
          action={{ label: "Ver todas", onClick: onOpenNotifications }}
        >
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

        <Panel title="Para enseñar con IRIS" className={styles.tipsArea}>
          <TipList tips={TIPS} />
        </Panel>
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
): HomeTask[] {
  const requests: HomeTask[] = list
    .filter((c) => c.pending_requests > 0)
    .map((c) => ({
      key: `requests-${c.id}`,
      text: c.pending_requests === 1 ? "1 solicitud de ingreso" : `${c.pending_requests} solicitudes de ingreso`,
      hint: c.name,
      Icon: IconClock,
      onOpen: () => onOpenClassroom(c.id, "miembros"),
    }));
  const noUnits: HomeTask[] = list
    .filter((c) => !content.get(c.id)?.units)
    .map((c) => ({
      key: `units-${c.id}`,
      text: "Aún no tiene unidades",
      hint: c.name,
      Icon: IconLayers,
      onOpen: () => onOpenClassroom(c.id, "lecciones"),
    }));
  const withDrafts: HomeTask[] = list
    .filter((c) => (content.get(c.id)?.draft_lessons ?? 0) > 0)
    .map((c) => {
      const count = content.get(c.id)?.draft_lessons ?? 0;
      return {
        key: `drafts-${c.id}`,
        text: count === 1 ? "1 lección en borrador" : `${count} lecciones en borrador`,
        hint: c.name,
        Icon: IconBook,
        onOpen: () => onOpenClassroom(c.id, "lecciones"),
      };
    });
  return [...requests, ...noUnits, ...withDrafts];
}

// One class in one row, like a kid on the parents' Inicio: its avatar, name
// and who it's for (opens the class), and a button with its students and
// the requests waiting that opens "Miembros". Its units are in the class.
function ClassRow({
  classroom,
  onOpen,
  onOpenMembers,
}: {
  classroom: TeacherClassroom;
  onOpen: () => void;
  onOpenMembers: () => void;
}) {
  const audience = classroomAudience(classroom.area, classroom.grade, classroom.area_other);
  const students = classroom.student_count;
  const waiting = classroom.pending_requests;

  return (
    <li className={styles.item}>
      <button type="button" className={styles.itemHead} onClick={onOpen}>
        <ClassroomAvatar classroom={classroom} size={56} />
        <span className={styles.itemText}>
          <span className={styles.itemName}>{classroom.name}</span>
          {audience && <span className={styles.itemMeta}>{audience}</span>}
        </span>
        <span className={styles.itemLink}>
          Ver la clase
          <IconArrowRight width={15} height={15} />
        </span>
      </button>

      <button
        type="button"
        className={styles.itemButton}
        aria-label={`Estudiantes de ${classroom.name}: ${studentsLabel(students)}${
          waiting > 0 ? `, ${waitingLabel(waiting)}` : ""
        }`}
        onClick={onOpenMembers}
      >
        <span className={styles.itemButtonIcon} aria-hidden="true">
          <IconChild width={18} height={18} />
        </span>
        <span className={styles.itemButtonText}>
          <span className={styles.itemButtonCount}>{studentsLabel(students)}</span>
          {waiting > 0 ? (
            <span className={styles.itemButtonWaiting}>
              <IconClock width={13} height={13} aria-hidden="true" />
              {waitingLabel(waiting)}
            </span>
          ) : (
            students === 0 && <span className={styles.itemButtonNone}>Comparte su código</span>
          )}
        </span>
        <IconArrowRight width={16} height={16} className={styles.chevron} />
      </button>
    </li>
  );
}

function studentsLabel(count: number): string {
  if (count === 0) return "Sin estudiantes";
  return count === 1 ? "1 estudiante" : `${count} estudiantes`;
}

function waitingLabel(count: number): string {
  return count === 1 ? "1 en espera" : `${count} en espera`;
}
