import { useState } from "react";
import type { NotificationItem, NotificationPage } from "@iris/shared-types";
import { formatArrival, formatShortArrival } from "@/features/utils/formatArrival";
import { useDeleteNotification, useMarkNotificationRead } from "@/shared/api/hooks/useNotifications";
import { useDwellSelect } from "@/shared/gaze/useDwellSelect";
import { BigChoiceButton } from "@/shared/ui/BigChoiceButton";
import { ConfirmModal } from "@/shared/ui/ConfirmModal";
import { IconArrowLeft, IconTrash } from "@/shared/ui/icons";
import { Mascot } from "@/shared/ui/Mascot";
import { ViewEnter } from "@/shared/ui/ViewEnter";
import { DwellArrow } from "../components/DwellArrow";
import { PagedChoices } from "../components/PagedChoices";
import {
  TRAY_PAGE_SIZE,
  classroomOf,
  messagePages,
  notificationMessage,
  notificationSnippet,
  notificationSubject,
  senderOf,
} from "./studentNotificationText";
import styles from "./KidTray.module.css";

interface KidTrayProps {
  /** One page of the tray, asked by the page that shows it. */
  tray: { data?: NotificationPage; isLoading: boolean; isError: boolean };
  /** From 0, the screen of the list. */
  screen: number;
  onScreen: (screen: number) => void;
  /** "Mis notificaciones", or the name of the class. */
  title: string;
  backLabel: string;
  onBack: () => void;
  dwellDurationMs?: number;
}

/** The kid's tray (HU-54 to HU-56), of all their classes or of one (HU-57):
 * each notification as a big card with its subject, class, first words and
 * when it came; the unread ones in IRIS blue. Looking at one opens it whole,
 * marks it as read, and lets them delete it after confirming. */
export function KidTray({ tray, screen, onScreen, title, backLabel, onBack, dwellDurationMs }: KidTrayProps) {
  const [open, setOpen] = useState<NotificationItem | null>(null);
  const markRead = useMarkNotificationRead("student");

  function read(notification: NotificationItem) {
    setOpen(notification);
    if (!notification.read) markRead.mutate(notification.id);
  }

  const back = (
    <BigChoiceButton
      variant="teal"
      icon={<IconArrowLeft width={36} height={36} />}
      onSelect={onBack}
      dwellDurationMs={dwellDurationMs}
    >
      {backLabel}
    </BigChoiceButton>
  );

  if (open) {
    return (
      <ViewEnter view={open.id} level={1} onMount>
        <NotificationReader
          notification={open}
          dwellDurationMs={dwellDurationMs}
          onBack={() => setOpen(null)}
          onDeleted={() => {
            setOpen(null);
            // The last one of a screen: back to the one before it.
            if ((tray.data?.items.length ?? 0) <= 1 && screen > 0) onScreen(screen - 1);
          }}
        />
      </ViewEnter>
    );
  }

  if (tray.isLoading || tray.isError) {
    return (
      <main className={styles.centered}>
        <Mascot mood="thinking" size="medium">
          {tray.isLoading
            ? "Buscando tus notificaciones…"
            : "No pudimos cargar tus notificaciones. Inténtalo de nuevo en un momento."}
        </Mascot>
        {tray.isError && back}
      </main>
    );
  }

  const page = tray.data;
  const items = page?.items ?? [];
  const unread = page?.unread_count ?? 0;
  if (items.length === 0) {
    return (
      <main className={styles.centered}>
        <Mascot mood="happy" size="large">
          No tienes notificaciones por ahora. Aquí te aviso cuando tu profe te escriba o publique algo nuevo.
        </Mascot>
        {back}
      </main>
    );
  }

  return (
    <PagedChoices
      items={items}
      getKey={(n) => n.id}
      countLabel="Notificaciones"
      dwellDurationMs={dwellDurationMs}
      server={{
        screen,
        screens: Math.max(1, Math.ceil((page?.total ?? 0) / TRAY_PAGE_SIZE)),
        total: page?.total ?? 0,
        onChange: onScreen,
      }}
      top={
        <>
          <Mascot mood="happy" size="medium">
            {unread === 0
              ? "Ya leíste todas. Mira una si quieres leerla otra vez."
              : unread === 1
                ? "Tienes 1 notificación nueva. Mírala para leerla."
                : `Tienes ${unread} notificaciones nuevas. Mira una para leerla.`}
          </Mascot>
          <h1 className={styles.title}>{title}</h1>
        </>
      }
      render={(n) => <NotificationCard notification={n} dwellDurationMs={dwellDurationMs} onOpen={() => read(n)} />}
      bottom={back}
    />
  );
}

