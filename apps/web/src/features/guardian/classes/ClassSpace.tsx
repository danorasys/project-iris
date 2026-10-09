import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import type { FamilyClassroomDetail, NotificationItem } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { classroomAudience } from "@/features/teacher/classrooms/classroomDetails";
import { ClassroomAvatar } from "@/features/teacher/classrooms/ClassroomAvatar";
import { ClassroomBanner } from "@/features/teacher/classrooms/ClassroomBanner";
import { TeacherProfileSummary } from "@/features/teacher/profile/TeacherProfileSummary";
import { formatShortArrival } from "@/features/utils/formatArrival";
import { useFamilyClassroom, useLeaveClassroom, useSendTeacherMessage } from "@/shared/api/hooks/useClassroomsApi";
import { useClassNotifications, useMarkNotificationRead } from "@/shared/api/hooks/useNotifications";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { CountedTextField } from "@/shared/ui/CountedTextField";
import { IconArrowRight, IconBell, IconBook, IconChart, IconMessage, IconTeacher } from "@/shared/ui/icons";
import { TrayPager } from "@/shared/ui/portal/TrayPager";
import form from "@/shared/ui/profile/ProfileForm.module.css";
import { notificationMessage, notificationSubject } from "../notifications/notificationText";
import { isPortalAccessRequired, useWithPortalAccess } from "../portalAccess";
import { ClassProgress } from "./ClassProgress";
import kid from "../sections/MisPequesSection.module.css";
import { contentLabel } from "./lessonsLabel";
import styles from "./ClassSpace.module.css";

export type ClassOption = "notificaciones" | "progreso" | "contacto" | "docente";

interface ClassSpaceProps {
  enrollmentId: string;
  firstName: string;
  option: ClassOption | null;
  onOption: (option: ClassOption | null) => void;
  /** The kid left the class, with its name for the toast. */
  onLeft: (classroomName: string) => void;
  onToast: (message: string) => void;
}

// Same limits classroom-service checks (TeacherMessageRequest).
const SUBJECT_MAX = 120;
const BODY_MAX = 2000;
const NOTICES_PER_PAGE = 8;

/** HU-42: the space of a class the kid is in. On top the class and its
 * teacher; under it the options (its notifications, the kid's progress,
 * writing to the teacher, the teacher's profile) and, apart, taking the kid
 * out (HU-49). */
export function ClassSpace({ enrollmentId, firstName, option, onOption, onLeft, onToast }: ClassSpaceProps) {
  const detail = useFamilyClassroom(enrollmentId);
  const c = detail.data;
  // Only the count, for the number on "Notificaciones".
  const unread = useClassNotifications(c?.classroom_id, c?.student_id, 1, 1).data?.unread_count ?? 0;

  if (isPortalAccessRequired(detail.error)) return <Navigate to="/guardian/verify-2fa" replace />;
  if (detail.isLoading) return <p className={styles.status}>Cargando la clase…</p>;
  if (!c) {
    return (
      <p role="alert" className={`${styles.status} ${styles.error}`}>
        {detail.error ? getAuthErrorMessage(detail.error) : "Esta clase ya no está disponible."}
      </p>
    );
  }

  const teacherName = c.teacher ? `${c.teacher.first_name} ${c.teacher.last_name}` : c.teacher_name;

  return (
    <>
      <ClassHeader classroom={c} teacherName={teacherName} />

      {option === null && (
        <ClassOptions
          classroom={c}
          firstName={firstName}
          teacherName={teacherName}
          unread={unread}
          onOption={onOption}
          onLeft={onLeft}
        />
      )}
      {option === "notificaciones" && <ClassNotifications classroomId={c.classroom_id} studentId={c.student_id} />}
      {option === "progreso" && <ClassProgress enrollmentId={enrollmentId} firstName={firstName} />}
      {option === "contacto" && (
        <ContactTeacher
          enrollmentId={enrollmentId}
          teacherName={teacherName}
          onSent={() => {
            onOption(null);
            onToast(`Le enviamos tu mensaje a ${teacherName ?? "el docente"}.`);
          }}
        />
      )}
      {option === "docente" &&
        (c.teacher ? (
          <TeacherProfileSummary
            profile={c.teacher}
            institution={c.teacher.institution}
            title={`Perfil de ${teacherName}`}
            note="Esta información la escribió el docente en su perfil."
          />
        ) : (
          <p className={styles.status}>No pudimos cargar el perfil del docente. Intenta de nuevo en un momento.</p>
        ))}
    </>
  );
}

