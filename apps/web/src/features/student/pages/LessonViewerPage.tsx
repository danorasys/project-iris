import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { BigChoiceButton } from "@/shared/ui/BigChoiceButton";
import { Mascot } from "@/shared/ui/Mascot";
import { useAuth } from "@/shared/auth/useAuth";
import { lessonKeys, useLessonPlay } from "@/shared/api/hooks/useLessonsApi";
import { LessonPlayer } from "../lesson/LessonPlayer";
import { getDwellDurationMs } from "../lib/dwellPreferences";
import styles from "./LessonViewerPage.module.css";

/** `/student/lessons/:lessonId`: loads the lesson to play and hands it to
 * LessonPlayer (its hub, pages, activity and extras, all by gaze). */
export default function LessonViewerPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const dwellDurationMs = session ? getDwellDurationMs(session.subjectId) : undefined;
  const play = useLessonPlay(lessonId);
  const queryClient = useQueryClient();

  if (play.isLoading) {
    return (
      <main className={styles.centered}>
        <Mascot mood="thinking" size="medium">
          Abriendo la lección…
        </Mascot>
      </main>
    );
  }

  if (play.isError || !play.data) {
    return (
      <main className={styles.centered}>
        <Mascot mood="thinking" size="medium">
          No pudimos abrir esta lección.
        </Mascot>
        <BigChoiceButton
          variant="teal"
          onSelect={() => navigate("/student/home")}
          dwellDurationMs={dwellDurationMs}
        >
          Volver al inicio
        </BigChoiceButton>
      </main>
    );
  }

  const lesson = play.data;
  // Back to the lessons of its unit, with how it's going now.
  const exit = () => {
    void queryClient.invalidateQueries({ queryKey: lessonKeys.myProgress(lesson.classroom_id) });
    navigate(`/student/classrooms/${lesson.classroom_id}/units/${lesson.unit_id}`);
  };
  return (
    <LessonPlayer
      // A new copy of the lesson (after the teacher changed it) starts over.
      key={play.dataUpdatedAt}
      lesson={lesson}
      dwellDurationMs={dwellDurationMs}
      onExit={exit}
      onReload={() => void play.refetch()}
    />
  );
}
