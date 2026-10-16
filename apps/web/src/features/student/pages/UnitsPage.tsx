import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/shared/auth/useAuth";
import { useStudentClassrooms } from "@/shared/api/hooks/useClassroomsApi";
import { useClassroomUnits } from "@/shared/api/hooks/useLessonsApi";
import { IconLayers } from "@/shared/ui/icons";
import { KidCard, KidHeader, KidMessage, KidPage } from "@/shared/ui/kid/KidKit";
import { PagedChoices } from "../components/PagedChoices";
import { classTone } from "../lib/classTone";
import { getDwellDurationMs } from "../lib/dwellPreferences";

/** `/student/classrooms/:classroomId/units` (HU-104): the units of the class
 * that already have lessons, as very big cards in the class's color: its
 * number, its title, its guiding question and how many lessons it has. */
export default function UnitsPage() {
  const { classroomId } = useParams<{ classroomId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const dwellDurationMs = session ? getDwellDurationMs(session.subjectId) : undefined;
  const unitsQuery = useClassroomUnits(classroomId);
  const classroom = useStudentClassrooms().data?.find((c) => c.id === classroomId);
  const back = { label: "Volver a la clase", onSelect: () => navigate(`/student/classrooms/${classroomId}`) };
  const header = (
    <KidHeader
      eyebrow={classroom?.name ?? "Tu clase"}
      icon={<IconLayers aria-hidden="true" />}
      title="¿Qué tema quieres aprender hoy?"
    />
  );

  // A kid only gets the units with published lessons.
  const units = unitsQuery.data ?? [];
  if (unitsQuery.isLoading || unitsQuery.isError || units.length === 0) {
    return (
      <KidPage back={back} dwellDurationMs={dwellDurationMs}>
        {header}
        <KidMessage mood={unitsQuery.isError ? "thinking" : "happy"}>
          {unitsQuery.isLoading
            ? "Buscando los temas de tu clase…"
            : unitsQuery.isError
              ? "No pudimos cargar los temas de tu clase. Inténtalo de nuevo en un momento."
              : "Tu profe todavía no ha publicado lecciones aquí. ¡Vuelve pronto!"}
        </KidMessage>
      </KidPage>
    );
  }

  return (
    <PagedChoices
      items={units}
      getKey={(unit) => unit.id}
      countLabel="Unidades"
      dwellDurationMs={dwellDurationMs}
      back={back}
      top={header}
      render={(unit, index) => (
        <KidCard
          title={unit.title}
          subtitle={unit.guiding_question}
          mark={units.indexOf(unit) + 1}
          note={unit.lessons.length === 1 ? "1 lección" : `${unit.lessons.length} lecciones`}
          tone={classTone(classroom?.color)}
          order={index}
          onSelect={() => navigate(`/student/classrooms/${classroomId}/units/${unit.id}`)}
          dwellDurationMs={dwellDurationMs}
        />
      )}
    />
  );
}
