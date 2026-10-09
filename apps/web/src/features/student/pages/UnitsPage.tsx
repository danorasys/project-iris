import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/shared/auth/useAuth";
import { useStudentClassrooms } from "@/shared/api/hooks/useClassroomsApi";
import { useClassroomUnits } from "@/shared/api/hooks/useLessonsApi";
import { BigChoiceButton } from "@/shared/ui/BigChoiceButton";
import { IconArrowLeft, IconLayers } from "@/shared/ui/icons";
import { Mascot } from "@/shared/ui/Mascot";
import { PagedChoices } from "../components/PagedChoices";
import { getDwellDurationMs } from "../lib/dwellPreferences";
import styles from "./ChoiceListPage.module.css";

const VARIANTS = ["coral", "teal", "sol", "hoja"] as const;

/** `/student/classrooms/:classroomId/units` (HU-104): the units of the class that
 * already have lessons, each with its title and its guiding question. */
export default function UnitsPage() {
  const { classroomId } = useParams<{ classroomId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const dwellDurationMs = session ? getDwellDurationMs(session.subjectId) : undefined;
  const unitsQuery = useClassroomUnits(classroomId);
  const classroom = useStudentClassrooms().data?.find((c) => c.id === classroomId);

  const back = (
    <BigChoiceButton
      variant="teal"
      icon={<IconArrowLeft width={36} height={36} />}
      onSelect={() => navigate(`/student/classrooms/${classroomId}`)}
      dwellDurationMs={dwellDurationMs}
    >
      Volver a la clase
    </BigChoiceButton>
  );

  if (unitsQuery.isLoading) {
    return (
      <main className={styles.centered}>
        <Mascot mood="thinking" size="medium">
          Buscando los temas de tu clase…
        </Mascot>
      </main>
    );
  }

  // A kid only gets the units with published lessons.
  const units = unitsQuery.data ?? [];
  if (unitsQuery.isError || units.length === 0) {
    return (
      <main className={styles.centered}>
        <Mascot mood={unitsQuery.isError ? "thinking" : "happy"} size="large">
          {unitsQuery.isError
            ? "No pudimos cargar los temas de tu clase. Inténtalo de nuevo en un momento."
            : "Tu profe todavía no ha publicado lecciones aquí. ¡Vuelve pronto!"}
        </Mascot>
        {back}
      </main>
    );
  }

  return (
    <PagedChoices
      items={units}
      getKey={(unit) => unit.id}
      countLabel="Unidades"
      dwellDurationMs={dwellDurationMs}
      top={
        <>
          <Mascot mood="happy" size="medium">
            ¿Qué tema quieres aprender hoy?
          </Mascot>
          <h1 className={styles.title}>{classroom?.name ?? "Tu clase"}</h1>
        </>
      }
      render={(unit, index) => (
        <BigChoiceButton
          variant={VARIANTS[index % VARIANTS.length]}
          icon={<IconLayers width={36} height={36} />}
          onSelect={() => navigate(`/student/classrooms/${classroomId}/units/${unit.id}`)}
          dwellDurationMs={dwellDurationMs}
        >
          {unit.title}
          {/* Inside the button, big enough to read: it's what the unit is about. */}
          <span className={styles.question}>{unit.guiding_question}</span>
        </BigChoiceButton>
      )}
      bottom={back}
    />
  );
}
