import { useNavigate, useParams } from "react-router-dom";
import { BigChoiceButton } from "@/shared/ui/BigChoiceButton";
import { Mascot } from "@/shared/ui/Mascot";
import { IconArrowLeft } from "@/shared/ui/icons";
import { useAuth } from "@/shared/auth/AuthContext";
import { useClassroomLessons } from "@/shared/api/hooks/useLessonsApi";
import { getDwellDurationMs } from "../lib/dwellPreferences";
import styles from "./LessonListPage.module.css";

const VARIANTS = ["coral", "teal", "sol", "hoja"] as const;

/** `/student/classrooms/:classroomId/lessons`, the classroom's published
 * lessons, ready to open in the slideshow-style viewer. */
export default function LessonListPage() {
  const { classroomId } = useParams<{ classroomId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const dwellDurationMs = session ? getDwellDurationMs(session.subjectId) : undefined;
  const lessonsQuery = useClassroomLessons(classroomId);

  const goBack = () => navigate("/student/classrooms");

  if (lessonsQuery.isLoading) {
    return (
      <main className={styles.container}>
        <Mascot mood="thinking" size="medium">
          Buscando las lecciones de esta aula…
        </Mascot>
      </main>
    );
  }

  if (lessonsQuery.isError) {
    return (
      <main className={styles.container}>
        <Mascot mood="thinking" size="medium">
          No pudimos cargar las lecciones. Inténtalo de nuevo en un momento.
        </Mascot>
        <BigChoiceButton variant="teal" onSelect={goBack} dwellDurationMs={dwellDurationMs}>
          Volver a mis aulas
        </BigChoiceButton>
      </main>
    );
  }

  const published = (lessonsQuery.data ?? []).filter((lesson) => lesson.status === "publicada");

  if (published.length === 0) {
    return (
      <main className={styles.container}>
        <Mascot mood="happy" size="large">
          Tu profe todavía no ha publicado lecciones aquí. ¡Vuelve pronto!
        </Mascot>
        <BigChoiceButton variant="teal" onSelect={goBack} dwellDurationMs={dwellDurationMs}>
          Volver a mis aulas
        </BigChoiceButton>
      </main>
    );
  }

  return (
    <main className={styles.container}>
      <Mascot mood="happy" size="medium">
        ¿Cuál lección quieres ver?
      </Mascot>
      <h1 className={styles.title}>Lecciones</h1>
      <div className={styles.grid}>
        {published.map((lesson, index) => (
          <BigChoiceButton
            key={lesson.id}
            variant={VARIANTS[index % VARIANTS.length]}
            onSelect={() => navigate(`/student/lessons/${lesson.id}`)}
            dwellDurationMs={dwellDurationMs}
          >
            {lesson.title}
          </BigChoiceButton>
        ))}
      </div>
      <BigChoiceButton
        variant="sol"
        icon={<IconArrowLeft width={36} height={36} />}
        onSelect={goBack}
        dwellDurationMs={dwellDurationMs}
      >
        Mis aulas
      </BigChoiceButton>
    </main>
  );
}
