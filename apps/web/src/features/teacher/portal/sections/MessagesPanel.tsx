import { useState } from "react";
import type { ClassroomWithStudents, NotificationItem } from "@iris/shared-types";
import { formatArrival } from "@/features/utils/formatArrival";
import { useClassMessages, useMarkNotificationRead } from "@/shared/api/hooks/useNotifications";
import { IconMessage } from "@/shared/ui/icons";
import { TrayPager } from "@/shared/ui/portal/TrayPager";
import { FamilyMessageDialog } from "./FamilyMessageDialog";
import styles from "../portalSection.module.css";
import own from "./MessagesPanel.module.css";

const PAGE_SIZE = 8;

interface MessagesPanelProps {
  classroom: ClassroomWithStudents;
  onToast: (message: string) => void;
}

type Message = Extract<NotificationItem, { event: "message.sent" | "teacher.message" }>;

/** Who wrote it or who it went to, in one line. */
function messageLine(message: Message): string {
  const kid = message.student_name ?? "un estudiante";
  if (message.event === "message.sent") return `De ${message.sender_name ?? "su familia"}, familia de ${kid}`;
  return message.addressee === "student" ? `Para ${kid}` : `Para la familia de ${kid}`;
}

/** "Mensajes" of a classroom (HU-77, HU-74): write to a kid or their
 * guardian, and the messages of this class, the ones the families wrote
 * and the ones the teacher sent, newest first. */
export function MessagesPanel({ classroom, onToast }: MessagesPanelProps) {
  const [page, setPage] = useState(1);
  const [writing, setWriting] = useState(false);
  const messages = useClassMessages(classroom.id, page, PAGE_SIZE);
  const markRead = useMarkNotificationRead("teacher");
  const items = (messages.data?.items ?? []) as Message[];
  const totalPages = Math.max(1, Math.ceil((messages.data?.total ?? 0) / PAGE_SIZE));
  const hasMembers = classroom.students.length > 0;

  return (
    <section aria-labelledby="class-messages-title" className={styles.section}>
      <div className={own.top}>
        <h2 id="class-messages-title" className={styles.subTitle}>
          Mensajes de la clase
        </h2>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => setWriting(true)}
          disabled={!hasMembers}
          title={hasMembers ? undefined : "Cuando haya estudiantes en la clase podrás escribirles."}
        >
          <IconMessage width={16} height={16} />
          Escribir un mensaje
        </button>
      </div>

      {messages.isLoading ? (
        <p className={styles.status}>Cargando los mensajes…</p>
      ) : messages.isError ? (
        <p role="alert" className={`${styles.status} ${styles.error}`}>
          No pudimos cargar los mensajes. Inténtalo de nuevo en un momento.
        </p>
      ) : items.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden="true">
            <IconMessage width={24} height={24} />
          </span>
          <p className={styles.emptyTitle}>Aún no hay mensajes en esta clase</p>
          <p className={styles.emptyText}>
            {hasMembers
              ? "Escríbele a un estudiante o a su familia. Aquí verás lo que envíes y lo que te escriban."
              : "Cuando haya estudiantes en la clase podrás escribirles a ellos y a sus familias."}
          </p>
        </div>
      ) : (
        <ul className={own.messages}>
          {items.map((message) => (
            <li key={message.id}>
              {/* Closed it shows the subject, who and when; open, the text. */}
              <details
                className={own.message}
                data-unread={!message.read}
                onToggle={(event) => {
                  if (event.currentTarget.open && !message.read) markRead.mutate(message.id);
                }}
              >
                <summary className={own.summary}>
                  <span className={own.direction} data-sent={message.event === "teacher.message"}>
                    {message.event === "teacher.message" ? "Enviado" : "Recibido"}
                  </span>
                  <span className={own.subject}>{message.subject ?? "Sin asunto"}</span>
                  <span className={own.meta}>
                    {messageLine(message)} · {formatArrival(message.created_at)}
                  </span>
                </summary>
                <p className={own.body}>{message.body}</p>
              </details>
            </li>
          ))}
        </ul>
      )}
      <TrayPager page={page} totalPages={totalPages} onChange={setPage} label="Páginas de mensajes" />

      {writing && (
        <FamilyMessageDialog
          classroomId={classroom.id}
          members={classroom.students}
          onClose={() => setWriting(false)}
          onSent={onToast}
        />
      )}
    </section>
  );
}
