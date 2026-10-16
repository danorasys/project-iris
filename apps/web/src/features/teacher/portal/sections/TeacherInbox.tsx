import { useEffect, useRef, useState, type ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { MessageRecipient, NotificationItem, NotificationPage } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { fullName } from "@/features/utils/fullName";
import { formatArrival, formatShortArrival } from "@/features/utils/formatArrival";
import { isAutomatic, notificationContext } from "@/features/utils/notificationKinds";
import { useClassroomRequests, useResolveRequest, useSendFamilyMessage } from "@/shared/api/hooks/useClassroomsApi";
import {
  useDeleteNotification,
  useDeleteNotifications,
  useMarkNotificationRead,
  type TrayBox,
} from "@/shared/api/hooks/useNotifications";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { IconSend, IconTrash } from "@/shared/ui/icons";
import { MessageThread } from "@/shared/ui/portal/MessageThread";
import { threadSubject } from "@/shared/ui/portal/messageThreadRules";
import styles from "@/shared/ui/portal/NotificationTray.module.css";
import { NotificationMail, type MailPosition } from "@/shared/ui/portal/NotificationMail";
import { TrayPager } from "@/shared/ui/portal/TrayPager";
import { TrayToolbar } from "@/shared/ui/portal/TraySelection";
import type { TrayWords } from "@/shared/ui/portal/trayWords";
import { useTraySelection } from "@/shared/ui/portal/useTraySelection";
import { StudentAvatarImage } from "@/shared/ui/StudentAvatarImage";
import { ViewEnter } from "@/shared/ui/ViewEnter";
import {
  notificationMessage,
  notificationSubject,
  senderOf,
  studentOf,
} from "../../notifications/teacherNotificationText";
import own from "./TeacherInbox.module.css";

interface TeacherInboxProps {
  /** One page of what's listed, newest first. Whoever shows the inbox asks
   * for it, so the same inbox lists every notification or only the
   * messages of a class. */
  tray: UseQueryResult<NotificationPage>;
  page: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  words: TrayWords;
  listLabel: string;
  /** "Recibidos" or "Enviados": which box is listed, and moving to the
   * other one (back to its first page). */
  box: TrayBox;
  onBoxChange: (box: TrayBox) => void;
  /** On top of the list (a banner, a card), hidden while one is open. */
  header?: ReactNode;
  /** When "Recibidos" has nothing yet. */
  empty: ReactNode;
  onToast: (message: string) => void;
  /** Opened right away, like when it's clicked in Inicio. */
  initialNotification?: NotificationItem | null;
}

/** The teacher's inbox, like Gmail (HU-69): a row per notification with its
 * sender, subject, a piece of its text and when, boxes to delete several,
 * and each one opened as a mail with its arrows to the one before or after.
 * A message is read and answered as a conversation (HU-51) and a pending
 * join request can be answered from inside it (HU-70). */
export function TeacherInbox({
  tray,
  page,
  onPageChange,
  pageSize,
  words,
  listLabel,
  box,
  onBoxChange,
  header,
  empty,
  onToast,
  initialNotification = null,
}: TeacherInboxProps) {
  const [opened, setOpened] = useState<NotificationItem | null>(initialNotification);
  const [toDelete, setToDelete] = useState<NotificationItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const markRead = useMarkNotificationRead("teacher");
  const remove = useDeleteNotification("teacher");
  const removeMany = useDeleteNotifications("teacher");
  const [confirmingMany, setConfirmingMany] = useState(false);

  const items = tray.data?.items ?? [];
  const selection = useTraySelection(items.map((n) => n.id));
  const totalPages = Math.max(1, Math.ceil((tray.data?.total ?? 0) / pageSize));
  const The = words.the === "la" ? "La" : "El";

  // Whatever is open and still unread gets marked as read, once: opened
  // from the list, from Inicio or with the arrows. A failure here isn't worth
  // bothering anyone, it just stays unread.
  const markedIds = useRef(new Set<string>());
  useEffect(() => {
    if (!opened || opened.read || markedIds.current.has(opened.id)) return;
    markedIds.current.add(opened.id);
    void markRead.mutateAsync(opened.id).catch(() => undefined);
  }, [opened, markRead]);

  function open(notification: NotificationItem) {
    setActionError(null);
    setOpened(notification);
  }

  // Going to the one before or after. Past the edge of the page, the tray
  // moves to the next page and opens its first one (or the last one of the
  // page before) once that page has arrived.
  const [pendingEdge, setPendingEdge] = useState<"first" | "last" | null>(null);
  if (pendingEdge && !tray.isPlaceholderData && items.length > 0) {
    setPendingEdge(null);
    open(pendingEdge === "first" ? items[0] : items[items.length - 1]);
  }

  const openedIndex = opened ? items.findIndex((n) => n.id === opened.id) : -1;
  // All of them, every page, not only the ones on this page.
  const total = tray.data?.total ?? 0;
  const position: MailPosition | null =
    openedIndex >= 0
      ? {
          current: (page - 1) * pageSize + openedIndex + 1,
          total,
          onPrev: openedIndex > 0 || page > 1 ? () => step(-1) : undefined,
          onNext: openedIndex < items.length - 1 || page < totalPages ? () => step(1) : undefined,
        }
      : null;

  function step(direction: 1 | -1) {
    const target = openedIndex + direction;
    if (target >= 0 && target < items.length) {
      open(items[target]);
      return;
    }
    setPendingEdge(direction === 1 ? "first" : "last");
    changePage(page + direction);
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const deleting = toDelete;
    setToDelete(null);
    setActionError(null);
    try {
      await remove.mutateAsync(deleting.id);
      if (opened?.id === deleting.id) setOpened(null);
      // It was the only one of its page, so the page before is shown.
      if (items.length === 1 && page > 1) onPageChange(page - 1);
      onToast(`${The} ${words.one} se eliminó.`);
    } catch (error) {
      setActionError(getAuthErrorMessage(error));
    }
  }

  // Several at once, the ones picked with the boxes.
  async function confirmDeleteMany() {
    const ids = selection.selected;
    setConfirmingMany(false);
    setActionError(null);
    try {
      await removeMany.mutateAsync(ids);
      if (opened && ids.includes(opened.id)) setOpened(null);
      // The whole page went, so the page before is shown.
      if (ids.length === items.length && page > 1) onPageChange(page - 1);
      selection.clear();
      onToast(ids.length === 1 ? `Se eliminó 1 ${words.one}.` : `Se eliminaron ${ids.length} ${words.many}.`);
    } catch (error) {
      setActionError(getAuthErrorMessage(error));
    }
  }

  // Moving to another page leaves nothing picked, and goes back up to the
  // start of the list (the numbers are under it).
  const inbox = useRef<HTMLDivElement>(null);
  function changePage(next: number) {
    selection.clear();
    onPageChange(next);
    inbox.current?.scrollIntoView?.({ block: "start" });
  }

  // The other box starts with nothing picked, on its first page.
  function changeBox(next: TrayBox) {
    if (next === box) return;
    selection.clear();
    setPendingEdge(null);
    onBoxChange(next);
  }

  let list: ReactNode;
  if (tray.isLoading) {
    list = <p className={styles.status}>Cargando {words.those} {words.many}…</p>;
  } else if (tray.isError) {
    list = (
      <p role="alert" className={`${styles.status} ${styles.error}`}>
        No pudimos cargar {words.those} {words.many}. Intenta recargar la página.
      </p>
    );
  } else {
    list = (
      <div ref={inbox} className={styles.inbox}>
        <TrayToolbar
          selectedCount={selection.selected.length}
          allSelected={selection.allSelected}
          onToggleAll={selection.toggleAll}
          onDelete={() => setConfirmingMany(true)}
          busy={removeMany.isPending}
          words={words}
          box={box}
          onBoxChange={changeBox}
          range={{
            from: (page - 1) * pageSize + 1,
            to: (page - 1) * pageSize + items.length,
            total,
            onPrev: page > 1 ? () => changePage(page - 1) : undefined,
            onNext: page < totalPages ? () => changePage(page + 1) : undefined,
          }}
        />
        {items.length === 0 ? (
          box === "sent" ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon} aria-hidden="true">
                <IconSend width={22} height={22} />
              </span>
              <p className={styles.emptyTitle}>Aún no has enviado mensajes</p>
              <p className={styles.emptyText}>Aquí verás los mensajes que les escribas a tus estudiantes y a sus familias.</p>
            </div>
          ) : (
            empty
          )
        ) : (
          <ul className={styles.list} aria-label={listLabel}>
            {items.map((n) => (
              <NotificationRow
                key={n.id}
                notification={n}
                selected={selection.isSelected(n.id)}
                onToggle={() => selection.toggle(n.id)}
                onOpen={() => open(n)}
                onDelete={() => setToDelete(n)}
              />
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className={styles.section}>
      {/* The tray and an opened one swap with the entrance, also when the
          arrows go to the one before or after: its place in the tray is the
          level, so "next" comes from the right. */}
      <ViewEnter view={opened?.id ?? "tray"} level={opened ? (position?.current ?? 1) : 0} className={styles.section}>
        {opened ? (
          <NotificationDetail
            notification={opened}
            position={position}
            onBack={() => setOpened(null)}
            onDelete={() => setToDelete(opened)}
            onToast={onToast}
            words={words}
          />
        ) : (
          <>
            {header}
            {list}
            {items.length > 0 && <TrayPager page={page} totalPages={totalPages} onChange={changePage} />}
          </>
        )}
      </ViewEnter>

      {actionError && (
        <p role="alert" className={`${styles.status} ${styles.error}`}>
          {actionError}
        </p>
      )}

      {confirmingMany && (
        <ConfirmDialog
          title={`Eliminar ${words.many}`}
          message={
            selection.selected.length === 1
              ? `¿Quieres eliminar ${words.the} ${words.one} ${words.picked}? No se puede deshacer.`
              : `¿Quieres eliminar ${words.those} ${selection.selected.length} ${words.many} ${words.pickedMany}? No se puede deshacer.`
          }
          acceptLabel="Sí, eliminar"
          cancelLabel="Cancelar"
          danger
          onAccept={() => void confirmDeleteMany()}
          onCancel={() => setConfirmingMany(false)}
        />
      )}

      {toDelete && (
        <ConfirmDialog
          title={`Eliminar ${words.one}`}
          message={`¿Quieres eliminar ${words.the} ${words.one} "${notificationSubject(toDelete)}"? No se puede deshacer.`}
          acceptLabel="Sí, eliminar"
          cancelLabel="Cancelar"
          danger
          onAccept={() => void confirmDelete()}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
}

interface RowProps {
  notification: NotificationItem;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onDelete: () => void;
}

function NotificationRow({ notification: n, selected, onToggle, onOpen, onDelete }: RowProps) {
  const subject = notificationSubject(n);
  const context = notificationContext(n);
  const classes = [styles.row, !n.read && styles.rowUnread, selected && styles.rowSelected].filter(Boolean).join(" ");
  return (
    <li className={classes}>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Seleccionar: ${subject}, de ${senderOf(n)}`}
        />
      </label>
      {/* The whole row opens it. The trash is a separate button, a button
          can't go inside another one. */}
      <button type="button" className={styles.rowMain} onClick={onOpen}>
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.rowSender}>
          {!n.read && <span className={styles.visuallyHidden}>No leída: </span>}
          {senderOf(n)}
          {isAutomatic(n) && (
            <>
              {" "}
              <span className={styles.autoTag}>Automático</span>
            </>
          )}
        </span>
        <span className={styles.rowText}>
          {context && <span className={styles.contextTag}>{context}</span>}
          <span className={styles.rowSubject}>{subject}</span> — {notificationMessage(n)}
        </span>
        <time className={styles.rowTime} dateTime={n.created_at} title={formatArrival(n.created_at)}>
          {formatShortArrival(n.created_at)}
        </time>
      </button>
      <button type="button" className={styles.trashButton} onClick={onDelete} aria-label={`Eliminar: ${subject}`}>
        <IconTrash width={18} height={18} />
      </button>
    </li>
  );
}

interface DetailProps {
  notification: NotificationItem;
  position: MailPosition | null;
  onBack: () => void;
  onDelete: () => void;
  onToast: (message: string) => void;
  words: TrayWords;
}

function NotificationDetail({ notification: n, position, onBack, onDelete, onToast, words }: DetailProps) {
  // A family's message or the teacher's copy is read as a mail thread, named
  // without the "Re:". What IRIS wrote by itself has nothing to answer.
  const isMessage = n.event === "message.sent" || n.event === "teacher.message";
  return (
    <NotificationMail
      subject={isMessage ? threadSubject(n.subject) : notificationSubject(n)}
      sender={senderOf(n)}
      automatic={isAutomatic(n)}
      kidLabel="Estudiante"
      kidName={studentOf(n)}
      classroomName={n.classroom_name ?? "Sin nombre"}
      createdAt={n.created_at}
      message={notificationMessage(n)}
      onBack={onBack}
      onDelete={onDelete}
      position={position}
      words={words}
      conversation={isMessage ? <TeacherReply message={n} onToast={onToast} /> : undefined}
    >
      {n.event === "request.created" && <RequestDecision notification={n} onToast={onToast} />}
    </NotificationMail>
  );
}

// HU-51: a family's message, or the copy of one the teacher sent, answered
// in its conversation. A family's answer goes to that family; the copy's,
// to whoever it went to. One from before the conversations starts a new one.
function TeacherReply({
  message,
  onToast,
}: {
  message: Extract<NotificationItem, { event: "message.sent" | "teacher.message" }>;
  onToast: (message: string) => void;
}) {
  const send = useSendFamilyMessage();
  const recipient: MessageRecipient =
    message.event === "teacher.message" && message.addressee === "student" ? "student" : "guardian";
  const kid = studentOf(message);
  const otherName =
    recipient === "student" ? kid : message.event === "message.sent" ? senderOf(message) : `la familia de ${kid}`;
  return (
    <MessageThread
      role="teacher"
      message={message}
      otherName={otherName}
      onReply={async (subject, body) => {
        await send.mutateAsync({
          classroomId: message.classroom_id,
          enrollmentId: message.enrollment_id,
          recipient,
          subject,
          body,
          threadId: message.thread_id,
        });
        onToast(`Le respondiste a ${otherName}.`);
      }}
    />
  );
}

interface RequestDecisionProps {
  notification: NotificationItem;
  onToast: (message: string) => void;
}

// HU-70: who asks (the kid and their guardian) and the two answers;
// rejecting asks first. The request is looked up live, so an answered one
// says so instead of offering the buttons again.
function RequestDecision({ notification: n, onToast }: RequestDecisionProps) {
  const requests = useClassroomRequests(n.classroom_id);
  const resolve = useResolveRequest();
  const [error, setError] = useState<string | null>(null);
  const [confirmingReject, setConfirmingReject] = useState(false);

  if (requests.isLoading) return <p className={styles.status}>Buscando la solicitud…</p>;
  if (requests.isError) {
    return <p className={own.answered}>Esta clase ya no existe, así que la solicitud no se puede responder.</p>;
  }
  const request = requests.data?.find((r) => r.enrollment_id === n.enrollment_id);
  if (!request) return <p className={own.answered}>Esta solicitud ya fue respondida.</p>;

  async function answer(decision: "aceptar" | "rechazar") {
    if (!request) return;
    setError(null);
    try {
      await resolve.mutateAsync({ classroomId: n.classroom_id, enrollmentId: request.enrollment_id, decision });
      onToast(
        decision === "aceptar"
          ? `${fullName(request.student_first_name, request.student_last_name)} ya es parte de la clase.`
          : `Rechazaste la solicitud de ${fullName(request.student_first_name, request.student_last_name)}.`,
      );
    } catch (failure) {
      setError(getAuthErrorMessage(failure));
    }
  }

  return (
    <section className={own.decision} aria-labelledby="request-details">
      <h2 id="request-details" className={own.decisionTitle}>
        ¿Quién pide entrar?
      </h2>
      <div className={own.people}>
        <div className={own.person}>
          <StudentAvatarImage avatarId={request.student_avatar_id} size="small" label="" />
          <div>
            <p className={own.personRole}>Estudiante</p>
            <p className={own.personName}>{fullName(request.student_first_name, request.student_last_name)}</p>
          </div>
        </div>
        <div className={own.person}>
          <div>
            <p className={own.personRole}>Tutor ({request.guardian_relationship})</p>
            <p className={own.personName}>{request.guardian_name}</p>
            <p className={own.personContact}>{request.guardian_email}</p>
          </div>
        </div>
      </div>
      {error && (
        <p role="alert" className={`${styles.status} ${styles.error}`}>
          {error}
        </p>
      )}
      <div className={own.decisionButtons}>
        <button
          type="button"
          className={own.rejectButton}
          onClick={() => setConfirmingReject(true)}
          disabled={resolve.isPending}
        >
          Rechazar
        </button>
        <button
          type="button"
          className={own.acceptButton}
          onClick={() => void answer("aceptar")}
          disabled={resolve.isPending}
        >
          Aceptar
        </button>
      </div>
      {confirmingReject && (
        <ConfirmDialog
          title="Rechazar la solicitud"
          message={`¿Seguro que quieres rechazar la solicitud de ${fullName(request.student_first_name, request.student_last_name)} para unirse a la clase "${n.classroom_name ?? "Sin nombre"}"? Su tutor recibirá una notificación y podrá volver a pedir el ingreso más adelante.`}
          acceptLabel="Sí, rechazar"
          cancelLabel="Cancelar"
          danger
          onAccept={() => {
            setConfirmingReject(false);
            void answer("rechazar");
          }}
          onCancel={() => setConfirmingReject(false)}
        />
      )}
    </section>
  );
}
