import { useNavigate } from "react-router-dom";
import { ClassroomAvatar } from "@/features/teacher/classrooms/ClassroomAvatar";
import { classroomAudience } from "@/features/teacher/classrooms/classroomDetails";
import { useAuth } from "@/shared/auth/useAuth";
import { useStudentClassrooms } from "@/shared/api/hooks/useClassroomsApi";
import { useUnreadNotifications } from "@/shared/api/hooks/useNotifications";
import { IconBell, IconClassroom, IconSliders } from "@/shared/ui/icons";
import { KidHeader, KidMessage, KidPage, KidCard, type KidBarItem } from "@/shared/ui/kid/KidKit";
import { PagedChoices } from "../components/PagedChoices";
import { classTone } from "../lib/classTone";
import { getDwellDurationMs } from "../lib/dwellPreferences";

/** `/student/home` (HU-53): the kid's classes, three at a time as very big
 * cards with each class's logo and color, and on the bottom bar their
 * notifications (with how many are new) and Ajustes. Joining a class is
 * done by their family from the parents' portal (ADR 0016). */
export default function HomePage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const dwellDurationMs = session ? getDwellDurationMs(session.subjectId) : undefined;
  const classrooms = useStudentClassrooms();
  const unread = useUnreadNotifications("student").data ?? 0;
  const list = classrooms.data ?? [];

  const bar: KidBarItem[] = [
    {
      key: "notifications",
      label: "Notificaciones",
      icon: <IconBell />,
      badge: unread,
      badgeLabel: unread === 1 ? "nueva" : "nuevas",
      onSelect: () => navigate("/student/notifications"),
    },
    { key: "settings", label: "Ajustes", icon: <IconSliders />, onSelect: () => navigate("/student/settings") },
  ];
  const header = (
    <KidHeader
      eyebrow="Mis clases"
      icon={<IconClassroom aria-hidden="true" />}
      title="¡Hola de nuevo!"
      subtitle={list.length > 0 ? "¿A qué clase quieres entrar hoy?" : undefined}
    />
  );

  if (classrooms.isLoading || classrooms.isError || list.length === 0) {
    return (
      <KidPage items={bar} dwellDurationMs={dwellDurationMs}>
        {header}
        <KidMessage mood={classrooms.isError ? "thinking" : "happy"}>
          {classrooms.isLoading
            ? "Buscando tus clases…"
            : classrooms.isError
              ? "No pudimos cargar tus clases. Inténtalo de nuevo en un momento."
              : "Todavía no estás en ninguna clase. Tu familia te inscribe desde su portal."}
        </KidMessage>
      </KidPage>
    );
  }

  return (
    <PagedChoices
      items={list}
      getKey={(classroom) => classroom.id}
      countLabel="Clases"
      dwellDurationMs={dwellDurationMs}
      barItems={bar}
      top={header}
      render={(classroom, index) => (
        <KidCard
          title={classroom.name}
          subtitle={classroomAudience(classroom.area, classroom.grade, classroom.area_other)}
          picture={<ClassroomAvatar classroom={classroom} size={180} />}
          pictureShape="square"
          large
          tone={classTone(classroom.color)}
          order={index}
          onSelect={() => navigate(`/student/classrooms/${classroom.id}`)}
          dwellDurationMs={dwellDurationMs}
        />
      )}
    />
  );
}
