import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/shared/auth/useAuth";
import { useClassroomUnits, useMyClassProgress } from "@/shared/api/hooks/useLessonsApi";
import { BigChoiceButton } from "@/shared/ui/BigChoiceButton";
import { IconArrowLeft, IconBook } from "@/shared/ui/icons";
import { Mascot } from "@/shared/ui/Mascot";
import { PagedChoices } from "../components/PagedChoices";
import { lessonNote } from "../lesson/lessonRules";
import { getDwellDurationMs } from "../lib/dwellPreferences";
import styles from "./ChoiceListPage.module.css";

const VARIANTS = ["coral", "teal", "sol", "hoja"] as const;

/** `/student/classrooms/:classroomId/units/:unitId` (HU-60): the lessons of
 * one unit, each saying how it's going for the kid. The mascot asks the
 * guiding question of the unit. */
export default function UnitLessonsPage() {
  const { classroomId, unitId } = useParams<{ classroomId: string; unitId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const dwellDurationMs = session ? getDwellDurationMs(session.subjectId) : undefined;
  const unitsQuery = useClassroomUnits(classroomId);
  // Only for the notes: without it the lessons still show.
  const progress = useMyClassProgress(classroomId).data;
  const unitsUrl = `/student/classrooms/${classroomId}/units`;

  if (unitsQuery.isLoading) {
    return (
      <main className={styles.centered}>
        <Mascot mood="thinking" size="medium">
          Buscando las lecciones…
        </Mascot>
      </main>
    );
  }

  const unit = unitsQuery.data?.find((u) => u.id === unitId);
  // The unit isn't there anymore (or has nothing published): back to the units.
  if (!unit) return <Navigate to={unitsUrl} replace />;

  const noteOf = (lessonId: string) => {
    const main = progress?.find((p) => p.lesson_id === lessonId)?.main;
    return main ? lessonNote(main) : undefined;
  };

  return (
    <PagedChoices
      items={unit.lessons}
      getKey={(lesson) => lesson.id}
      countLabel="Lecciones"
      dwellDurationMs={dwellDurationMs}
      top={
        <>
          <Mascot mood="happy" size="medium">
            {unit.guiding_question}
          </Mascot>
          <h1 className={styles.title}>{unit.title}</h1>
        </>
      }
      render={(lesson, index) => (
        <BigChoiceButton
          variant={VARIANTS[index % VARIANTS.length]}
          icon={<IconBook width={36} height={36} />}
          note={noteOf(lesson.id)}
          onSelect={() => navigate(`/student/lessons/${lesson.id}`)}
          dwellDurationMs={dwellDurationMs}
        >
          {lesson.title}
        </BigChoiceButton>
      )}
      bottom={
        <BigChoiceButton
          variant="teal"
          icon={<IconArrowLeft width={36} height={36} />}
          onSelect={() => navigate(unitsUrl)}
          dwellDurationMs={dwellDurationMs}
        >
          Unidades
        </BigChoiceButton>
      }
    />
  );
}
