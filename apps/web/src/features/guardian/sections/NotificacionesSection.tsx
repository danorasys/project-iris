import { useState } from "react";
import { Navigate } from "react-router-dom";
import type { NotificationItem } from "@iris/shared-types";
import {
  useBandejaNotificaciones,
  useEliminarNotificacion,
  useMarcarNotificacionLeida,
} from "@/shared/api/hooks/useNotifications";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { IconArrowLeft, IconArrowRight, IconBell, IconTrash } from "@/shared/ui/icons";
import {
  formatArrival,
  notificationMessage,
  notificationSubject,
  senderOf,
  studentOf,
} from "../notifications/notificationText";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { Toast } from "@/shared/ui/Toast";
import { isPortalAccessRequired, useWithPortalAccess } from "../portalAccess";
import styles from "@/shared/ui/portal/NotificationTray.module.css";

const PAGE_SIZE = 8;

interface NotificacionesSectionProps {
  /** Goes back to the section the guardian was in before. */
  onBack: () => void;
}

/** "Notificaciones": the guardian's tray. The newest first and a page at a
 * time, the unread ones stand out, each one says which kid, which class and
 * who it's from, and it can be opened to read in full or deleted. */
export function NotificacionesSection({ onBack }: NotificacionesSectionProps) {
  const [page, setPage] = useState(1);
  const [opened, setOpened] = useState<NotificationItem | null>(null);
  const [toDelete, setToDelete] = useState<NotificationItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const tray = useBandejaNotificaciones(page, PAGE_SIZE);
  const markRead = useMarcarNotificacionLeida();
  const remove = useEliminarNotificacion();
  const withPortalAccess = useWithPortalAccess();

  const items = tray.data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((tray.data?.total ?? 0) / PAGE_SIZE));

  // Opening one marks it as read. A failure here isn't worth bothering the
  // guardian, it just stays unread.
  function open(notification: NotificationItem) {
    setActionError(null);
    setOpened(notification);
    if (!notification.read) {
      void withPortalAccess(() => markRead.mutateAsync(notification.id)).catch(() => undefined);
    }
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
      {opened ? (
        <NotificationDetail
          notification={opened}
          onBack={() => setOpened(null)}
          onDelete={() => setToDelete(opened)}
        />
      ) : (
        <>
          <button type="button" className={styles.backButton} onClick={onBack}>
            <IconArrowLeft width={18} height={18} />
            Regresar
          </button>

          <header className={styles.hero}>
            <span className={styles.heroBadge} aria-hidden="true">
              <IconBell width={32} height={32} />
            </span>
            <div className={styles.heroText}>
              <p className={styles.eyebrow}>Notificaciones</p>
              <h1 className={styles.heroTitle}>Tus notificaciones</h1>
              <p className={styles.heroMeta}>
                <span className={styles.chip}>{unread === 1 ? "1 sin leer" : `${unread} sin leer`}</span>
              </p>
            </div>
          </header>

          {items.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon} aria-hidden="true">
                <IconBell width={26} height={26} />
              </span>
              <p className={styles.emptyTitle}>No tienes notificaciones por ahora</p>
              <p className={styles.emptyText}>
                Aquí vas a ver, por ejemplo, cuando un docente responda la solicitud de tu peque para unirse a una
                clase.
              </p>
            </div>
          ) : (
            <ul className={styles.list} aria-label="Lista de notificaciones">
              {items.map((n) => (
                <NotificationRow key={n.id} notification={n} onOpen={() => open(n)} onDelete={() => setToDelete(n)} />
              ))}
            </ul>
          )}

          {totalPages > 1 && (
            <nav className={styles.pager} aria-label="Páginas de notificaciones">
              <button
                type="button"
                className={styles.pagerButton}
                onClick={() => setPage((current) => current - 1)}
                disabled={page <= 1}
              >
                <IconArrowLeft width={16} height={16} />
                Anterior
              </button>
              <span className={styles.pagerStatus} aria-live="polite">
                Página {page} de {totalPages}
              </span>
              <button
                type="button"
                className={styles.pagerButton}
                onClick={() => setPage((current) => current + 1)}
                disabled={page >= totalPages}
              >
                Siguiente
                <IconArrowRight width={16} height={16} />
              </button>
            </nav>
          )}
        </>
      )}

      {actionError && (
        <p role="alert" className={`${styles.status} ${styles.error}`}>
          {actionError}
        </p>
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
  onOpen: () => void;
  onDelete: () => void;
}

function NotificationRow({ notification: n, onOpen, onDelete }: RowProps) {
  const subject = notificationSubject(n);
  return (
    <li className={n.read ? styles.row : `${styles.row} ${styles.rowUnread}`}>
      {/* The whole row opens it. The trash is a separate button, a button
          can't go inside another one. */}
      <button type="button" className={styles.rowMain} onClick={onOpen}>
        <span className={styles.rowTop}>
          <span className={styles.rowSubject}>
            {!n.read && <span className={styles.visuallyHidden}>No leída: </span>}
            {subject}
          </span>
          <time className={styles.rowTime} dateTime={n.created_at}>
            {formatArrival(n.created_at)}
          </time>
        </span>
        <span className={styles.rowFragment}>{notificationMessage(n)}</span>
        <span className={styles.rowMeta}>
          <span>
            <span className={styles.metaLabel}>Peque:</span> {studentOf(n)}
          </span>
          <span>
            <span className={styles.metaLabel}>Clase:</span> {n.classroom_name ?? "Sin nombre"}
          </span>
          <span>
            <span className={styles.metaLabel}>De:</span> {senderOf(n)}
          </span>
        </span>
      </button>
      <button type="button" className={styles.trashButton} onClick={onDelete} aria-label={`Eliminar: ${subject}`}>
        <IconTrash width={18} height={18} />
      </button>
    </li>
  );
}

interface DetailProps {
  notification: NotificationItem;
  onBack: () => void;
  onDelete: () => void;
}

function NotificationDetail({ notification: n, onBack, onDelete }: DetailProps) {
  return (
    <>
      <button type="button" className={styles.backButton} onClick={onBack}>
        <IconArrowLeft width={18} height={18} />
        Regresar a notificaciones
      </button>

      <article className={styles.detail} aria-labelledby="notificacion-asunto">
        <header className={styles.detailHeader}>
          <span className={styles.detailIcon} aria-hidden="true">
            <IconBell width={22} height={22} />
          </span>
          <h1 id="notificacion-asunto" className={styles.detailTitle}>
            {notificationSubject(n)}
          </h1>
        </header>

        <dl className={styles.detailMeta}>
          <div>
            <dt>Peque</dt>
            <dd>{studentOf(n)}</dd>
          </div>
          <div>
            <dt>Clase</dt>
            <dd>{n.classroom_name ?? "Sin nombre"}</dd>
          </div>
          <div>
            <dt>De parte de</dt>
            <dd>{senderOf(n)}</dd>
          </div>
          <div>
            <dt>Recibida</dt>
            <dd>
              <time dateTime={n.created_at}>{formatArrival(n.created_at)}</time>
            </dd>
          </div>
        </dl>

        <p className={styles.detailMessage}>{notificationMessage(n)}</p>

        <div className={styles.detailActions}>
          <button type="button" className={styles.deleteButton} onClick={onDelete}>
            <IconTrash width={18} height={18} />
            Eliminar notificación
          </button>
        </div>
      </article>
    </>
  );
}
