import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ClassroomAvatar } from "@/features/teacher/classrooms/ClassroomAvatar";
import { classroomAudience } from "@/features/teacher/classrooms/classroomDetails";
import { useAuth } from "@/shared/auth/useAuth";
import { useStudentClassrooms } from "@/shared/api/hooks/useClassroomsApi";
import { useKidClassUnread } from "@/shared/api/hooks/useNotifications";
import { IconBell, IconBook, IconChart } from "@/shared/ui/icons";
import { KidCard, KidCards, KidHeader, KidMessage, KidPage } from "@/shared/ui/kid/KidKit";
import { classTone } from "../lib/classTone";
import { getDwellDurationMs } from "../lib/dwellPreferences";
import styles from "./KidPages.module.css";

/** `/student/classrooms/:classroomId` (HU-57): the space of one class, with
 * its logo and name on top, and three very big cards: its lessons (by
 * unit), its notifications (and how many are new) and the kid's progress.
 * The way back to their classes is the bar on the bottom edge. */
export default function ClassSpacePage() {
  const { classroomId = "" } = useParams<{ classroomId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const dwellDurationMs = session ? getDwellDurationMs(session.subjectId) : undefined;
  const classrooms = useStudentClassrooms();
  const unread = useKidClassUnread(classroomId).data ?? 0;
  const classroom = classrooms.data?.find((c) => c.id === classroomId);
  const here = `/student/classrooms/${classroomId}`;
  const back = { label: "Volver a mis clases", onSelect: () => navigate("/student/home") };

  if (classrooms.isLoading) {
    return (
      <KidPage back={back} dwellDurationMs={dwellDurationMs}>
        <KidMessage mood="thinking">Abriendo tu clase…</KidMessage>
      </KidPage>
    );
  }
  // Not one of theirs (anymore): back to their home.
  if (!classroom) return <Navigate to="/student/home" replace />;

  return (
    <KidPage back={back} dwellDurationMs={dwellDurationMs}>
      <div className={styles.classHeader}>
        <span className={styles.classLogo} aria-hidden="true">
          <ClassroomAvatar classroom={classroom} size={84} />
        </span>
        <KidHeader
          eyebrow={classroomAudience(classroom.area, classroom.grade, classroom.area_other) || "Mi clase"}
          title={classroom.name}
          subtitle="¿Qué quieres hacer en esta clase?"
        />
      </div>
      <KidCards>
        <KidCard
          title="Lecciones"
          subtitle="Los temas de tu clase y sus lecciones"
          icon={<IconBook />}
          tone={classTone(classroom.color)}
          onSelect={() => navigate(`${here}/units`)}
          dwellDurationMs={dwellDurationMs}
        />
        <KidCard
          title="Notificaciones"
          subtitle="Lo que te escribe tu profe"
          icon={<IconBell />}
          tone="orange"
          badge={unread}
          badgeLabel={unread === 1 ? "nueva" : "nuevas"}
          order={1}
          onSelect={() => navigate(`${here}/notifications`)}
          dwellDurationMs={dwellDurationMs}
        />
        <KidCard
          title="Mi progreso"
          subtitle="Cómo vas en cada lección"
          icon={<IconChart />}
          tone="sky"
          order={2}
          onSelect={() => navigate(`${here}/progress`)}
          dwellDurationMs={dwellDurationMs}
        />
      </KidCards>
    </KidPage>
  );
}
