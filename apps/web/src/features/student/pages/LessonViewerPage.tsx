import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { LessonBlockRenderer } from "@/features/lessons/components/LessonBlockRenderer";
import { useLessonDetail } from "@/shared/api/hooks/useLessonsApi";
import { useAuth } from "@/shared/auth/AuthContext";
import { BigChoiceButton } from "@/shared/ui/BigChoiceButton";
import { Mascot } from "@/shared/ui/Mascot";

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

    const lesson = lessonQuery.data;

    if (blocks.length === 0) {
        return (
            <main className={styles.centered}>
                <Mascot mood="happy" size="medium">
                    Esta lección todavía no tiene contenido.
                </Mascot>

                <BigChoiceButton
                    variant="teal"
                    icon={<ChevronLeft width={32} height={32} />}
                    dwellDurationMs={dwellDurationMs}
                    onSelect={goToLessons}
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
                <div className={styles.backAction}>
                    <BigChoiceButton
                        variant="teal"
                        icon={<ChevronLeft width={28} height={28} />}
                        dwellDurationMs={dwellDurationMs}
                        onSelect={goToLessons}
                    >
                        Lecciones
                    </BigChoiceButton>
                </div>

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
                    onSelect={previous}
                />

                <article className={styles.contentCard}>
                    <LessonBlockRenderer
                        /*
                         * Cambiar la key reinicia la respuesta local
                         * cuando el estudiante avanza de bloque.
                         */
                        key={currentBlock.id}
                        block={currentBlock}
                        interactive
                        dwellDurationMs={dwellDurationMs}
                        /*
                         * Se mantiene desactivado hasta que FastAPI
                         * valide la respuesta sin enviar la correcta.
                         */
                        showCorrectness={false}
                    />
                </article>
                {isLast ? (
                    <DwellArrow
                        direction="finish"
                        label="Terminar lección"
                        dwellDurationMs={dwellDurationMs}
                        onSelect={goToLessons}
                    />
                ) : (
                    <DwellArrow
                        direction="right"
                        label="Siguiente contenido"
                        dwellDurationMs={dwellDurationMs}
                        onSelect={next}
                    />
                )}
            </section>

            <footer className={styles.mobileNavigation}>
                <BigChoiceButton
                    variant="teal"
                    icon={<ChevronLeft width={28} height={28} />}
                    disabled={isFirst}
                    dwellDurationMs={dwellDurationMs}
                    onSelect={previous}
                >
                    Anterior
                </BigChoiceButton>

                {isLast ? (
                    <DwellArrow
                        direction="finish"
                        label="Terminar lección"
                        dwellDurationMs={dwellDurationMs}
                        onSelect={goToLessons}
                    />
                ) : (
                    <DwellArrow
                        direction="right"
                        label="Siguiente contenido"
                        dwellDurationMs={dwellDurationMs}
                        onSelect={next}
                    />
                )}
            </footer>
        </main>
    );
}
