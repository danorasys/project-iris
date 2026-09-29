import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
    DragDropContext,
    Draggable,
    Droppable,
    type DropResult,
} from "@hello-pangea/dnd";
import {
    ChevronLeft,
    ChevronRight,
    Eye,
    GripVertical,
    HelpCircle,
    ImagePlus,
    Info,
    Plus,
    Save,
    Send,
    Trash2,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import {
    decodeTextBlock,
    encodeInformation,
    encodeQuestion,
    LessonBlockRenderer,
} from "@/features/lessons/components/LessonBlockRenderer";
import { ApiError } from "@/shared/api/httpClient";
import {
    type ContentBlockInput,
    useCreateLesson,
    useLessonDetail,
    useUpdateLesson,
    useUploadLessonImage,
} from "@/shared/api/hooks/useLessonsApi";
import { lessonImagePath } from "@/shared/api/mediaPaths";
import { AuthImage } from "@/shared/ui/AuthImage";

import styles from "./CourseBuilderPage.module.css";

type EditorBlock =
    | {
          id: string;
          kind: "information";
          markdown: string;
      }
    | {
          id: string;
          kind: "question";
          markdown: string;
          options: string[];
          correctOption?: number;
      }
    | {
          id: string;
          kind: "image";
          imageFile: string;
      };

function createId(): string {
    return crypto.randomUUID();
}

function getErrorMessage(error: unknown, fallback: string): string {
    return error instanceof ApiError ? error.message : fallback;
}

function toApiBlocks(blocks: EditorBlock[]): ContentBlockInput[] {
    return blocks.map((block, orderIndex) => {
        if (block.kind === "image") {
            return {
                type: "imagen",
                image_file: block.imageFile,
                order_index: orderIndex,
            };
        }

        if (block.kind === "question") {
            const options = block.options
                .map((option) => option.trim())
                .filter(Boolean);

            return {
                type: "texto",
                content: encodeQuestion(
                    block.markdown.trim() || "## Escribe la pregunta",
                    options,
                    block.correctOption,
                ),
                order_index: orderIndex,
            };
        }

        return {
            type: "texto",
            content: encodeInformation(
                block.markdown.trim() || "Escribe aquí el contenido.",
            ),
            order_index: orderIndex,
        };
    });
}

export default function LessonEditorPage() {
    const { classroomId, lessonId: lessonIdParam } = useParams<{
        classroomId: string;
        lessonId?: string;
    }>();

    const navigate = useNavigate();
    const isEditMode = Boolean(lessonIdParam);

    const createLesson = useCreateLesson(classroomId ?? "");
    const lessonQuery = useLessonDetail(lessonIdParam);
    const updateLesson = useUpdateLesson();
    const uploadImage = useUploadLessonImage();

    const [lessonId, setLessonId] = useState<string | null>(
        lessonIdParam ?? null,
    );

    const [title, setTitle] = useState("");
    const [blocks, setBlocks] = useState<EditorBlock[]>([]);

    const [lessonLoaded, setLessonLoaded] = useState(false);

    const [previewEnabled, setPreviewEnabled] = useState(true);

    const [previewIndex, setPreviewIndex] = useState(0);

    const [error, setError] = useState<string | null>(null);

    const [message, setMessage] = useState<string | null>(null);

    const imageInputRef = useRef<HTMLInputElement>(null);

    /*
     * Carga una lección existente una sola vez.
     * Los refetch posteriores no sobrescriben lo que el
     * docente esté editando localmente.
     */
    useEffect(() => {
        if (!isEditMode || lessonLoaded || !lessonQuery.data) {
            return;
        }

        const lesson = lessonQuery.data;

        const editorBlocks: EditorBlock[] = [...lesson.blocks]
            .sort((left, right) => left.order_index - right.order_index)
            .map((block): EditorBlock => {
                if (block.type === "imagen") {
                    return {
                        id: createId(),
                        kind: "image",
                        imageFile: block.image_file ?? "",
                    };
                }

                const decoded = decodeTextBlock(block.content);

                if (decoded.metadata.kind === "question") {
                    const storedOptions = decoded.metadata.question?.options;

                    return {
                        id: createId(),
                        kind: "question",
                        markdown: decoded.markdown,
                        options:
                            storedOptions && storedOptions.length > 0
                                ? storedOptions
                                : ["Opción A", "Opción B"],
                        correctOption: decoded.metadata.question?.correctOption,
                    };
                }

                return {
                    id: createId(),
                    kind: "information",
                    markdown: decoded.markdown,
                };
            });

        setLessonId(lesson.id);
        setTitle(lesson.title);
        setBlocks(editorBlocks);
        setLessonLoaded(true);
    }, [isEditMode, lessonLoaded, lessonQuery.data]);

    const previewBlocks = useMemo(() => toApiBlocks(blocks), [blocks]);

    const currentPreviewBlock = previewBlocks[previewIndex];

    const previewIsFirst = previewIndex === 0;

    const previewIsLast =
        previewBlocks.length === 0 || previewIndex === previewBlocks.length - 1;

    /*
     * Si se elimina el último bloque visible, ajusta el
     * índice para que el preview no quede fuera del arreglo.
     */
    useEffect(() => {
        setPreviewIndex((current) =>
            Math.min(current, Math.max(previewBlocks.length - 1, 0)),
        );
    }, [previewBlocks.length]);

    const goBack = () => {
        navigate(
            classroomId
                ? `/teacher/classrooms/${classroomId}`
                : "/teacher/home",
        );
    };

    const createDraft = () => {
        if (!classroomId || !title.trim()) {
            return;
        }

        setError(null);
        setMessage(null);

        createLesson.mutate(
            {
                title: title.trim(),
                blocks: [],
            },
            {
                onSuccess: (lesson) => {
                    setLessonId(lesson.id);
                    setLessonLoaded(true);

                    setMessage(
                        "Lección creada como borrador. Ya puedes añadir contenido.",
                    );
                },

                onError: (reason) => {
                    setError(
                        getErrorMessage(reason, "No se pudo crear la lección."),
                    );
                },
            },
        );
    };

    const updateBlock = (
        blockId: string,
        updater: (block: EditorBlock) => EditorBlock,
    ) => {
        setBlocks((current) =>
            current.map((block) =>
                block.id === blockId ? updater(block) : block,
            ),
        );
    };

    const removeBlock = (blockId: string) => {
        setBlocks((current) => current.filter((block) => block.id !== blockId));
    };

    const handleDragEnd = ({ source, destination }: DropResult) => {
        if (!destination || source.index === destination.index) {
            return;
        }

        setBlocks((current) => {
            const next = [...current];

            const [movedBlock] = next.splice(source.index, 1);

            next.splice(destination.index, 0, movedBlock);

            return next;
        });
    };

    const addInformationBlock = () => {
        setBlocks((current) => [
            ...current,
            {
                id: createId(),
                kind: "information",
                markdown:
                    "## Nuevo contenido\n\nEscribe aquí la información usando **Markdown**.",
            },
        ]);
    };

    const addQuestionBlock = () => {
        setBlocks((current) => [
            ...current,
            {
                id: createId(),
                kind: "question",
                markdown: "## ¿Cuál es la respuesta correcta?",
                options: ["Opción A", "Opción B", "Opción C"],
                correctOption: 0,
            },
        ]);
    };

    const selectImage = () => {
        if (!lessonId) {
            setError("Primero debes crear la lección para subir imágenes.");

            return;
        }

        imageInputRef.current?.click();
    };

    const handleImageSelected = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];

        event.target.value = "";

        if (!file || !lessonId) {
            return;
        }

        setError(null);
        setMessage(null);

        uploadImage.mutate(
            {
                lessonId,
                file,
            },
            {
                onSuccess: (response) => {
                    const imageFile = response.image_file;

                    if (!imageFile) {
                        console.error(
                            "Respuesta inesperada al subir la imagen:",
                            response,
                        );

                        setError(
                            "La imagen se subió, pero el servidor no devolvió el nombre del archivo.",
                        );

                        return;
                    }

                    setBlocks((current) => [
                        ...current,
                        {
                            id: createId(),
                            kind: "image",
                            imageFile,
                        },
                    ]);

                    setError(null);

                    setMessage("Imagen añadida a la lección.");
                },

                onError: (reason) => {
                    setError(
                        getErrorMessage(reason, "No se pudo subir la imagen."),
                    );
                },
            },
        );
    };

    const updateQuestionOption = (
        blockId: string,
        optionIndex: number,
        value: string,
    ) => {
        updateBlock(blockId, (block) => {
            if (block.kind !== "question") {
                return block;
            }

            const options = [...block.options];

            options[optionIndex] = value;

            return {
                ...block,
                options,
            };
        });
    };

    const selectCorrectOption = (blockId: string, optionIndex: number) => {
        updateBlock(blockId, (block) =>
            block.kind === "question"
                ? {
                      ...block,
                      correctOption: optionIndex,
                  }
                : block,
        );
    };

    const addQuestionOption = (blockId: string) => {
        updateBlock(blockId, (block) => {
            if (block.kind !== "question") {
                return block;
            }

            return {
                ...block,
                options: [
                    ...block.options,
                    `Opción ${block.options.length + 1}`,
                ],
            };
        });
    };

    const removeQuestionOption = (blockId: string, optionIndex: number) => {
        updateBlock(blockId, (block) => {
            if (block.kind !== "question" || block.options.length <= 2) {
                return block;
            }

            const options = block.options.filter(
                (_, index) => index !== optionIndex,
            );

            let correctOption = block.correctOption;

            if (correctOption === optionIndex) {
                correctOption = undefined;
            } else if (
                correctOption !== undefined &&
                correctOption > optionIndex
            ) {
                correctOption -= 1;
            }

            return {
                ...block,
                options,
                correctOption,
            };
        });
    };

    const validateForPublish = (): string | null => {
        if (!title.trim()) {
            return "La lección necesita un título.";
        }

        if (blocks.length === 0) {
            return "Añade al menos un bloque antes de publicar.";
        }

        for (const block of blocks) {
            if (block.kind !== "image" && !block.markdown.trim()) {
                return "Los bloques de texto no pueden estar vacíos.";
            }

            if (block.kind === "image" && !block.imageFile) {
                return "Hay una imagen que no se cargó correctamente.";
            }

            if (block.kind === "question") {
                const validOptions = block.options.filter((option) =>
                    option.trim(),
                );

                if (validOptions.length < 2) {
                    return "Cada pregunta necesita al menos dos opciones.";
                }

                if (block.correctOption === undefined) {
                    return "Selecciona una respuesta correcta para cada pregunta.";
                }

                if (!block.options[block.correctOption]?.trim()) {
                    return "La respuesta correcta no puede estar vacía.";
                }
            }
        }

        return null;
    };

    const saveLesson = (publish = false) => {
        if (!lessonId) {
            return;
        }

        if (!title.trim()) {
            setError("La lección necesita un título.");

            return;
        }

        if (publish) {
            const validationError = validateForPublish();

            if (validationError) {
                setError(validationError);
                return;
            }
        }

        setError(null);
        setMessage(null);

        updateLesson.mutate(
            {
                lessonId,
                body: {
                    title: title.trim(),
                    blocks: toApiBlocks(blocks),

                    ...(publish
                        ? {
                              status: "publicada" as const,
                          }
                        : {}),
                },
            },
            {
                onSuccess: () => {
                    if (publish) {
                        goBack();
                        return;
                    }

                    setMessage("Los cambios se guardaron correctamente.");
                },

                onError: (reason) => {
                    setError(
                        getErrorMessage(
                            reason,
                            "No se pudo guardar la lección.",
                        ),
                    );
                },
            },
        );
    };

    const renderPreviewBlock = () => {
        if (!currentPreviewBlock) {
            return (
                <div className={styles.previewEmpty}>
                    <span>La vista previa está vacía</span>

                    <p>
                        Añade información, preguntas o imágenes para visualizar
                        la lección.
                    </p>
                </div>
            );
        }

        if (currentPreviewBlock.type === "imagen") {
            return (
                <figure className="lesson-image">
                    <AuthImage
                        path={
                            lessonId && currentPreviewBlock.image_file
                                ? lessonImagePath(
                                      lessonId,
                                      currentPreviewBlock.image_file,
                                  )
                                : null
                        }
                        alt="Contenido visual de la lección"
                        fallback={<p>No se pudo cargar esta imagen.</p>}
                    />
                </figure>
            );
        }

        return (
            <LessonBlockRenderer
                key={`${previewIndex}-${currentPreviewBlock.type}`}
                block={currentPreviewBlock}
                interactive={false}
                showCorrectness={false}
            />
        );
    };

    if (isEditMode && lessonQuery.isLoading && !lessonLoaded) {
        return (
            <main className={styles.page}>
                <div className={styles.courseForm}>
                    <div className={styles.emptyState}>
                        Cargando la lección…
                    </div>
                </div>
            </main>
        );
    }

    if (isEditMode && lessonQuery.isError && !lessonLoaded) {
        return (
            <main className={styles.page}>
                <div className={styles.courseForm}>
                    <p className={styles.error} role="alert">
                        No se pudo cargar esta lección. Puede que ya no exista o
                        que no tengas acceso.
                    </p>

                    <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={goBack}
                    >
                        <ChevronLeft size={20} />
                        Volver al aula
                    </button>
                </div>
            </main>
        );
    }

    return (
        <main className={styles.page}>
            <header className={styles.header}>
                <div>
                    <span className={styles.eyebrow}>Panel docente</span>

                    <h1>{isEditMode ? "Editar lección" : "Crear lección"}</h1>

                    <p>
                        Organiza el contenido con bloques arrastrables y
                        comprueba cómo lo verá el estudiante.
                    </p>
                </div>

                <div className={styles.headerControls}>
                    <button
                        type="button"
                        className={styles.previewToggle}
                        onClick={goBack}
                    >
                        <ChevronLeft size={20} />
                        Volver al aula
                    </button>

                    <button
                        type="button"
                        className={styles.previewToggle}
                        onClick={() => setPreviewEnabled((current) => !current)}
                    >
                        <Eye size={20} />

                        {previewEnabled
                            ? "Ocultar vista previa"
                            : "Mostrar vista previa"}
                    </button>
                </div>
            </header>

            <div
                className={`${styles.workspace} ${
                    previewEnabled ? styles.withPreview : ""
                }`}
            >
                <section className={styles.builder}>
                    <div className={styles.lessonHeader}>
                        <div>
                            <span className={styles.step}>
                                {lessonId
                                    ? "Lección guardada"
                                    : "Nueva lección"}
                            </span>

                            <h2>
                                {isEditMode
                                    ? "Editando contenido"
                                    : "Primera versión"}
                            </h2>
                        </div>

                        <input
                            className={styles.lessonTitle}
                            aria-label="Título de la lección"
                            value={title}
                            maxLength={200}
                            placeholder="Título de la lección"
                            onChange={(event) => setTitle(event.target.value)}
                        />
                    </div>

                    {!lessonId ? (
                        <button
                            type="button"
                            className={styles.primaryButton}
                            disabled={
                                createLesson.isPending ||
                                !title.trim() ||
                                !classroomId
                            }
                            onClick={createDraft}
                        >
                            <Plus size={20} />

                            {createLesson.isPending
                                ? "Creando borrador…"
                                : "Crear lección y abrir editor"}
                        </button>
                    ) : (
                        <>
                            <div className={styles.blockPalette}>
                                <button
                                    type="button"
                                    onClick={addInformationBlock}
                                >
                                    <Info size={20} />
                                    Información
                                </button>

                                <button
                                    type="button"
                                    onClick={addQuestionBlock}
                                >
                                    <HelpCircle size={20} />
                                    Pregunta
                                </button>

                                <button
                                    type="button"
                                    disabled={uploadImage.isPending}
                                    onClick={selectImage}
                                >
                                    <ImagePlus size={20} />

                                    {uploadImage.isPending
                                        ? "Subiendo…"
                                        : "Imagen"}
                                </button>

                                <input
                                    ref={imageInputRef}
                                    type="file"
                                    hidden
                                    accept="image/png,image/jpeg,image/webp"
                                    onChange={handleImageSelected}
                                />
                            </div>

                            <DragDropContext onDragEnd={handleDragEnd}>
                                <Droppable droppableId="lesson-blocks">
                                    {(droppable) => (
                                        <div
                                            ref={droppable.innerRef}
                                            {...droppable.droppableProps}
                                            className={styles.blockList}
                                        >
                                            {blocks.map((block, index) => (
                                                <Draggable
                                                    key={block.id}
                                                    draggableId={block.id}
                                                    index={index}
                                                >
                                                    {(draggable, snapshot) => (
                                                        <article
                                                            ref={
                                                                draggable.innerRef
                                                            }
                                                            {...draggable.draggableProps}
                                                            className={`${styles.editorBlock} ${
                                                                snapshot.isDragging
                                                                    ? styles.dragging
                                                                    : ""
                                                            }`}
                                                        >
                                                            <header
                                                                className={
                                                                    styles.blockHeader
                                                                }
                                                            >
                                                                <button
                                                                    type="button"
                                                                    className={
                                                                        styles.dragHandle
                                                                    }
                                                                    aria-label="Arrastrar bloque"
                                                                    {...draggable.dragHandleProps}
                                                                >
                                                                    <GripVertical
                                                                        size={
                                                                            20
                                                                        }
                                                                    />
                                                                </button>

                                                                <strong>
                                                                    {block.kind ===
                                                                        "information" &&
                                                                        "Información"}

                                                                    {block.kind ===
                                                                        "question" &&
                                                                        "Pregunta"}

                                                                    {block.kind ===
                                                                        "image" &&
                                                                        "Imagen"}
                                                                </strong>

                                                                <button
                                                                    type="button"
                                                                    aria-label="Eliminar bloque"
                                                                    onClick={() =>
                                                                        removeBlock(
                                                                            block.id,
                                                                        )
                                                                    }
                                                                >
                                                                    <Trash2
                                                                        size={
                                                                            18
                                                                        }
                                                                    />
                                                                </button>
                                                            </header>

                                                            {block.kind ===
                                                            "image" ? (
                                                                <AuthImage
                                                                    path={
                                                                        lessonId
                                                                            ? lessonImagePath(
                                                                                  lessonId,
                                                                                  block.imageFile,
                                                                              )
                                                                            : null
                                                                    }
                                                                    alt="Contenido de la lección"
                                                                    className={
                                                                        styles.editorImage
                                                                    }
                                                                    fallback={
                                                                        <p>
                                                                            No
                                                                            se
                                                                            pudo
                                                                            cargar
                                                                            la
                                                                            imagen.
                                                                        </p>
                                                                    }
                                                                />
                                                            ) : (
                                                                <textarea
                                                                    value={
                                                                        block.markdown
                                                                    }
                                                                    rows={8}
                                                                    placeholder="Puedes utilizar títulos, listas, negrita, citas y enlaces Markdown."
                                                                    onChange={(
                                                                        event,
                                                                    ) =>
                                                                        updateBlock(
                                                                            block.id,
                                                                            (
                                                                                current,
                                                                            ) =>
                                                                                current.kind ===
                                                                                "image"
                                                                                    ? current
                                                                                    : {
                                                                                          ...current,
                                                                                          markdown:
                                                                                              event
                                                                                                  .target
                                                                                                  .value,
                                                                                      },
                                                                        )
                                                                    }
                                                                />
                                                            )}

                                                            {block.kind ===
                                                                "question" && (
                                                                <div
                                                                    className={
                                                                        styles.optionsEditor
                                                                    }
                                                                >
                                                                    {block.options.map(
                                                                        (
                                                                            option,
                                                                            optionIndex,
                                                                        ) => (
                                                                            <label
                                                                                key={`${block.id}-${optionIndex}`}
                                                                            >
                                                                                <input
                                                                                    type="radio"
                                                                                    name={`correct-${block.id}`}
                                                                                    checked={
                                                                                        block.correctOption ===
                                                                                        optionIndex
                                                                                    }
                                                                                    aria-label={`Marcar opción ${
                                                                                        optionIndex +
                                                                                        1
                                                                                    } como correcta`}
                                                                                    onChange={() =>
                                                                                        selectCorrectOption(
                                                                                            block.id,
                                                                                            optionIndex,
                                                                                        )
                                                                                    }
                                                                                />

                                                                                <input
                                                                                    type="text"
                                                                                    value={
                                                                                        option
                                                                                    }
                                                                                    aria-label={`Opción ${
                                                                                        optionIndex +
                                                                                        1
                                                                                    }`}
                                                                                    onChange={(
                                                                                        event,
                                                                                    ) =>
                                                                                        updateQuestionOption(
                                                                                            block.id,
                                                                                            optionIndex,
                                                                                            event
                                                                                                .target
                                                                                                .value,
                                                                                        )
                                                                                    }
                                                                                />

                                                                                <button
                                                                                    type="button"
                                                                                    className={
                                                                                        styles.removeOption
                                                                                    }
                                                                                    disabled={
                                                                                        block
                                                                                            .options
                                                                                            .length <=
                                                                                        2
                                                                                    }
                                                                                    aria-label={`Eliminar opción ${
                                                                                        optionIndex +
                                                                                        1
                                                                                    }`}
                                                                                    onClick={() =>
                                                                                        removeQuestionOption(
                                                                                            block.id,
                                                                                            optionIndex,
                                                                                        )
                                                                                    }
                                                                                >
                                                                                    <Trash2
                                                                                        size={
                                                                                            16
                                                                                        }
                                                                                    />
                                                                                </button>
                                                                            </label>
                                                                        ),
                                                                    )}

                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            addQuestionOption(
                                                                                block.id,
                                                                            )
                                                                        }
                                                                    >
                                                                        <Plus
                                                                            size={
                                                                                16
                                                                            }
                                                                        />
                                                                        Añadir
                                                                        opción
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </article>
                                                    )}
                                                </Draggable>
                                            ))}

                                            {droppable.placeholder}

                                            {blocks.length === 0 && (
                                                <div
                                                    className={
                                                        styles.emptyState
                                                    }
                                                >
                                                    Añade información, preguntas
                                                    o imágenes para comenzar.
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </Droppable>
                            </DragDropContext>

                            <footer className={styles.actions}>
                                <button
                                    type="button"
                                    disabled={
                                        updateLesson.isPending || !title.trim()
                                    }
                                    onClick={() => saveLesson(false)}
                                >
                                    <Save size={20} />

                                    {updateLesson.isPending
                                        ? "Guardando…"
                                        : "Guardar borrador"}
                                </button>

                                <button
                                    type="button"
                                    className={styles.publishButton}
                                    disabled={
                                        updateLesson.isPending ||
                                        !title.trim() ||
                                        blocks.length === 0
                                    }
                                    onClick={() => saveLesson(true)}
                                >
                                    <Send size={20} />
                                    Publicar lección
                                </button>
                            </footer>
                        </>
                    )}
                </section>

                {previewEnabled && (
                    <aside className={styles.preview}>
                        <div className={styles.previewDevice}>
                            <div
                                className={styles.previewSpeaker}
                                aria-hidden="true"
                            />

                            <header className={styles.previewHeader}>
                                <div>
                                    <span>Vista del estudiante</span>

                                    <strong>{title || "Nueva lección"}</strong>
                                </div>

                                {previewBlocks.length > 0 && (
                                    <small>
                                        {previewIndex + 1} de{" "}
                                        {previewBlocks.length}
                                    </small>
                                )}
                            </header>

                            <div
                                className={styles.previewProgress}
                                aria-hidden="true"
                            >
                                <div
                                    style={{
                                        width:
                                            previewBlocks.length > 0
                                                ? `${
                                                      ((previewIndex + 1) /
                                                          previewBlocks.length) *
                                                      100
                                                  }%`
                                                : "0%",
                                    }}
                                />
                            </div>

                            <div className={styles.previewContent}>
                                {renderPreviewBlock()}
                            </div>

                            <footer className={styles.previewNavigation}>
                                <button
                                    type="button"
                                    disabled={previewIsFirst}
                                    onClick={() =>
                                        setPreviewIndex((current) =>
                                            Math.max(current - 1, 0),
                                        )
                                    }
                                >
                                    <ChevronLeft size={18} />
                                    Anterior
                                </button>

                                <span>
                                    {previewBlocks.length === 0
                                        ? "Sin contenido"
                                        : previewIsLast
                                          ? "Último bloque"
                                          : "Continúa"}
                                </span>

                                <button
                                    type="button"
                                    disabled={previewIsLast}
                                    onClick={() =>
                                        setPreviewIndex((current) =>
                                            Math.min(
                                                current + 1,
                                                previewBlocks.length - 1,
                                            ),
                                        )
                                    }
                                >
                                    Siguiente
                                    <ChevronRight size={18} />
                                </button>
                            </footer>
                        </div>
                    </aside>
                )}
            </div>

            {error && (
                <p className={styles.error} role="alert">
                    {error}
                </p>
            )}

            {message && (
                <p className={styles.success} role="status">
                    {message}
                </p>
            )}
        </main>
    );
}
