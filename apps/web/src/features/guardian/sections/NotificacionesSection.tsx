import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import type { NotificationItem } from "@iris/shared-types";
import {
  useBandejaNotificaciones,
  useEliminarNotificacion,
  useEliminarNotificaciones,
  useMarcarNotificacionLeida,
} from "@/shared/api/hooks/useNotifications";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { IconBell, IconTrash } from "@/shared/ui/icons";
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
import { NotificationMail, type MailPosition } from "@/shared/ui/portal/NotificationMail";
import { Highlight, PortalBanner } from "@/shared/ui/portal/PortalBanner";
import { TrayPager } from "@/shared/ui/portal/TrayPager";
import { TrayToolbar } from "@/shared/ui/portal/TraySelection";
import { useTraySelection } from "@/shared/ui/portal/useTraySelection";
import { isPortalAccessRequired, useWithPortalAccess } from "../portalAccess";
import styles from "@/shared/ui/portal/NotificationTray.module.css";

const PAGE_SIZE = 8;

/** "Notificaciones": the guardian's tray. The newest first and a page at a
 * time, the unread ones stand out, each one says which kid, which class and
 * who it's from, and it can be opened to read in full or deleted. */
export function NotificacionesSection({
  initialNotification = null,
}: {
  /** Opened right away, like when it's clicked in Inicio. */
  initialNotification?: NotificationItem | null;
}) {
  const [page, setPage] = useState(1);
  const [opened, setOpened] = useState<NotificationItem | null>(initialNotification);
  const [toDelete, setToDelete] = useState<NotificationItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const tray = useBandejaNotificaciones(page, PAGE_SIZE);
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

  if (tray.isLoading) return <p className={styles.status}>Cargando tus notificaciones…</p>;
  // Nothing typed to keep here, a closed portal just goes to the code screen.
  if (isPortalAccessRequired(tray.error)) return <Navigate to="/guardian/verify-2fa" replace />;
  if (tray.isError) {
    return (
      <p role="alert" className={`${styles.status} ${styles.error}`}>
        No pudimos cargar tus notificaciones. Intenta recargar la página.
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
            <PortalBanner
              label="Notificaciones"
              eyebrow="Notificaciones"
              title={
                <>
                  Tus <Highlight>notificaciones</Highlight>
                </>
              }
              chips={[
                total === 1 ? "1 notificación" : `${total} notificaciones`,
                unread === 1 ? "1 sin leer" : `${unread} sin leer`,
              ]}
              icon={<IconBell width={40} height={40} />}
            />

            {items.length === 0 ? (
              <div className={styles.empty}>
                <span className={styles.emptyIcon} aria-hidden="true">
                  <IconBell width={26} height={26} />
                </span>
                <p className={styles.emptyTitle}>No tienes notificaciones por ahora</p>
              </div>
            ) : (
              <div ref={inbox} className={styles.inbox}>
                <TrayToolbar
                  selectedCount={selection.selected.length}
                  allSelected={selection.allSelected}
                  onToggleAll={selection.toggleAll}
                  onDelete={() => setConfirmingMany(true)}
                  busy={removeMany.isPending}
                  range={{
                    from: (page - 1) * PAGE_SIZE + 1,
                    to: (page - 1) * PAGE_SIZE + items.length,
                    total,
                    onPrev: page > 1 ? () => changePage(page - 1) : undefined,
                    onNext: page < totalPages ? () => changePage(page + 1) : undefined,
                  }}
                />
                <ul className={styles.list} aria-label="Lista de notificaciones">
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
              </div>
            )}

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
}

function NotificationRow({ notification: n, selected, onToggle, onOpen, onDelete }: RowProps) {
  const subject = notificationSubject(n);
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
        </span>
        <span className={styles.rowText}>
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
  return (
    <NotificationMail
      subject={notificationSubject(n)}
      sender={senderOf(n)}
      kidLabel="Peque"
      kidName={studentOf(n)}
      classroomName={n.classroom_name ?? "Sin nombre"}
      createdAt={n.created_at}
      message={notificationMessage(n)}
      onBack={onBack}
      onDelete={onDelete}
      position={position}
    />
  );
}
