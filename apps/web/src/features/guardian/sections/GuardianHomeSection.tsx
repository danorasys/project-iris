import type { ComponentType, SVGProps } from "react";
import { Navigate } from "react-router-dom";
import type { FamilyClassroom, NotificationItem, StudentProfile } from "@iris/shared-types";
import { ageLabel } from "@/features/utils/calculateAge";
import { formatArrival } from "@/features/utils/formatArrival";
import { useEstudiantesDeTutor, useMiPerfilTutor } from "@/shared/api/hooks/useAuthApi";
import { useFamilyClassrooms } from "@/shared/api/hooks/useClassroomsApi";
import { useBandejaNotificaciones } from "@/shared/api/hooks/useNotifications";
import {
  IconArrowRight,
  IconBell,
  IconBook,
  IconCheck,
  IconChild,
  IconClassroom,
  IconClock,
  IconEye,
  IconGraduationCap,
  IconSparkle,
} from "@/shared/ui/icons";
import { Empty, Panel, RowsSkeleton, Stat } from "@/shared/ui/portal/PortalHome";
import { WelcomeBanner } from "@/shared/ui/portal/WelcomeBanner";
import { StudentAvatarImage } from "@/shared/ui/StudentAvatarImage";
import { notificationSubject } from "../notifications/notificationText";
import { isPortalAccessRequired } from "../portalAccess";
import type { StudentOption } from "./MisPequesSection";
import home from "@/shared/ui/portal/PortalHome.module.css";
import styles from "./GuardianHomeSection.module.css";

interface GuardianHomeSectionProps {
  /** Opens the kid's space, or right on "Sus clases" with option "clases". */
  onOpenStudent: (studentId: string, option?: StudentOption) => void;
  onOpenStudents: () => void;
  onOpenNotifications: () => void;
  /** Opens that notification in Notificaciones, read in full. */
  onOpenNotification: (notification: NotificationItem) => void;
}

const NOTICES_SHOWN = 3;
// More kids than this and the rest are one click away, in Mis peques.
const KIDS_SHOWN = 3;
const TASKS_SHOWN = 4;

interface Task {
  key: string;
  text: string;
  hint: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  onOpen: () => void;
}

// What a family can do so a session with IRIS goes well: the same advice
// the kid's calibration screen gives, here so the guardian has it at hand.
const TIPS: { title: string; text: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  {
    title: "A la distancia de un brazo",
    text: "Que se siente cómodo, de frente al computador.",
    Icon: IconChild,
  },
  {
    title: "Buena iluminación",
    text: "Un lugar bien iluminado, con la luz de frente y no a su espalda, para que la cámara siga bien su mirada.",
    Icon: IconSparkle,
  },
  {
    title: "Solo su cara en la cámara",
    text: "Sin gafas de sol ni gorra, y sin nadie más dentro del encuadre.",
    Icon: IconEye,
  },
  {
    title: "Calibrar con paciencia",
    text: "Al empezar, IRIS aprende cómo mira tu peque. Toma un momento.",
    Icon: IconCheck,
  },
];

/** "Inicio" of the Portal de Padres: how the kids are doing in IRIS at a
 * glance. Four counts on top, then the kids with their classes, what's worth
 * a look, the latest notifications and tips for a session with the gaze.
 * Everything is real data. */