// The class on a white card: the band of its color with the avatar hanging
// from it, and beside it the name, what it's about, who teaches it and its lessons.
function ClassHeader({ classroom: c, teacherName }: { classroom: FamilyClassroomDetail; teacherName: string | null }) {
  const audience = classroomAudience(c.area, c.grade, c.area_other);
  return (
    <section className={styles.header} aria-label={`La clase ${c.name}`}>
      <ClassroomBanner color={c.color} height={100} />
      <div className={styles.headerRow}>
        <span className={styles.headerAvatar}>
          <ClassroomAvatar
            classroom={{ id: c.classroom_id, name: c.name, color: c.color, logo_file: c.logo_file }}
            size={80}
          />
        </span>
        <div className={styles.headerText}>
          <p className={styles.eyebrow}>Clase</p>
          <h2 className={styles.name}>{c.name}</h2>
          <p className={styles.meta}>{[audience, teacherName && `con ${teacherName}`].filter(Boolean).join(" · ")}</p>
          {c.published_lessons !== null && (
            <span className={styles.lessons}>
              <IconBook width={14} height={14} aria-hidden="true" />
              {contentLabel(c.published_units, c.published_lessons)}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

interface ClassOptionsProps {
  classroom: FamilyClassroomDetail;
  firstName: string;
  teacherName: string | null;
  unread: number;
  onOption: (option: ClassOption) => void;
  onLeft: (classroomName: string) => void;
}

function ClassOptions({ classroom: c, firstName, teacherName, unread, onOption, onLeft }: ClassOptionsProps) {
  const withPortalAccess = useWithPortalAccess();
  const leave = useLeaveClassroom();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allOptions = [
    {
      id: "notificaciones" as const,
      title: "Notificaciones",
      hint: "Los avisos de esta clase sobre tu peque.",
      Icon: IconBell,
      badge: unread,
    },
    {
      id: "progreso" as const,
      title: "Progreso",
      hint: `Cómo avanza ${firstName} en cada lección y sus intentos.`,
      Icon: IconChart,
      badge: 0,
    },
    {
      id: "contacto" as const,
      title: "Contactar al docente",
      hint: `Escríbele un mensaje a ${teacherName ?? "el docente"}.`,
      Icon: IconMessage,
      badge: 0,
    },
    {
      id: "docente" as const,
      title: "Perfil del docente",
      hint: "Su presentación, sus estudios y su experiencia.",
      Icon: IconTeacher,
      badge: 0,
    },
  ];
  // Once the teacher left IRIS (HU-92) there's nobody to write to or to see.
  const hasTeacher = c.has_teacher !== false;
  const options = hasTeacher ? allOptions : allOptions.filter((o) => o.id !== "contacto" && o.id !== "docente");

  async function withdraw() {
    setConfirming(false);
    setError(null);
    try {
      await withPortalAccess(() => leave.mutateAsync(c.enrollment_id));
      onLeft(c.name);
    } catch (err) {
      setError(getAuthErrorMessage(err));
    }
  }

  return (
    <>
      {/* Same rows as the options of a kid's space. */}
      <nav className={kid.optionsPanel} aria-labelledby="class-options-title">
        <h3 id="class-options-title" className={kid.optionsTitle}>
          Opciones de la clase
        </h3>
        {!hasTeacher && (
          <p className={styles.status}>
            Esta clase ya no tiene un docente a cargo. {firstName} puede seguir viendo sus lecciones y su progreso.
          </p>
        )}
        <ul className={kid.optionList}>
          {options.map(({ id, title, hint, Icon, badge }) => (
            <li key={id}>
              <button
                type="button"
                className={kid.optionRow}
                aria-label={`${title}${badge > 0 ? `, ${badge} sin leer` : ""}. ${hint}`}
                onClick={() => onOption(id)}
              >
                <span className={kid.optionIcon} aria-hidden="true">
                  <Icon width={20} height={20} />
                </span>
                <span className={kid.optionText}>
                  <span className={kid.optionTitle}>{title}</span>
                  <span className={kid.optionHint}>{hint}</span>
                </span>
                {badge > 0 && (
                  <span className={styles.badge} aria-hidden="true">
                    {badge}
                  </span>
                )}
                <IconArrowRight width={18} height={18} className={kid.optionArrow} />
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Taking the kid out goes apart from the options, it can't be undone. */}
      <section className={styles.leave} aria-labelledby="class-leave-title">
        <div>
          <h3 id="class-leave-title" className={styles.leaveTitle}>
            Retirar a {firstName} de la clase
          </h3>
          <p className={styles.leaveText}>
            Dejará de ver sus lecciones y el docente recibirá un aviso. Si cambias de idea, puedes volver a pedir el
            ingreso con el código.
          </p>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
        </div>
        <button
          type="button"
          className={styles.leaveButton}
          onClick={() => setConfirming(true)}
          disabled={leave.isPending}
        >
          {leave.isPending ? "Retirando…" : "Retirar de la clase"}
        </button>
      </section>

      {confirming && (
        <ConfirmDialog
          title="Retirar de la clase"
          message={`¿Seguro que quieres retirar a ${firstName} de "${c.name}"? Le avisaremos al docente.`}
          acceptLabel="Retirar"
          cancelLabel="Cancelar"
          danger
          onAccept={() => void withdraw()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}

// HU-42: the notifications of this class about this kid, newest first. One
// opens right there and counts as read.
function ClassNotifications({ classroomId, studentId }: { classroomId: string; studentId: string }) {
  const withPortalAccess = useWithPortalAccess();
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const tray = useClassNotifications(classroomId, studentId, page, NOTICES_PER_PAGE);
  const markRead = useMarkNotificationRead("guardian");

  if (isPortalAccessRequired(tray.error)) return <Navigate to="/guardian/verify-2fa" replace />;
  if (tray.isLoading) return <p className={styles.status}>Cargando las notificaciones…</p>;
  if (tray.isError || !tray.data) {
    return (
      <p role="alert" className={`${styles.status} ${styles.error}`}>
        No pudimos cargar las notificaciones de esta clase. Intenta de nuevo en un momento.
      </p>
    );
  }

  const items = tray.data.items;
  const totalPages = Math.max(1, Math.ceil(tray.data.total / NOTICES_PER_PAGE));

  function toggle(n: NotificationItem) {
    setOpenId((current) => (current === n.id ? null : n.id));
    // Reading it is what marks it; if that fails it just stays unread.
    if (!n.read) void withPortalAccess(() => markRead.mutateAsync(n.id)).catch(() => undefined);
  }

  return (
    <section className={styles.panel} aria-labelledby="class-notices-title">
      <h3 id="class-notices-title" className={kid.optionsTitle}>
        Notificaciones de la clase
      </h3>
      {items.length === 0 ? (
        <p className={styles.empty}>Esta clase todavía no te ha enviado notificaciones.</p>
      ) : (
        <ul className={styles.notices}>
          {items.map((n) => {
            const open = openId === n.id;
            return (
              <li key={n.id} className={n.read ? styles.notice : `${styles.notice} ${styles.unread}`}>
                <button
                  type="button"
                  className={styles.noticeHead}
                  aria-expanded={open}
                  aria-controls={`notice-${n.id}`}
                  onClick={() => toggle(n)}
                >
                  <span className={styles.dot} aria-hidden="true" />
                  <span className={styles.noticeSubject}>
                    {!n.read && <span className={styles.visuallyHidden}>Sin leer: </span>}
                    {notificationSubject(n)}
                  </span>
                  <time className={styles.noticeDate} dateTime={n.created_at}>
                    {formatShortArrival(n.created_at)}
                  </time>
                </button>
                {open && (
                  <p id={`notice-${n.id}`} className={styles.noticeBody}>
                    {notificationMessage(n)}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <TrayPager page={page} totalPages={totalPages} onChange={setPage} />
    </section>
  );
}

// HU-48: a message to the teacher, with a subject and the text. It reaches
// their tray as a notification.
function ContactTeacher({
  enrollmentId,
  teacherName,
  onSent,
}: {
  enrollmentId: string;
  teacherName: string | null;
  onSent: () => void;
}) {
  const withPortalAccess = useWithPortalAccess();
  const send = useSendTeacherMessage();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subjectError = !subject.trim() ? "Escribe el asunto del mensaje." : undefined;
  const bodyError = !body.trim()
    ? "Escribe tu mensaje."
    : body.trim().length > BODY_MAX
      ? `El mensaje puede tener hasta ${BODY_MAX} caracteres.`
      : undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (subjectError || bodyError || send.isPending) return;
    setError(null);
    try {
      await withPortalAccess(() => send.mutateAsync({ enrollmentId, subject: subject.trim(), body: body.trim() }));
      onSent();
    } catch (err) {
      setError(getAuthErrorMessage(err));
    }
  }

  return (
    <form className={styles.panel} onSubmit={submit} noValidate aria-labelledby="class-contact-title">
      <h3 id="class-contact-title" className={kid.optionsTitle}>
        Mensaje para {teacherName ?? "el docente"}
      </h3>
      <p className={styles.formIntro}>
        Le llegará a su bandeja de notificaciones en IRIS, con tu nombre y el de tu peque.
      </p>
      <CountedTextField
        id="class-contact-subject"
        label="Asunto"
        value={subject}
        onChange={setSubject}
        max={SUBJECT_MAX}
        error={tried ? subjectError : undefined}
        required
      />
      <CountedTextField
        id="class-contact-body"
        label="Mensaje"
        value={body}
        onChange={setBody}
        max={BODY_MAX}
        multiline
        rows={6}
        error={tried ? bodyError : undefined}
        required
      />
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.formActions}>
        <button type="submit" className={form.primaryButton} disabled={send.isPending}>
          {send.isPending ? "Enviando…" : "Enviar mensaje"}
        </button>
      </div>
    </form>
  );
}
