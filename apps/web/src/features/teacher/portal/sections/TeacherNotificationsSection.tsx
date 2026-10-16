import { useState } from "react";
import type { NotificationItem } from "@iris/shared-types";
import { useNotificationTray, type TrayBox } from "@/shared/api/hooks/useNotifications";
import { IconBell } from "@/shared/ui/icons";
import styles from "@/shared/ui/portal/NotificationTray.module.css";
import { Highlight, PortalBanner } from "@/shared/ui/portal/PortalBanner";
import { NOTIFICATION_WORDS } from "@/shared/ui/portal/trayWords";
import { Toast } from "@/shared/ui/Toast";
import { TeacherInbox } from "./TeacherInbox";

const PAGE_SIZE = 8;

/** "Notificaciones" of the teacher (HU-69): every notification of every
 * classroom in the inbox, newest first and a page at a time, in two boxes:
 * "Recibidos" and "Enviados" (the messages they wrote). The unread ones
 * stand out. */
export function TeacherNotificationsSection({
  initialNotification = null,
}: {
  /** Opened right away, like when it's clicked in Inicio. */
  initialNotification?: NotificationItem | null;
}) {
  const [page, setPage] = useState(1);
  const [box, setBox] = useState<TrayBox>("received");
  const [toast, setToast] = useState<string | null>(null);
  const tray = useNotificationTray("teacher", page, PAGE_SIZE, true, box);
  const total = tray.data?.total ?? 0;
  const unread = tray.data?.unread_count ?? 0;

  return (
    <>
      <TeacherInbox
        tray={tray}
        page={page}
        onPageChange={setPage}
        pageSize={PAGE_SIZE}
        words={NOTIFICATION_WORDS}
        listLabel={box === "sent" ? "Mensajes enviados" : "Lista de notificaciones"}
        box={box}
        onBoxChange={(next) => {
          setBox(next);
          setPage(1);
        }}
        onToast={setToast}
        initialNotification={initialNotification}
        header={
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
        }
        empty={
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">
              <IconBell width={22} height={22} />
            </span>
            <p className={styles.emptyTitle}>No tienes notificaciones por ahora</p>
          </div>
        }
      />
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </>
  );
}