export function GuardianHomeSection({
  onOpenStudent,
  onOpenStudents,
  onOpenNotifications,
  onOpenNotification,
}: GuardianHomeSectionProps) {
  // Same query as Mi perfil and the menu, so it comes from the cache.
  const profile = useMiPerfilTutor().data;
  const students = useEstudiantesDeTutor(true);
  const family = useFamilyClassrooms();
  const tray = useBandejaNotificaciones(1, NOTICES_SHOWN);

  // Nothing typed to keep here, a closed portal just goes to the code screen.
  if (isPortalAccessRequired(family.error) || isPortalAccessRequired(tray.error)) {
    return <Navigate to="/guardian/verify-2fa" replace />;
  }
  if (students.isError) {
    return (
      <p role="alert" className={home.status}>
        No pudimos cargar tu inicio. Intenta recargar la página.
      </p>
    );
  }

  const kids = students.data ?? [];
  const classes = family.data ?? [];
  const accepted = classes.filter((c) => c.status === "aceptada");
  const pending = classes.filter((c) => c.status === "pendiente");
  const lessons = accepted.reduce((total, c) => total + (c.published_lessons ?? 0), 0);
  const loading = students.isLoading || family.isLoading;
  const unread = tray.data?.unread_count ?? 0;
  const tasks = buildTasks(kids, classes, unread, onOpenStudent, onOpenNotifications);

  return (
    <div className={home.home}>
      <WelcomeBanner
        name={profile?.first_name ?? "familia"}
        text="Así va el camino de tus peques en IRIS: sus clases, tus notificaciones y cómo acompañarlos."
      />

      <section className={home.stats} aria-label="Resumen de tus peques">
        <Stat label="Peques" value={kids.length} Icon={IconChild} loading={loading} />
        <Stat label="Clases" value={accepted.length} Icon={IconClassroom} loading={loading} />
        <Stat label="Solicitudes en espera" value={pending.length} Icon={IconClock} loading={loading} />
        <Stat label="Lecciones para aprender" value={lessons} Icon={IconBook} loading={loading} />
      </section>

      {/* Two rows of two panels: the kids next to what to look at, the tips
          next to the notifications. The panels of a row take the same height,
          so their edges line up. */}
      <div className={styles.layout}>
        <Panel
          className={styles.kidsArea}
          title="Tus peques"
          action={kids.length > 0 ? { label: "Ver todos", onClick: onOpenStudents } : undefined}
        >
          {loading ? (
            <RowsSkeleton />
          ) : kids.length === 0 ? (
            <Empty
              Icon={IconChild}
              title="Todavía no tienes peques registrados"
              text="Cuando registres a tu peque, aquí verás sus clases y cómo va."
            />
          ) : (
            <>
              <ul className={styles.kids}>
                {kids.slice(0, KIDS_SHOWN).map((kid) => (
                  <KidRow
                    key={kid.id}
                    kid={kid}
                    classes={classes.filter((c) => c.student_id === kid.id)}
                    classesFailed={family.isError}
                    onOpen={() => onOpenStudent(kid.id)}
                    onOpenClasses={() => onOpenStudent(kid.id, "clases")}
                  />
                ))}
              </ul>
              {kids.length > KIDS_SHOWN && (
                <button type="button" className={styles.moreKids} onClick={onOpenStudents}>
                  Ver todos los {kids.length} peques
                </button>
              )}
            </>
          )}
        </Panel>

        <Panel title="Para tener en cuenta" className={styles.tasksArea}>
          {loading ? (
            <RowsSkeleton rows={2} />
          ) : tasks.length === 0 ? (
            <Empty
              Icon={IconCheck}
              done
              title="Todo al día"
              text="No hay nada esperando por ti. Aquí verás lo que valga la pena revisar."
            />
          ) : (
            <ul className={home.tasks}>
              {tasks.slice(0, TASKS_SHOWN).map(({ key, text, hint, Icon, onOpen }) => (
                <li key={key}>
                  <button type="button" className={home.task} onClick={onOpen}>
                    {/* All in the IRIS blue, the bell too. */}
                    <span className={`${home.taskIcon} ${home.blue}`} aria-hidden="true">
                      <Icon width={18} height={18} />
                    </span>
                    <span className={home.taskText}>
                      <span className={home.taskTitle}>{text}</span>
                      <span className={home.taskHint}>{hint}</span>
                    </span>
                    <IconArrowRight width={16} height={16} className={home.chevron} />
                  </button>
                </li>
              ))}
            </ul>
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
            <ul className={home.notices}>
              {(tray.data?.items ?? []).map((notice) => (
                <li key={notice.id}>
                  <button type="button" className={home.notice} onClick={() => onOpenNotification(notice)}>
                    <span className={notice.read ? home.readDot : home.unreadDot} aria-hidden="true" />
                    <span className={home.noticeText}>
                      <span className={home.noticeTitle}>
                        {notificationSubject(notice)}
                        {notice.student_name && ` · ${notice.student_name}`}
                        {!notice.read && <span className={home.visuallyHidden}> (sin leer)</span>}
                      </span>
                      <span className={home.noticeTime}>{formatArrival(notice.created_at)}</span>
                    </span>
                    <IconArrowRight width={16} height={16} className={home.chevron} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* What makes IRIS different: kids learn with their gaze, so a good
            seat, good light and a calm calibration matter. */}
        <Panel title="Antes de cada sesión de tu peque con IRIS" className={styles.tipsArea}>
          <ul className={styles.tips}>
            {TIPS.map(({ title, text, Icon }) => (
              <li key={title} className={styles.tip}>
                <span className={styles.tipIcon} aria-hidden="true">
                  <Icon width={20} height={20} />
                </span>
                <span className={styles.tipText}>
                  <span className={styles.tipTitle}>{title}</span>
                  <span className={styles.tipHint}>{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

// What's worth a look, first what the guardian can read, then the requests
// waiting and the kids without a class yet.
function buildTasks(
  kids: StudentProfile[],
  classes: FamilyClassroom[],
  unread: number,
  onOpenStudent: GuardianHomeSectionProps["onOpenStudent"],
  onOpenNotifications: () => void,
): Task[] {
  const notices: Task[] =
    unread > 0
      ? [
          {
            key: "unread",
            text: unread === 1 ? "Tienes 1 notificación sin leer" : `Tienes ${unread} notificaciones sin leer`,
            hint: "Respuestas de los docentes",
            Icon: IconBell,
            onOpen: onOpenNotifications,
          },
        ]
      : [];
  const waiting: Task[] = classes
    .filter((c) => c.status === "pendiente")
    .map((c) => ({
      key: `pending-${c.enrollment_id}`,
      text: `${c.student_first_name} espera entrar a ${c.name}`,
      hint: "El docente aún no responde la solicitud",
      Icon: IconClock,
      onOpen: () => onOpenStudent(c.student_id, "clases"),
    }));
  // A rejected request doesn't count, the kid is still without a class.
  const withoutClass: Task[] = kids
    .filter((kid) => !classes.some((c) => c.student_id === kid.id && c.status !== "rechazada"))
    .map((kid) => ({
      key: `no-class-${kid.id}`,
      text: `${kid.first_name} aún no está en una clase`,
      hint: "Pide al docente el código y agrégala en Sus clases",
      Icon: IconGraduationCap,
      onOpen: () => onOpenStudent(kid.id, "clases"),
    }));
  return [...notices, ...waiting, ...withoutClass];
}

// One kid in one row: their avatar, name and age (opens their space), and
// a button with how many classes they're in that opens "Sus clases". The
// row stays the same size with 1 class or 10.
function KidRow({
  kid,
  classes,
  classesFailed,
  onOpen,
  onOpenClasses,
}: {
  kid: StudentProfile;
  classes: FamilyClassroom[];
  /** classroom-service didn't answer: say so instead of "no classes". */
  classesFailed: boolean;
  onOpen: () => void;
  onOpenClasses: () => void;
}) {
  const inClasses = classes.filter((c) => c.status === "aceptada").length;
  const waiting = classes.filter((c) => c.status === "pendiente").length;

  return (
    <li className={styles.kid}>
      <button type="button" className={styles.kidHead} onClick={onOpen}>
        <StudentAvatarImage avatarId={kid.avatar_id} size="small" label="" />
        <span className={styles.kidText}>
          <span className={styles.kidName}>{kid.first_name}</span>
          <span className={styles.kidMeta}>{ageLabel(kid.date_of_birth)}</span>
        </span>
        <span className={styles.kidLink}>
          Ver su espacio
          <IconArrowRight width={15} height={15} />
        </span>
      </button>

      {classesFailed ? (
        <span className={styles.classesUnavailable}>Clases no disponibles</span>
      ) : (
        <button
          type="button"
          className={styles.classesButton}
          aria-label={`Clases de ${kid.first_name}: ${classesLabel(inClasses)}${
            waiting > 0 ? `, ${waitingLabel(waiting)}` : ""
          }`}
          onClick={onOpenClasses}
        >
          <span className={styles.classesIcon} aria-hidden="true">
            <IconClassroom width={18} height={18} />
          </span>
          <span className={styles.classesText}>
            <span className={styles.classesCount}>{classesLabel(inClasses)}</span>
            {waiting > 0 ? (
              <span className={styles.classesWaiting}>
                <IconClock width={13} height={13} aria-hidden="true" />
                {waitingLabel(waiting)}
              </span>
            ) : (
              inClasses === 0 && <span className={styles.classesNone}>Cómo unirse a una</span>
            )}
          </span>
          <IconArrowRight width={16} height={16} className={home.chevron} />
        </button>
      )}
    </li>
  );
}

function classesLabel(count: number): string {
  if (count === 0) return "Sin clases aún";
  return count === 1 ? "1 clase" : `${count} clases`;
}

function waitingLabel(count: number): string {
  return count === 1 ? "1 en espera" : `${count} en espera`;
}
