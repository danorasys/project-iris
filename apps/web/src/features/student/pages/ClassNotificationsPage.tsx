import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/shared/auth/useAuth";
import { useStudentClassrooms } from "@/shared/api/hooks/useClassroomsApi";
import { useKidClassNotifications } from "@/shared/api/hooks/useNotifications";
import { KidTray } from "../notifications/KidTray";
import { TRAY_PAGE_SIZE } from "../notifications/studentNotificationText";
import { getDwellDurationMs } from "../lib/dwellPreferences";

/** `/student/classrooms/:classroomId/notifications` (HU-57): the same tray,
 * only with the notifications of this class. */
export default function ClassNotificationsPage() {
  const { classroomId = "" } = useParams<{ classroomId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [screen, setScreen] = useState(0);
  const tray = useKidClassNotifications(classroomId, screen + 1, TRAY_PAGE_SIZE);
  const classroom = useStudentClassrooms().data?.find((c) => c.id === classroomId);

  return (
    <KidTray
      tray={tray}
      screen={screen}
      onScreen={setScreen}
      title={classroom ? `Notificaciones de ${classroom.name}` : "Notificaciones de tu clase"}
      backLabel="Volver a la clase"
      onBack={() => navigate(`/student/classrooms/${classroomId}`)}
      dwellDurationMs={session ? getDwellDurationMs(session.subjectId) : undefined}
    />
  );
}
