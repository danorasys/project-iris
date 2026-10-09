import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ClassroomAvatar } from "@/features/teacher/classrooms/ClassroomAvatar";
import { useAuth } from "@/shared/auth/useAuth";
import { useStudentClassrooms } from "@/shared/api/hooks/useClassroomsApi";
import { useKidClassUnread } from "@/shared/api/hooks/useNotifications";
import { BigChoiceButton } from "@/shared/ui/BigChoiceButton";
import { IconArrowLeft, IconBell, IconBook, IconChart } from "@/shared/ui/icons";
import { Mascot } from "@/shared/ui/Mascot";
import { getDwellDurationMs } from "../lib/dwellPreferences";
import styles from "./ChoiceListPage.module.css";

/** `/student/classrooms/:classroomId` (HU-57): the space of one class, with
 * its notifications (and how many are new), its lessons and the kid's
 * progress. Four big choices, never more. */
export default function ClassSpacePage() {
  const { classroomId = "" } = useParams<{ classroomId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const dwellDurationMs = session ? getDwellDurationMs(session.subjectId) : undefined;
  const classrooms = useStudentClassrooms();
  const unread = useKidClassUnread(classroomId).data ?? 0;
  const classroom = classrooms.data?.find((c) => c.id === classroomId);
  const here = `/student/classrooms/${classroomId}`;

  if (classrooms.isLoading) {
    return (
      <main className={styles.centered}>
        <Mascot mood="thinking" size="medium">
          Abriendo tu clase…
        </Mascot>
      </main>
    );
  }
  // Not one of theirs (anymore): back to their home.
  if (!classroom) return <Navigate to="/student/home" replace />;

  return (
    <main className={styles.centered}>
      <Mascot mood="happy" size="medium">
        ¿Qué quieres hacer en esta clase?
      </Mascot>
      <div className={styles.classHeader}>
        <ClassroomAvatar classroom={classroom} size={64} />
        <h1 className={styles.title}>{classroom.name}</h1>
      </div>
      <div className={styles.options}>
        <BigChoiceButton
          variant="coral"
          icon={<IconBell width={36} height={36} />}
          badge={unread}
          badgeLabel={unread === 1 ? "nueva" : "nuevas"}
          onSelect={() => navigate(`${here}/notifications`)}
          dwellDurationMs={dwellDurationMs}
        >
          Notificaciones
        </BigChoiceButton>
        <BigChoiceButton
          variant="hoja"
          icon={<IconBook width={36} height={36} />}
          onSelect={() => navigate(`${here}/units`)}
          dwellDurationMs={dwellDurationMs}
        >
          Lecciones
        </BigChoiceButton>
        <BigChoiceButton
          variant="sol"
          icon={<IconChart width={36} height={36} />}
          onSelect={() => navigate(`${here}/progress`)}
          dwellDurationMs={dwellDurationMs}
        >
          Mi progreso
        </BigChoiceButton>
        <BigChoiceButton
          variant="teal"
          icon={<IconArrowLeft width={36} height={36} />}
          onSelect={() => navigate("/student/home")}
          dwellDurationMs={dwellDurationMs}
        >
          Volver al inicio
        </BigChoiceButton>
      </div>
    </main>
  );
}
