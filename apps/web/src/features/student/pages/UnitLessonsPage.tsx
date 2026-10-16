import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/shared/auth/useAuth";
import { useStudentClassrooms } from "@/shared/api/hooks/useClassroomsApi";
import { useClassroomUnits, useMyClassProgress } from "@/shared/api/hooks/useLessonsApi";
import { IconBook } from "@/shared/ui/icons";
import { KidCard, KidHeader, KidMessage, KidPage } from "@/shared/ui/kid/KidKit";
import { PagedChoices } from "../components/PagedChoices";
import { lessonNote } from "../lesson/lessonRules";
import { classTone } from "../lib/classTone";
import { getDwellDurationMs } from "../lib/dwellPreferences";

// The notes that mean the lesson is read or done: the tag goes green.
const DONE_NOTES = new Set(["Actividad hecha", "Ya leíste todo"]);

/** `/student/classrooms/:classroomId/units/:unitId` (HU-60): the lessons of
 * one unit as very big cards, each with its number and how it's going for
 * the kid. On top, the unit and the question that guides it. */
export default function UnitLessonsPage() {
  const { classroomId, unitId } = useParams<{ classroomId: string; unitId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const dwellDurationMs = session ? getDwellDurationMs(session.subjectId) : undefined;
  const unitsQuery = useClassroomUnits(classroomId);
  const classroom = useStudentClassrooms().data?.find((c) => c.id === classroomId);
  // Only for the notes: without it the lessons still show.
  const progress = useMyClassProgress(classroomId).data;
  const unitsUrl = `/student/classrooms/${classroomId}/units`;
  const back = { label: "Volver a las unidades", onSelect: () => navigate(unitsUrl) };

  if (unitsQuery.isLoading) {
    return (
      <KidPage back={back} dwellDurationMs={dwellDurationMs}>
        <KidMessage mood="thinking">Buscando las lecciones…</KidMessage>
      </KidPage>
    );
  }

  const units = unitsQuery.data ?? [];
  const unit = units.find((u) => u.id === unitId);
  // The unit isn't there anymore (or has nothing published): back to the units.
  if (!unit) return <Navigate to={unitsUrl} replace />;

  const noteOf = (lessonId: string) => {
    const main = progress?.find((p) => p.lesson_id === lessonId)?.main;
    return main ? lessonNote(main) : "Sin empezar";
  };

  return (
    <PagedChoices
      items={unit.lessons}
      getKey={(lesson) => lesson.id}
      countLabel="Lecciones"
      dwellDurationMs={dwellDurationMs}
      back={back}
      top={
        <KidHeader
          eyebrow={`Unidad ${units.indexOf(unit) + 1}`}
          icon={<IconBook aria-hidden="true" />}
          title={unit.title}
          subtitle={unit.guiding_question}
        />
      }
      render={(lesson, index) => {
        const note = noteOf(lesson.id);
        return (
          <KidCard
            title={lesson.title}
            mark={unit.lessons.indexOf(lesson) + 1}
            note={note}
            noteTone={DONE_NOTES.has(note) ? "done" : "plain"}
            tone={classTone(classroom?.color)}
            order={index}
            onSelect={() => navigate(`/student/lessons/${lesson.id}`)}
            dwellDurationMs={dwellDurationMs}
          />
        );
      }}
    />
  );
}
