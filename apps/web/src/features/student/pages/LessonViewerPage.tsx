import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { LessonBlockRenderer } from "@/features/lessons/components/LessonBlockRenderer";
import { useLessonDetail } from "@/shared/api/hooks/useLessonsApi";
import { useAuth } from "@/shared/auth/AuthContext";
import { BigChoiceButton } from "@/shared/ui/BigChoiceButton";
import { Mascot } from "@/shared/ui/Mascot";
import { useAuth } from "@/shared/auth/AuthContext";
import { useLessonDetail } from "@/shared/api/hooks/useLessonsApi";
import { lessonImagePath } from "@/shared/api/mediaPaths";
import { AuthImage } from "@/shared/ui/AuthImage";
import { DwellArrow } from "../components/DwellArrow";
import { getDwellDurationMs } from "../lib/dwellPreferences";

import styles from "./LessonViewerPage.module.css";

export default function LessonViewerPage() {
    const { lessonId } = useParams<{ lessonId: string }>();

    const navigate = useNavigate();
    const { session } = useAuth();

    const lessonQuery = useLessonDetail(lessonId);

    const [index, setIndex] = useState(0);

    const dwellDurationMs = session
        ? getDwellDurationMs(session.subjectId)
        : undefined;

    const blocks = useMemo(
        () =>
            [...(lessonQuery.data?.blocks ?? [])].sort(
                (left, right) => left.order_index - right.order_index,
            ),
        [lessonQuery.data?.blocks],
    );

    /*
     * Evita que el índice quede fuera del arreglo si los
     * bloques cambian durante una actualización de caché.
     */
    useEffect(() => {
        setIndex((current) =>
            Math.min(current, Math.max(blocks.length - 1, 0)),
        );
    }, [blocks.length]);

    const goToLessons = () => {
        if (!lessonQuery.data) {
            navigate("/student/classrooms");
            return;
        }

        navigate(
            `/student/classrooms/${lessonQuery.data.classroom_id}/lessons`,
        );
    };

    const previous = () => {
        setIndex((current) => Math.max(current - 1, 0));
    };

    const next = () => {
        setIndex((current) => Math.min(current + 1, blocks.length - 1));
    };

    if (lessonQuery.isLoading) {
        return (
            <main className={styles.centered}>
                <Mascot mood="thinking" size="medium">
                    Preparando tu lección…
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

                <BigChoiceButton
                    variant="teal"
                    icon={<ChevronLeft width={32} height={32} />}
                    dwellDurationMs={dwellDurationMs}
                    onSelect={() => navigate("/student/classrooms")}
                >
                    Volver a mis aulas
                </BigChoiceButton>
            </main>
        );
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
          <AuthImage
            path={currentBlock.image_file ? lessonImagePath(currentBlock.lesson_id, currentBlock.image_file) : null}
            className={styles.image}
          />
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
