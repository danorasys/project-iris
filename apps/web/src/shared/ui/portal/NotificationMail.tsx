import { useId, type ReactNode } from "react";
import { formatArrival } from "@/features/utils/formatArrival";
import { IconArrowLeft, IconArrowRight, IconChild, IconClassroom, IconTrash } from "@/shared/ui/icons";
import styles from "./NotificationTray.module.css";

/** Where this one is in the tray, to go to the one before or after. A
 * missing onPrev / onNext means there's none on that side. */
export interface MailPosition {
  current: number;
  total: number;
  onPrev?: () => void;
  onNext?: () => void;
}

interface NotificationMailProps {
  subject: string;
  sender: string;
  /** "Peque" in the parents' portal, "Estudiante" in the teacher's. */
  kidLabel: string;
  kidName: string;
  classroomName: string;
  createdAt: string;
  message: string;
  onBack: () => void;
  onDelete: () => void;
  position?: MailPosition | null;
  /** Something to do with it, under the message (a request to answer). */
  children?: ReactNode;
}

// "Laura Gómez" -> "LG", "Sofía" -> "S".
function senderInitials(sender: string): string {
  return sender
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

/** One notification read in full, laid out like an opened mail: a bar with
 * "back" and "delete", the subject with the kid and the class under it,
 * who it's from with their initials and when, and the message as the body.
 * Same in both portals. */
export function NotificationMail({
  subject,
  sender,
  kidLabel,
  kidName,
  classroomName,
  createdAt,
  message,
  onBack,
  onDelete,
  position,
  children,
}: NotificationMailProps) {
  const subjectId = useId();

  return (
    <article className={styles.mail} aria-labelledby={subjectId}>
      <div className={styles.mailBar}>
        <button type="button" className={styles.mailBack} onClick={onBack}>
          <IconArrowLeft width={18} height={18} />
          Regresar a notificaciones
        </button>
        <div className={styles.mailTools}>
          {position && (
            <>
              <span className={styles.mailCount} aria-live="polite">
                {position.current} de {position.total}
              </span>
              <button
                type="button"
                className={styles.mailStep}
                onClick={position.onPrev}
                disabled={!position.onPrev}
                aria-label="Notificación anterior"
                title="Anterior"
              >
                <IconArrowLeft width={18} height={18} />
              </button>
              <button
                type="button"
                className={styles.mailStep}
                onClick={position.onNext}
                disabled={!position.onNext}
                aria-label="Notificación siguiente"
                title="Siguiente"
              >
                <IconArrowRight width={18} height={18} />
              </button>
              <span className={styles.mailDivider} aria-hidden="true" />
            </>
          )}
          <button type="button" className={styles.mailDelete} onClick={onDelete} aria-label="Eliminar notificación">
            <IconTrash width={18} height={18} />
            <span className={styles.mailDeleteText}>Eliminar</span>
          </button>
        </div>
      </div>

      <div className={styles.mailContent}>
        <h1 id={subjectId} className={styles.mailSubject}>
          {subject}
        </h1>
        <dl className={styles.mailFacts} aria-label="Sobre esta notificación">
          <div className={styles.mailFact}>
            <dt>
              <IconChild width={16} height={16} aria-hidden="true" />
              {kidLabel}
            </dt>
            <dd>{kidName}</dd>
          </div>
          <div className={styles.mailFact}>
            <dt>
              <IconClassroom width={16} height={16} aria-hidden="true" />
              Clase
            </dt>
            <dd>{classroomName}</dd>
          </div>
        </dl>

        <div className={styles.mailFrom}>
          <span className={styles.mailAvatar} aria-hidden="true">
            {senderInitials(sender)}
          </span>
          <span className={styles.mailFromText}>
            <span className={styles.mailSender}>
              <span className={styles.visuallyHidden}>De parte de </span>
              {sender}
            </span>
            <span className={styles.mailTo}>para ti</span>
          </span>
          <time className={styles.mailDate} dateTime={createdAt}>
            {formatArrival(createdAt)}
          </time>
        </div>

        <p className={styles.mailMessage}>{message}</p>

        {children}
      </div>
    </article>
  );
}
