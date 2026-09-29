import { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { LessonBlockRenderer } from "@/features/lessons/components/LessonBlockRenderer";
import { useLessonDetail } from "@/shared/api/hooks/useLessonsApi";
import { lessonImagePath } from "@/shared/api/mediaPaths";
import { useAuth } from "@/shared/auth/AuthContext";
import { AuthImage } from "@/shared/ui/AuthImage";
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
     * Evita que el índice quede fuera del arreglo
     * cuando TanStack Query actualiza la lección.
     */
    useEffect(() => {
        setIndex((current) =>
            Math.min(current, Math.max(blocks.length - 1, 0)),
        );
    }, [blocks.length]);

    const goToClassrooms = () => {
        navigate("/student/classrooms");
    };

    const goToLessons = () => {
        if (!lessonQuery.data) {
            goToClassrooms();
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
                    onSelect={goToClassrooms}
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

    const renderCurrentBlock = () => {
        /*
         * Las imágenes privadas deben descargarse mediante
         * AuthImage, porque un <img src> normal no puede
         * enviar el token del estudiante.
         */
        if (currentBlock.type === "imagen") {
            return (
                <figure className="lesson-image">
                    <AuthImage
                        path={
                            currentBlock.image_file
                                ? lessonImagePath(
                                      currentBlock.lesson_id,
                                      currentBlock.image_file,
                                  )
                                : null
                        }
                        alt="Contenido visual de la lección"
                        fallback={<p>No se pudo cargar esta imagen.</p>}
                    />
                </figure>
            );
        }

        /*
         * Los bloques de texto pueden representar
         * información Markdown o preguntas.
         */
        return (
            <LessonBlockRenderer
                key={currentBlock.id}
                block={currentBlock}
                interactive
                dwellDurationMs={dwellDurationMs}
                /*
                 * No se revela correcto/incorrecto hasta que
                 * la validación se realice en FastAPI.
                 */
                showCorrectness={false}
            />
        );
    };

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
                    {renderCurrentBlock()}
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
        </main>
    );
}
