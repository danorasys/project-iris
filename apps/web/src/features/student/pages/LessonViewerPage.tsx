import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BigChoiceButton } from "@/shared/ui/BigChoiceButton";
import { Mascot } from "@/shared/ui/Mascot";
import { useAuth } from "@/shared/auth/AuthContext";
import { useLessonDetail } from "@/shared/api/hooks/useLessonsApi";
import { DwellArrow } from "../components/DwellArrow";
import { getDwellDurationMs } from "../lib/dwellPreferences";
import styles from "./LessonViewerPage.module.css";

/** `/student/lessons/:lessonId`, a slideshow-style viewer. One block at
 * a time, navigated with big left/right arrows, never scroll. On reaching
 * the last block, the right arrow goes back to the classroom's lesson
 * list instead of staying disabled. */
export default function LessonViewerPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const dwellDurationMs = session ? getDwellDurationMs(session.subjectId) : undefined;

  const lessonQuery = useLessonDetail(lessonId);
  const [index, setIndex] = useState(0);

  if (lessonQuery.isLoading) {
    return (
      <main className={styles.centered}>
        <Mascot mood="thinking" size="medium">
          Abriendo la lección…
        </Mascot>
      </main>
    );
  }

  if (lessonQuery.isError || !lessonQuery.data) {
    return (
      <main className={styles.centered}>
        <Mascot mood="thinking" size="medium">
          No pudimos abrir esta lección.
        </Mascot>
        <BigChoiceButton variant="teal" onSelect={() => navigate("/student/classrooms")} dwellDurationMs={dwellDurationMs}>
          Volver a mis aulas
        </BigChoiceButton>
      </main>
    );
  }

  const lesson = lessonQuery.data;
  const blocks = [...lesson.blocks].sort((a, b) => a.order_index - b.order_index);

  const goToLessons = () => navigate(`/student/classrooms/${lesson.classroom_id}/lessons`);

  if (blocks.length === 0) {
    return (
      <main className={styles.centered}>
        <Mascot mood="happy" size="medium">
          Esta lección todavía no tiene contenido.
        </Mascot>
        <BigChoiceButton variant="teal" onSelect={goToLessons} dwellDurationMs={dwellDurationMs}>
          Volver a lecciones
        </BigChoiceButton>
      </main>
    );
  }

  const currentBlock = blocks[index];
  const isFirst = index === 0;
  const isLast = index === blocks.length - 1;

  const previous = () => {
    if (!isFirst) setIndex((i) => i - 1);
  };

  const next = () => {
    if (isLast) {
      goToLessons();
    } else {
      setIndex((i) => i + 1);
    }
  };

  return (
    <main className={styles.viewer}>
      <DwellArrow
        direction="left"
        label="Bloque anterior"
        onSelect={previous}
        disabled={isFirst}
        dwellDurationMs={dwellDurationMs}
      />

      <div className={styles.content}>
        <p className={styles.progress} aria-live="polite">
          {index + 1} de {blocks.length}
        </p>
        <h1 className={styles.lessonTitle}>{lesson.title}</h1>
        {currentBlock.type === "texto" ? (
          <p className={styles.text}>{currentBlock.content}</p>
        ) : (
          <img src={currentBlock.image_url ?? ""} alt="" className={styles.image} />
        )}
      </div>

      <DwellArrow
        direction="right"
        label={isLast ? "Terminar lección" : "Siguiente bloque"}
        onSelect={next}
        dwellDurationMs={dwellDurationMs}
      />
    </main>
  );
}
