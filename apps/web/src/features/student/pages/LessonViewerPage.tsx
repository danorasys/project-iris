import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { useLessonDetail } from "@/shared/api/hooks/useLessonsApi";
import { useAuth } from "@/shared/auth/AuthContext";
import { BigChoiceButton } from "@/shared/ui/BigChoiceButton";
import { Mascot } from "@/shared/ui/Mascot";
import { LessonBlockRenderer } from "@/features/lessons/components/LessonBlockRenderer";

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

    useEffect(() => {
        setIndex((current) =>
            Math.min(current, Math.max(blocks.length - 1, 0)),
        );
    }, [blocks.length]);

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
                    dwellDurationMs={dwellDurationMs}
                    onSelect={() => navigate("/student/classrooms")}
                >
                    Volver a mis aulas
                </BigChoiceButton>
            </main>
        );
    }

    const lesson = lessonQuery.data;

    const finishLesson = () => {
        navigate(`/student/classrooms/${lesson.classroom_id}/lessons`);
    };

    if (blocks.length === 0) {
        return (
            <main className={styles.centered}>
                <Mascot mood="happy" size="medium">
                    Esta lección todavía no tiene contenido.
                </Mascot>

                <BigChoiceButton
                    variant="teal"
                    dwellDurationMs={dwellDurationMs}
                    onSelect={finishLesson}
                >
                    Volver a lecciones
                </BigChoiceButton>
            </main>
        );
    }

    const currentBlock = blocks[index];
    const isFirst = index === 0;
    const isLast = index === blocks.length - 1;

    return (
        <main className={styles.viewer}>
            <header className={styles.header}>
                <button
                    type="button"
                    className={styles.backButton}
                    onClick={finishLesson}
                >
                    <ChevronLeft size={24} />
                    Lecciones
                </button>

                <div className={styles.lessonIdentity}>
                    <span>Lección</span>
                    <h1>{lesson.title}</h1>
                </div>

                <div className={styles.progressText} aria-live="polite">
                    {index + 1} de {blocks.length}
                </div>
            </header>

            <div className={styles.progressTrack} aria-hidden="true">
                <div
                    className={styles.progressValue}
                    style={{
                        width: `${((index + 1) / blocks.length) * 100}%`,
                    }}
                />
            </div>

            <section className={styles.stage}>
                <DwellArrow
                    direction="left"
                    label="Contenido anterior"
                    disabled={isFirst}
                    dwellDurationMs={dwellDurationMs}
                    onSelect={() =>
                        setIndex((current) => Math.max(current - 1, 0))
                    }
                />

                <article className={styles.contentCard}>
                    <LessonBlockRenderer
                        key={currentBlock.id}
                        block={currentBlock}
                        interactive
                    />
                </article>

                {isLast ? (
                    <button
                        type="button"
                        className={styles.finishButton}
                        onClick={finishLesson}
                    >
                        <CheckCircle2 size={34} />
                        Terminar
                    </button>
                ) : (
                    <DwellArrow
                        direction="right"
                        label="Siguiente contenido"
                        dwellDurationMs={dwellDurationMs}
                        onSelect={() =>
                            setIndex((current) =>
                                Math.min(current + 1, blocks.length - 1),
                            )
                        }
                    />
                )}
            </section>

            <footer className={styles.mobileNavigation}>
                <button
                    type="button"
                    disabled={isFirst}
                    onClick={() =>
                        setIndex((current) => Math.max(current - 1, 0))
                    }
                >
                    <ChevronLeft />
                    Anterior
                </button>

                <button
                    type="button"
                    onClick={
                        isLast
                            ? finishLesson
                            : () =>
                                  setIndex((current) =>
                                      Math.min(current + 1, blocks.length - 1),
                                  )
                    }
                >
                    {isLast ? "Terminar" : "Siguiente"}
                    {isLast ? <CheckCircle2 /> : <ChevronRight />}
                </button>
            </footer>
        </main>
    );
}
