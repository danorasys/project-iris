import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import type { FamilyClassroomDetail } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { classroomAudience } from "@/features/teacher/classrooms/classroomDetails";
import { ClassroomAvatar } from "@/features/teacher/classrooms/ClassroomAvatar";
import { ClassroomBanner } from "@/features/teacher/classrooms/ClassroomBanner";
import { TeacherProfileSummary } from "@/features/teacher/profile/TeacherProfileSummary";
import { formatDay } from "@/features/utils/formatArrival";
import {
  classroomKeys,
  useFamilyClassroom,
  useLeaveClassroom,
  useSendTeacherMessage,
} from "@/shared/api/hooks/useClassroomsApi";
import { ApiError } from "@/shared/api/httpClient";
import { useClassNotifications } from "@/shared/api/hooks/useNotifications";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { CountedTextField } from "@/shared/ui/CountedTextField";
import {
  IconArchive,
  IconArrowRight,
  IconBell,
  IconBook,
  IconChart,
  IconLayers,
  IconMessage,
  IconTeacher,
} from "@/shared/ui/icons";
import { MESSAGE_BODY_MAX, MESSAGE_BODY_TOO_LONG, MESSAGE_SUBJECT_MAX } from "@/shared/ui/portal/messageThreadRules";
import form from "@/shared/ui/profile/ProfileForm.module.css";
import { isPortalAccessRequired, useWithPortalAccess } from "../portalAccess";
import { NotificacionesSection } from "../sections/NotificacionesSection";
import { ClassProgress } from "./ClassProgress";
import { ClassStructure } from "./ClassStructure";
import kid from "../sections/MisPequesSection.module.css";
import { contentLabel } from "./lessonsLabel";
import styles from "./ClassSpace.module.css";

export type ClassOption = "notificaciones" | "estructura" | "progreso" | "contacto" | "docente";

interface ClassSpaceProps {
  enrollmentId: string;
  firstName: string;
  option: ClassOption | null;
  onOption: (option: ClassOption | null) => void;
  /** The kid left the class, with its name for the toast. */
  onLeft: (classroomName: string) => void;
  onToast: (message: string) => void;
}

/** HU-42: the space of a class the kid is in. On top the class and its
 * teacher; under it the options (its notifications, how it's organized, the
 * kid's progress, writing to the teacher, the teacher's profile) and, apart,
 * taking the kid out (HU-49). */
export function ClassSpace({ enrollmentId, firstName, option, onOption, onLeft, onToast }: ClassSpaceProps) {
  const detail = useFamilyClassroom(enrollmentId);
  const c = detail.data;
  // Only the count, for the number on "Notificaciones".
  const unread = useClassNotifications(c?.classroom_id, c?.student_id, 1, 1).data?.unread_count ?? 0;
  const queryClient = useQueryClient();
  // The class was deleted (or the kid taken out) while the list was open.
  const gone = detail.error instanceof ApiError && detail.error.code === "inscripcion_no_encontrada";

  // The list asks again, so its row goes away too.
  useEffect(() => {
    if (gone) void queryClient.invalidateQueries({ queryKey: classroomKeys.family });
  }, [gone, queryClient]);

  if (isPortalAccessRequired(detail.error)) return <Navigate to="/guardian/verify-2fa" replace />;
  if (detail.isLoading) return <p className={styles.status}>Cargando la clase…</p>;
  if (!c) {
    return (
      <p role="alert" className={`${styles.status} ${styles.error}`}>
        {gone
          ? `Esta clase ya no existe: puede que el docente la haya eliminado o que ${firstName} ya no esté en ella. Regresa a sus clases para ver las que siguen.`
          : detail.error
            ? getAuthErrorMessage(detail.error)
            : "Esta clase ya no está disponible."}
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
      {/* HU-42: the same tray as Notificaciones, with only this class and kid. */}
      {option === "notificaciones" && (
        <NotificacionesSection
          ofClass={{
            classroomId: c.classroom_id,
            studentId: c.student_id,
            heading: <h3 className={kid.optionsTitle}>Notificaciones de la clase</h3>,
          }}
        />
      )}
      {option === "estructura" && <ClassStructure enrollmentId={enrollmentId} firstName={firstName} />}
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
            card
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
      <ClassroomBanner color={c.color} height={100} className={c.archived_at ? styles.faded : undefined} />
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
          {c.archived_at && (
            <span className={styles.archived}>
              <IconArchive width={14} height={14} aria-hidden="true" />
              Archivada
            </span>
          )}
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
      hint: "Las novedades de esta clase sobre tu peque.",
      Icon: IconBell,
      badge: unread,
    },
    {
      id: "estructura" as const,
      title: "Estructura de la clase",
      hint: `Sus unidades y lecciones, y lo que ${firstName} aprende en cada una.`,
      Icon: IconLayers,
      badge: 0,
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
  // Once the teacher left IRIS (HU-92) there's nobody to write to or to see,
  // and an archived class (HU-105) takes no messages.
  const hasTeacher = c.has_teacher !== false;
  const archived = Boolean(c.archived_at);
  const options = allOptions.filter((o) => {
    if (o.id === "contacto") return hasTeacher && !archived;
    if (o.id === "docente") return hasTeacher;
    return true;
  });

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
        {archived && c.archived_at && (
          <p className={styles.archivedNote}>
            {teacherName ?? "El docente"} archivó esta clase el {formatDay(c.archived_at)}. {firstName} ya no la ve en
            su espacio, pero aquí puedes seguir consultando su progreso y sus avisos.
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
            {archived
              ? "La quitaremos de sus clases junto con su progreso en ella. Mientras siga archivada no podrás volver a pedir el ingreso."
              : "Dejará de ver sus lecciones y el docente recibirá un aviso. Si cambias de idea, puedes volver a pedir el ingreso con el código."}
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
    : body.trim().length > MESSAGE_BODY_MAX
      ? MESSAGE_BODY_TOO_LONG
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
        max={MESSAGE_SUBJECT_MAX}
        error={tried ? subjectError : undefined}
        required
      />
      <CountedTextField
        id="class-contact-body"
        label="Mensaje"
        value={body}
        onChange={setBody}
        max={MESSAGE_BODY_MAX}
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
