import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type SemanticBlockType = "information" | "question";

export interface QuestionMetadata {
    options: string[];
    correctOption?: number;
}

interface EncodedMetadata {
    kind: SemanticBlockType;
    question?: QuestionMetadata;
}

export interface LessonBlockLike {
    type: "texto" | "imagen" | string;
    content?: string | null;
    image_url?: string | null;
}

const METADATA_PATTERN = /^<!-- iris:block (.+?) -->\n?/;

export function encodeInformation(markdown: string): string {
    return encodeTextBlock({ kind: "information" }, markdown);
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
            metadata: { kind: "information" },
            markdown: value,
        };
    }

    try {
        return {
            metadata: JSON.parse(match[1]) as EncodedMetadata,
            markdown: value.replace(METADATA_PATTERN, ""),
        };
    } catch {
        return {
            metadata: { kind: "information" },
            markdown: value,
        };
    }
}

interface LessonBlockRendererProps {
    block: LessonBlockLike;
    interactive?: boolean;
}

export function LessonBlockRenderer({
    block,
    interactive = true,
}: LessonBlockRendererProps) {
    const [selectedOption, setSelectedOption] = useState<number | null>(null);

    if (block.type === "imagen") {
        return (
            <figure className="lesson-image">
                <img
                    src={block.image_url ?? ""}
                    alt="Contenido visual de la lección"
                />
            </figure>
        );
    }

    const { metadata, markdown } = decodeTextBlock(block.content);

    if (metadata.kind === "question") {
        const question = metadata.question;
        const hasAnswered = selectedOption !== null;

        return (
            <section className="lesson-question" aria-label="Pregunta">
                <span className="lesson-block-label">Pregunta</span>

                <div className="lesson-markdown">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {markdown}
                    </ReactMarkdown>
                </div>

                <div className="lesson-question-options">
                    {(question?.options ?? []).map((option, index) => {
                        const isSelected = selectedOption === index;
                        const isCorrect =
                            hasAnswered && question?.correctOption === index;
                        const isIncorrect =
                            hasAnswered &&
                            isSelected &&
                            question?.correctOption !== undefined &&
                            question.correctOption !== index;

                        return (
                            <button
                                key={`${option}-${index}`}
                                type="button"
                                disabled={!interactive || hasAnswered}
                                aria-pressed={isSelected}
                                className={[
                                    "lesson-question-option",
                                    isSelected ? "is-selected" : "",
                                    isCorrect ? "is-correct" : "",
                                    isIncorrect ? "is-incorrect" : "",
                                ]
                                    .filter(Boolean)
                                    .join(" ")}
                                onClick={() => setSelectedOption(index)}
                            >
                                <span>{String.fromCharCode(65 + index)}</span>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {option}
                                </ReactMarkdown>
                            </button>
                        );
                    })}
                </div>

                {hasAnswered && question?.correctOption !== undefined && (
                    <p role="status" className="lesson-question-feedback">
                        {selectedOption === question.correctOption
                            ? "¡Muy bien! Respuesta correcta."
                            : "Inténtalo nuevamente en la próxima ronda."}
                    </p>
                )}
            </section>
        );
    }

    return (
        <section className="lesson-information" aria-label="Información">
            <span className="lesson-block-label">Información</span>

            <div className="lesson-markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {markdown}
                </ReactMarkdown>
            </div>
        </section>
    );
}
