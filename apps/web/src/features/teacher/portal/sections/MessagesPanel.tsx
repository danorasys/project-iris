import { useState } from "react";
import type { ClassroomWithStudents } from "@iris/shared-types";
import { useClassMessages, type TrayBox } from "@/shared/api/hooks/useNotifications";
import { IconMessage } from "@/shared/ui/icons";
import tray from "@/shared/ui/portal/NotificationTray.module.css";
import { SectionOverview } from "@/shared/ui/portal/SectionOverview";
import { MESSAGE_WORDS } from "@/shared/ui/portal/trayWords";
import { ViewEnter } from "@/shared/ui/ViewEnter";
import { MessageCompose } from "./MessageCompose";
import { TeacherInbox } from "./TeacherInbox";
import styles from "../portalSection.module.css";

const PAGE_SIZE = 8;

interface MessagesPanelProps {
  classroom: ClassroomWithStudents;
  onToast: (message: string) => void;
  /** Opens straight in a new message to this kid ("Escribir" in Miembros). */
  composeFor?: string | null;
}

// Writing a new message: to whom it starts addressed, if anyone.
type Compose = { enrollmentId: string | null };

/** "Mensajes" of a classroom (HU-77, HU-74): a card with how many there are
 * and "Escribir un mensaje", and the messages of this class in the same
 * inbox as Notificaciones, like Gmail: the ones the families wrote and the
 * ones the teacher sent, newest first, each one opened as a conversation to
 * answer. A new message is written in place, like a new mail. */
export function MessagesPanel({ classroom, onToast, composeFor = null }: MessagesPanelProps) {
  const [page, setPage] = useState(1);
  const [box, setBox] = useState<TrayBox>("received");
  const [compose, setCompose] = useState<Compose | null>(composeFor ? { enrollmentId: composeFor } : null);
  const messages = useClassMessages(classroom.id, page, PAGE_SIZE, box);
  const hasMembers = classroom.students.length > 0;
  const total = messages.data?.total ?? 0;
  const unread = messages.data?.unread_count ?? 0;

  // The new message comes in from the right and goes back to the left.
  return (
    <ViewEnter view={compose ? "compose" : "inbox"} level={compose ? 1 : 0}>
      {compose ? (
        <MessageCompose
          classroomId={classroom.id}
          members={classroom.students}
          enrollmentId={compose.enrollmentId}
          onClose={() => setCompose(null)}
          onSent={onToast}
        />
      ) : (
      <TeacherInbox
        tray={messages}
        page={page}
        onPageChange={setPage}
        pageSize={PAGE_SIZE}
        words={MESSAGE_WORDS}
        listLabel={box === "sent" ? "Mensajes enviados de la clase" : "Mensajes recibidos de la clase"}
        box={box}
        onBoxChange={(next) => {
          setBox(next);
          setPage(1);
        }}
        onToast={onToast}
        header={
          <SectionOverview
            titleId="messages-overview-title"
            Icon={IconMessage}
            title="Mensajes de la clase"
            text={
              <>
                {messages.data &&
                  (box === "sent" ? (
                    <>
                      Has enviado <strong>{total === 1 ? "1 mensaje" : `${total} mensajes`}</strong>.{" "}
                    </>
                  ) : (
                    <>
                      Tienes <strong>{total === 1 ? "1 mensaje recibido" : `${total} mensajes recibidos`}</strong>
                      {unread > 0 && (
                        <>
                          , <strong>{unread === 1 ? "1 sin leer" : `${unread} sin leer`}</strong>
                        </>
                      )}
                      .{" "}
                    </>
                  ))}
                Aquí ves lo que les escribes a tus estudiantes y a sus familias, y lo que las familias te escriben.
              </>
            }
            action={
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => setCompose({ enrollmentId: null })}
                disabled={!hasMembers}
                title={hasMembers ? undefined : "Cuando haya estudiantes en la clase podrás escribirles."}
              >
                <IconMessage width={16} height={16} />
                Escribir un mensaje
              </button>
            }
          />
        }
        empty={
          <div className={tray.empty}>
            <span className={tray.emptyIcon} aria-hidden="true">
              <IconMessage width={22} height={22} />
            </span>
            <p className={tray.emptyTitle}>Aún no tienes mensajes recibidos</p>
            <p className={tray.emptyText}>
              {hasMembers
                ? "Cuando una familia te escriba desde esta clase, su mensaje aparecerá aquí."
                : "Cuando haya estudiantes en la clase podrás escribirles a ellos y a sus familias."}
            </p>
          </div>
        }
      />
      )}
    </ViewEnter>
  );
}
