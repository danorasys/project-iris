import { useState, type CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useDwellSelect } from "@/shared/gaze/useDwellSelect";

export type SemanticBlockType = "information" | "question";

export interface QuestionMetadata {
    options: string[];

    /**
     * Temporal: debe trasladarse al backend para que la
     * respuesta correcta no sea enviada al estudiante.
     */
    correctOption?: number;
}

interface EncodedMetadata {
    kind: SemanticBlockType;
    question?: QuestionMetadata;
}

export interface LessonBlockLike {
    id?: string;
    type: "texto" | "imagen" | string;
    content?: string | null;
    image_url?: string | null;
    order_index?: number;
}

const METADATA_PATTERN = /^<!-- iris:block (.+?) -->\n?/;

export function encodeInformation(markdown: string): string {
    return encodeTextBlock(
        {
            kind: "information",
        },
        markdown,
    );
}

export function encodeQuestion(
    markdown: string,
    options: string[],
    correctOption?: number,
): string {
    return encodeTextBlock(
        {
            kind: "question",
            question: {
                options,
                correctOption,
            },
        },
        markdown,
    );
}

function encodeTextBlock(metadata: EncodedMetadata, markdown: string): string {
    return `<!-- iris:block ${JSON.stringify(metadata)} -->\n${markdown}`;
}

export function decodeTextBlock(content?: string | null): {
    metadata: EncodedMetadata;
    markdown: string;
} {
    const value = content ?? "";
    const match = value.match(METADATA_PATTERN);

    if (!match) {
        return {
            metadata: {
                kind: "information",
            },
            markdown: value,
        };
    }

    try {
        return {
            metadata: JSON.parse(match[1]) as EncodedMetadata,

            markdown: value.replace(METADATA_PATTERN, ""),
        };
    } catch {
        /*
         * Los bloques antiguos o dañados se muestran como
         * información normal para no perder contenido.
         */
        return {
            metadata: {
                kind: "information",
            },
            markdown: value,
        };
    }
}

interface MarkdownContentProps {
    children: string;
}

function MarkdownContent({ children }: MarkdownContentProps) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            /*
             * Las imágenes no están permitidas dentro del
             * Markdown. Deben subirse mediante el endpoint de
             * imágenes y guardarse como bloques "imagen".
             */
            disallowedElements={["img"]}
            unwrapDisallowed
        >
            {children}
        </ReactMarkdown>
    );
}

interface DwellQuestionOptionProps {
    option: string;
    index: number;
    selectedOption: number | null;
    correctOption?: number;
    interactive: boolean;
    dwellDurationMs?: number;
    showCorrectness: boolean;
    onSelect: (index: number) => void;
}

function DwellQuestionOption({
    option,
    index,
    selectedOption,
    correctOption,
    interactive,
    dwellDurationMs,
    showCorrectness,
    onSelect,
}: DwellQuestionOptionProps) {
    const hasAnswered = selectedOption !== null;
    const isSelected = selectedOption === index;

    const isCorrect = showCorrectness && hasAnswered && correctOption === index;

    const isIncorrect =
        showCorrectness &&
        hasAnswered &&
        isSelected &&
        correctOption !== undefined &&
        correctOption !== index;

    const active = interactive && !hasAnswered;

    const { ref, progress, focused } = useDwellSelect<HTMLButtonElement>({
        active,
        durationMs: dwellDurationMs,
        onSelect: () => onSelect(index),
    });

    const handleSelect = () => {
        if (active) {
            onSelect(index);
        }
    };

    return (
        <button
            ref={ref}
            type="button"
            disabled={!interactive || hasAnswered}
            aria-pressed={isSelected}
            className={[
                "lesson-question-option",
                focused ? "is-dwell-focused" : "",
                isSelected ? "is-selected" : "",
                isCorrect ? "is-correct" : "",
                isIncorrect ? "is-incorrect" : "",
            ]
                .filter(Boolean)
                .join(" ")}
            style={
                {
                    "--dwell-progress": progress,
                } as CSSProperties
            }
            onClick={handleSelect}
        >
            <span
                className="lesson-question-option-progress"
                aria-hidden="true"
            />

            <span className="lesson-question-letter" aria-hidden="true">
                {String.fromCharCode(65 + index)}
            </span>

            <span className="lesson-question-option-content">
                <MarkdownContent>{option}</MarkdownContent>
            </span>
        </button>
    );
}

interface LessonBlockRendererProps {
    block: LessonBlockLike;

    /**
     * Determina si el usuario puede seleccionar opciones.
     * En la vista previa docente debe ser false.
     */
    interactive?: boolean;

    /**
     * Duración de fijación configurada para el estudiante.
     */
    dwellDurationMs?: number;

    /**
     * Mientras la validación continúe en el frontend,
     * permite decidir si se muestra correcto/incorrecto.
     *
     * En la vista del estudiante debería ser false hasta
     * implementar validación en FastAPI.
     */
    showCorrectness?: boolean;
}

export function LessonBlockRenderer({
    block,
    interactive = true,
    dwellDurationMs,
    showCorrectness = false,
}: LessonBlockRendererProps) {
    const [selectedOption, setSelectedOption] = useState<number | null>(null);

    if (block.type === "imagen") {
        if (!block.image_url) {
            return (
                <section
                    className="lesson-information"
                    aria-label="Imagen no disponible"
                >
                    <span className="lesson-block-label">Imagen</span>

                    <p>No se pudo cargar esta imagen.</p>
                </section>
            );
        }

        return (
            <figure className="lesson-image">
                <img
                    src={block.image_url}
                    alt="Contenido visual de la lección"
                />
            </figure>
        );
    }

    const { metadata, markdown } = decodeTextBlock(block.content);

    if (metadata.kind === "question") {
        const question = metadata.question;
        const options = question?.options ?? [];
        const hasAnswered = selectedOption !== null;

        return (
            <section className="lesson-question" aria-label="Pregunta">
                <span className="lesson-block-label">Pregunta</span>

                <div className="lesson-markdown">
                    <MarkdownContent>{markdown}</MarkdownContent>
                </div>

                {options.length > 0 ? (
                    <div className="lesson-question-options">
                        {options.map((option, index) => (
                            <DwellQuestionOption
                                key={`${index}-${option}`}
                                option={option}
                                index={index}
                                selectedOption={selectedOption}
                                correctOption={question?.correctOption}
                                interactive={interactive}
                                dwellDurationMs={dwellDurationMs}
                                showCorrectness={showCorrectness}
                                onSelect={setSelectedOption}
                            />
                        ))}
                    </div>
                ) : (
                    <p className="lesson-question-feedback">
                        Esta pregunta todavía no tiene opciones de respuesta.
                    </p>
                )}

                {hasAnswered && !showCorrectness && (
                    <p
                        role="status"
                        aria-live="polite"
                        className="lesson-question-feedback"
                    >
                        Respuesta seleccionada.
                    </p>
                )}

                {hasAnswered &&
                    showCorrectness &&
                    question?.correctOption !== undefined && (
                        <p
                            role="status"
                            aria-live="polite"
                            className="lesson-question-feedback"
                        >
                            {selectedOption === question.correctOption
                                ? "¡Muy bien! Respuesta correcta."
                                : "Esa no es la respuesta correcta."}
                        </p>
                    )}
            </section>
        );
    }

    return (
        <section className="lesson-information" aria-label="Información">
            <span className="lesson-block-label">Información</span>

            <div className="lesson-markdown">
                <MarkdownContent>{markdown}</MarkdownContent>
            </div>
        </section>
    );
}
