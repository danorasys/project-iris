import { useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import type { NotificationItem } from "@iris/shared-types";
import {
  useBandejaNotificaciones,
  useClassNotifications,
  useEliminarNotificacion,
  useEliminarNotificaciones,
  useMarcarNotificacionLeida,
  type TrayBox,
} from "@/shared/api/hooks/useNotifications";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { IconBell, IconSend, IconTrash } from "@/shared/ui/icons";
import {
  formatArrival,
  formatShortArrival,
  notificationMessage,
  notificationSubject,
  senderOf,
  studentOf,
} from "../notifications/notificationText";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { Toast } from "@/shared/ui/Toast";
import { ViewEnter } from "@/shared/ui/ViewEnter";
import { useSendTeacherMessage } from "@/shared/api/hooks/useClassroomsApi";
import { MessageThread } from "@/shared/ui/portal/MessageThread";
import { threadSubject } from "@/shared/ui/portal/messageThreadRules";
import { NotificationMail, type MailPosition } from "@/shared/ui/portal/NotificationMail";
import { isAutomatic, notificationContext } from "@/features/utils/notificationKinds";
import { Highlight, PortalBanner } from "@/shared/ui/portal/PortalBanner";
import { TrayPager } from "@/shared/ui/portal/TrayPager";
import { TrayToolbar } from "@/shared/ui/portal/TraySelection";
import { useTraySelection } from "@/shared/ui/portal/useTraySelection";
import { isPortalAccessRequired, useWithPortalAccess } from "../portalAccess";
import styles from "@/shared/ui/portal/NotificationTray.module.css";

const PAGE_SIZE = 8;

interface NotificacionesSectionProps {
  /** Opened right away, like when it's clicked in Inicio. */
  initialNotification?: NotificationItem | null;
  /** Only the ones of one class about one kid, for the space of that class
   * (HU-42). It goes under the class header, so `heading` takes the place of
   * the big banner. */
  ofClass?: { classroomId: string; studentId: string; heading: ReactNode };
}

/** "Notificaciones": the guardian's tray, in two boxes: "Recibidos" and
 * "Enviados" (the messages they wrote). The newest first and a page at a
 * time, the unread ones stand out, each one says which kid, which class and
 * who it's from, and it can be opened to read in full or deleted. The space
 * of a class uses this same tray, with only that class. */
export function NotificacionesSection({ initialNotification = null, ofClass }: NotificacionesSectionProps) {
  const [page, setPage] = useState(1);
  const [box, setBox] = useState<TrayBox>("received");
  const [opened, setOpened] = useState<NotificationItem | null>(initialNotification);
  const [toDelete, setToDelete] = useState<NotificationItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Only one of the two asks the server: the whole tray or the class one.
  const wholeTray = useBandejaNotificaciones(page, PAGE_SIZE, !ofClass, box);
  const classTray = useClassNotifications(ofClass?.classroomId, ofClass?.studentId, page, PAGE_SIZE, box);
  const tray = ofClass ? classTray : wholeTray;
  const markRead = useMarcarNotificacionLeida();
  const remove = useEliminarNotificacion();
  const removeMany = useEliminarNotificaciones();
  const withPortalAccess = useWithPortalAccess();
  const [confirmingMany, setConfirmingMany] = useState(false);

  const items = tray.data?.items ?? [];
  const selection = useTraySelection(items.map((n) => n.id));
  const totalPages = Math.max(1, Math.ceil((tray.data?.total ?? 0) / PAGE_SIZE));

  // Whatever is open and still unread gets marked as read, once: opened
  // from the list, from Inicio or with the arrows. A failure here isn't worth
  // bothering anyone, it just stays unread.
  const markedIds = useRef(new Set<string>());
  useEffect(() => {
    if (!opened || opened.read || markedIds.current.has(opened.id)) return;
    markedIds.current.add(opened.id);
    void withPortalAccess(() => markRead.mutateAsync(opened.id)).catch(() => undefined);
  }, [opened, markRead, withPortalAccess]);

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
          current: (page - 1) * PAGE_SIZE + openedIndex + 1,
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
      await withPortalAccess(() => remove.mutateAsync(deleting.id));
      if (opened?.id === deleting.id) setOpened(null);
      // It was the only one of its page, so the page before is shown.
      if (items.length === 1 && page > 1) setPage(page - 1);
      setToast("La notificación se eliminó.");
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
      await withPortalAccess(() => removeMany.mutateAsync(ids));
      if (opened && ids.includes(opened.id)) setOpened(null);
      // The whole page went, so the page before is shown.
      if (ids.length === items.length && page > 1) setPage(page - 1);
      selection.clear();
      setToast(ids.length === 1 ? "Se eliminó 1 notificación." : `Se eliminaron ${ids.length} notificaciones.`);
    } catch (error) {
      setActionError(getAuthErrorMessage(error));
    }
  }

  // Moving to another page leaves nothing picked, and goes back up to the
  // start of the list (the numbers are under it).
  const inbox = useRef<HTMLDivElement>(null);
  function changePage(next: number) {
    selection.clear();
    setPage(next);
    inbox.current?.scrollIntoView?.({ block: "start" });
  }

  // The other box starts with nothing picked, on its first page.
  function changeBox(next: TrayBox) {
    if (next === box) return;
    selection.clear();
    setPendingEdge(null);
    setBox(next);
    setPage(1);
  }

  if (tray.isLoading) return <p className={styles.status}>Cargando las notificaciones…</p>;
  // Nothing typed to keep here, a closed portal just goes to the code screen.
  if (isPortalAccessRequired(tray.error)) return <Navigate to="/guardian/verify-2fa" replace />;
  if (tray.isError) {
    return (
      <p role="alert" className={`${styles.status} ${styles.error}`}>
        {ofClass
          ? "No pudimos cargar las notificaciones de esta clase. Intenta de nuevo en un momento."
          : "No pudimos cargar tus notificaciones. Intenta recargar la página."}
      </p>
    );
  }

  const unread = tray.data?.unread_count ?? 0;

  return (
    <div className={styles.section}>
      {/* The tray and an opened notification swap with the entrance, also
          when the arrows go to the one before or after: its place in the
          tray is the level, so "next" comes from the right. */}
      <ViewEnter view={opened?.id ?? "tray"} level={opened ? (position?.current ?? 1) : 0} className={styles.section}>
        {opened ? (
          <NotificationDetail
            notification={opened}
            position={position}
            onBack={() => setOpened(null)}
            onDelete={() => setToDelete(opened)}
          />
        ) : (
          <>
            {ofClass ? (
              ofClass.heading
            ) : (
              <PortalBanner
                label="Notificaciones"
                eyebrow="Notificaciones"
                title={
                  <>
                    Tus <Highlight>notificaciones</Highlight>
                  </>
                }
                chips={[
                  box === "sent"
                    ? total === 1
                      ? "1 enviado"
                      : `${total} enviados`
                    : total === 1
                      ? "1 notificación"
                      : `${total} notificaciones`,
                  unread === 1 ? "1 sin leer" : `${unread} sin leer`,
                ]}
                icon={<IconBell width={40} height={40} />}
              />
            )}

            <div ref={inbox} className={styles.inbox}>
              <TrayToolbar
                selectedCount={selection.selected.length}
                allSelected={selection.allSelected}
                onToggleAll={selection.toggleAll}
                onDelete={() => setConfirmingMany(true)}
                busy={removeMany.isPending}
                box={box}
                onBoxChange={changeBox}
                range={{
                  from: (page - 1) * PAGE_SIZE + 1,
                  to: (page - 1) * PAGE_SIZE + items.length,
                  total,
                  onPrev: page > 1 ? () => changePage(page - 1) : undefined,
                  onNext: page < totalPages ? () => changePage(page + 1) : undefined,
                }}
              />
              {items.length === 0 ? (
                <div className={styles.empty}>
                  <span className={styles.emptyIcon} aria-hidden="true">
                    {box === "sent" ? <IconSend width={22} height={22} /> : <IconBell width={22} height={22} />}
                  </span>
                  <p className={styles.emptyTitle}>
                    {box === "sent"
                      ? "Aún no has enviado mensajes"
                      : ofClass
                        ? "Esta clase todavía no te ha enviado notificaciones"
                        : "No tienes notificaciones por ahora"}
                  </p>
                  {box === "sent" && (
                    <p className={styles.emptyText}>Aquí verás los mensajes que les escribas a los docentes.</p>
                  )}
                </div>
              ) : (
                <ul className={styles.list} aria-label={box === "sent" ? "Mensajes enviados" : "Lista de notificaciones"}>
                  {items.map((n) => (
                    <NotificationRow
                      key={n.id}
                      notification={n}
                      selected={selection.isSelected(n.id)}
                      onToggle={() => selection.toggle(n.id)}
                      onOpen={() => open(n)}
                      onDelete={() => setToDelete(n)}
                      inClass={Boolean(ofClass)}
                    />
                  ))}
                </ul>
              )}
            </div>

            <TrayPager page={page} totalPages={totalPages} onChange={changePage} />
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
          title="Eliminar notificaciones"
          message={
            selection.selected.length === 1
              ? "¿Quieres eliminar la notificación seleccionada? No se puede deshacer."
              : `¿Quieres eliminar las ${selection.selected.length} notificaciones seleccionadas? No se puede deshacer.`
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
          title="Eliminar notificación"
          message={`¿Quieres eliminar la notificación "${notificationSubject(toDelete)}"? No se puede deshacer.`}
          acceptLabel="Sí, eliminar"
          cancelLabel="Cancelar"
          danger
          onAccept={() => void confirmDelete()}
          onCancel={() => setToDelete(null)}
        />
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}

interface RowProps {
  notification: NotificationItem;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onDelete: () => void;
  /** It's the tray of one class and kid (HU-42). */
  inClass: boolean;
}

function NotificationRow({ notification: n, selected, onToggle, onOpen, onDelete, inClass }: RowProps) {
  const subject = notificationSubject(n);
  // Inside a class's own tray the kid and the class are already known.
  const context = inClass ? null : notificationContext(n);
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
}

function NotificationDetail({ notification: n, position, onBack, onDelete }: DetailProps) {
  // Only what a person wrote has a conversation to answer, never what IRIS
  // wrote by itself. It's named like a mail thread, without the "Re:".
  const isMessage = n.event === "teacher.message" || n.event === "message.sent";
  return (
    <NotificationMail
      subject={isMessage ? threadSubject(n.subject) : notificationSubject(n)}
      sender={senderOf(n)}
      automatic={isAutomatic(n)}
      kidLabel="Peque"
      kidName={studentOf(n)}
      classroomName={n.classroom_name ?? "Sin nombre"}
      createdAt={n.created_at}
      message={notificationMessage(n)}
      onBack={onBack}
      onDelete={onDelete}
      position={position}
      conversation={isMessage ? <GuardianReply message={n} /> : undefined}
    />
  );
}

// HU-51: the teacher's message, or the copy of one the guardian wrote,
// answered in its conversation. It always goes to the teacher of the class.
// A message from before the conversations has no thread, so its answer
// starts a new one.
function GuardianReply({
  message,
}: {
  message: Extract<NotificationItem, { event: "teacher.message" | "message.sent" }>;
}) {
  const send = useSendTeacherMessage();
  const withPortalAccess = useWithPortalAccess();
  const otherName = message.event === "teacher.message" ? senderOf(message) : "el docente";
  return (
    <MessageThread
      role="guardian"
      message={message}
      otherName={otherName}
      onReply={(subject, body) =>
        withPortalAccess(() =>
          send.mutateAsync({ enrollmentId: message.enrollment_id, subject, body, threadId: message.thread_id }),
        )
      }
    />
  );
}