interface NotificationCardProps {
  notification: NotificationItem;
  dwellDurationMs?: number;
  onOpen: () => void;
}

// One notification in the list: a big card, selectable with the gaze like a
// big button, that fills up while it's looked at.
function NotificationCard({ notification, dwellDurationMs, onOpen }: NotificationCardProps) {
  const { ref, progress, focused } = useDwellSelect<HTMLButtonElement>({
    onSelect: onOpen,
    durationMs: dwellDurationMs,
  });
  const unread = !notification.read;
  return (
    <button
      ref={ref}
      type="button"
      className={`${styles.card} ${focused ? styles.focused : ""}`}
      data-unread={unread}
      onClick={onOpen}
    >
      <span className={styles.fill} style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />
      <span className={styles.cardTop}>
        {unread && <span className={styles.newChip}>Nueva</span>}
        <span className={styles.date}>{formatShortArrival(notification.created_at)}</span>
      </span>
      <span className={styles.subject}>{notificationSubject(notification)}</span>
      <span className={styles.classroom}>{classroomOf(notification)}</span>
      <span className={styles.snippet}>{notificationSnippet(notification)}</span>
    </button>
  );
}

interface NotificationReaderProps {
  notification: NotificationItem;
  dwellDurationMs?: number;
  onBack: () => void;
  onDeleted: () => void;
}

// A notification read whole (HU-55): subject, who sent it, the class, when,
// and the message, in parts with the big arrows if it's long. "Eliminar"
// asks first in a window (HU-56).
function NotificationReader({ notification, dwellDurationMs, onBack, onDeleted }: NotificationReaderProps) {
  const pages = messagePages(notificationMessage(notification));
  const [page, setPage] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  const remove = useDeleteNotification("student");

  async function confirmDelete() {
    setFailed(false);
    try {
      await remove.mutateAsync(notification.id);
      setConfirming(false);
      onDeleted();
    } catch {
      setConfirming(false);
      setFailed(true);
    }
  }

  return (
    <main className={styles.reader}>
      {pages.length > 1 && (
        <DwellArrow
          direction="left"
          label="Parte anterior del mensaje"
          disabled={page === 0}
          onSelect={() => setPage((p) => Math.max(p - 1, 0))}
          dwellDurationMs={dwellDurationMs}
        />
      )}
      <article className={styles.readerBody} aria-labelledby="kid-notification-subject">
        <h1 id="kid-notification-subject" className={styles.readerSubject}>
          {notificationSubject(notification)}
        </h1>
        <p className={styles.readerMeta}>
          De {senderOf(notification)} · {classroomOf(notification)} · {formatArrival(notification.created_at)}
        </p>
        <ViewEnter view={page} level={page} className={styles.readerText}>
          <p>{pages[page]}</p>
        </ViewEnter>
        {pages.length > 1 && (
          <p className={styles.readerCount} aria-live="polite">
            Parte {page + 1} de {pages.length}
          </p>
        )}
        {failed && (
          <p role="alert" className={styles.error}>
            No pudimos eliminarla. Inténtalo de nuevo en un momento.
          </p>
        )}
        <div className={styles.readerActions}>
          <BigChoiceButton
            variant="teal"
            icon={<IconArrowLeft width={36} height={36} />}
            onSelect={onBack}
            dwellDurationMs={dwellDurationMs}
          >
            Volver a mis notificaciones
          </BigChoiceButton>
          <BigChoiceButton
            variant="coral"
            icon={<IconTrash width={36} height={36} />}
            onSelect={() => setConfirming(true)}
            dwellDurationMs={dwellDurationMs}
          >
            Eliminar
          </BigChoiceButton>
        </div>
      </article>
      {pages.length > 1 && (
        <DwellArrow
          direction="right"
          label="Parte siguiente del mensaje"
          disabled={page === pages.length - 1}
          onSelect={() => setPage((p) => Math.min(p + 1, pages.length - 1))}
          dwellDurationMs={dwellDurationMs}
        />
      )}
      {confirming && (
        <ConfirmModal
          message="¿Seguro que quieres eliminar esta notificación? Ya no la vas a ver en tu bandeja."
          acceptLabel="Sí, eliminarla"
          cancelLabel="No, dejarla"
          onAccept={() => void confirmDelete()}
          onCancel={() => setConfirming(false)}
          disabled={remove.isPending}
        />
      )}
    </main>
  );
}
