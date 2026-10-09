import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/shared/auth/useAuth";
import { useNotificationTray } from "@/shared/api/hooks/useNotifications";
import { KidTray } from "../notifications/KidTray";
import { TRAY_PAGE_SIZE } from "../notifications/studentNotificationText";
import { getDwellDurationMs } from "../lib/dwellPreferences";

/** `/student/notifications` (HU-54): the kid's tray, of all their classes. */
export default function NotificationsPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [screen, setScreen] = useState(0);
  const tray = useNotificationTray("student", screen + 1, TRAY_PAGE_SIZE);

  return (
    <KidTray
      tray={tray}
      screen={screen}
      onScreen={setScreen}
      title="Mis notificaciones"
      backLabel="Volver al inicio"
      onBack={() => navigate("/student/home")}
      dwellDurationMs={session ? getDwellDurationMs(session.subjectId) : undefined}
    />
  );
}
