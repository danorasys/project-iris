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
import { ApiError } from "@/shared/api/httpClient";
import {
    type ContentBlockInput,
    useCreateLesson,
    useLessonDetail,
    useUpdateLesson,
    useUploadLessonImage,
} from "@/shared/api/hooks/useLessonsApi";
import {
    decodeTextBlock,
    encodeInformation,
    encodeQuestion,
    LessonBlockRenderer,
} from "@/features/lessons/components/LessonBlockRenderer";
import styles from "./CourseBuilderPage.module.css";

type EditorBlock =
    | { id: string; kind: "information"; markdown: string }
    | {
          id: string;
          kind: "question";
          markdown: string;
          options: string[];
          correctOption?: number;
      }
    | { id: string; kind: "image"; imageUrl: string };

const createId = () => crypto.randomUUID();
const errorMessage = (error: unknown, fallback: string) =>
    error instanceof ApiError ? error.message : fallback;

function toApiBlocks(blocks: EditorBlock[]): ContentBlockInput[] {
    return blocks.map((block, orderIndex) => {
        if (block.kind === "image")
            return {
                type: "imagen",
                image_url: block.imageUrl,
                order_index: orderIndex,
            };
        if (block.kind === "question")
            return {
                type: "texto",
                content: encodeQuestion(
                    block.markdown.trim() || "## Escribe la pregunta",
                    block.options.map((value) => value.trim()).filter(Boolean),
                    block.correctOption,
                ),
                order_index: orderIndex,
            };
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
    const [loaded, setLoaded] = useState(false);
    const [previewEnabled, setPreviewEnabled] = useState(true);
    const [previewIndex, setPreviewIndex] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isEditMode || loaded || !lessonQuery.data) return;
        const lesson = lessonQuery.data;
        setTitle(lesson.title);
        setBlocks(
            [...lesson.blocks]
                .sort((a, b) => a.order_index - b.order_index)
                .map((block): EditorBlock => {
                    if (block.type === "imagen")
                        return {
                            id: createId(),
                            kind: "image",
                            imageUrl: block.image_url ?? "",
                        };
                    const decoded = decodeTextBlock(block.content);
                    if (decoded.metadata.kind === "question")
                        return {
                            id: createId(),
                            kind: "question",
                            markdown: decoded.markdown,
                            options: decoded.metadata.question?.options.length
                                ? decoded.metadata.question.options
                                : ["Opción A", "Opción B"],
                            correctOption:
                                decoded.metadata.question?.correctOption,
                        };
                    return {
                        id: createId(),
                        kind: "information",
                        markdown: decoded.markdown,
                    };
                }),
        );
        setLessonId(lesson.id);
        setLoaded(true);
    }, [isEditMode, loaded, lessonQuery.data]);

    const previewBlocks = useMemo(() => toApiBlocks(blocks), [blocks]);
    const currentPreviewBlock = previewBlocks[previewIndex];
    const previewIsFirst = previewIndex === 0;
    const previewIsLast =
        !previewBlocks.length || previewIndex === previewBlocks.length - 1;

    useEffect(() => {
        setPreviewIndex((current) =>
            Math.min(current, Math.max(previewBlocks.length - 1, 0)),
        );
    }, [previewBlocks.length]);

    const updateBlock = (
        id: string,
        updater: (block: EditorBlock) => EditorBlock,
    ) =>
        setBlocks((current) =>
            current.map((block) => (block.id === id ? updater(block) : block)),
        );

    const handleDragEnd = ({ source, destination }: DropResult) => {
        if (!destination || source.index === destination.index) return;
        setBlocks((current) => {
            const next = [...current];
            const [moved] = next.splice(source.index, 1);
            next.splice(destination.index, 0, moved);
            return next;
        });
    };

    const createDraft = () => {
        if (!classroomId || !title.trim()) return;
        createLesson.mutate(
            { title: title.trim(), blocks: [] },
            {
                onSuccess: (lesson) => {
                    setLessonId(lesson.id);
                    setLoaded(true);
                    setMessage("Lección creada como borrador.");
                },
                onError: (reason) =>
                    setError(
                        errorMessage(reason, "No se pudo crear la lección."),
                    ),
            },
        );
    };

    const selectImage = () =>
        lessonId
            ? imageInputRef.current?.click()
            : setError("Primero crea la lección.");
    const uploadSelectedImage = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file || !lessonId) return;
        uploadImage.mutate(
            { lessonId, file },
            {
                onSuccess: ({ image_url }) =>
                    setBlocks((current) => [
                        ...current,
                        { id: createId(), kind: "image", imageUrl: image_url },
                    ]),
                onError: (reason) =>
                    setError(
                        errorMessage(reason, "No se pudo subir la imagen."),
                    ),
            },
        );
    };

    const save = (publish = false) => {
        if (!lessonId || !title.trim()) return;
        setError(null);
        setMessage(null);
        updateLesson.mutate(
            {
                lessonId,
                body: {
                    title: title.trim(),
                    blocks: toApiBlocks(blocks),
                    ...(publish ? { status: "publicada" as const } : {}),
                },
            },
            {
                onSuccess: () =>
                    publish
                        ? navigate(`/teacher/classrooms/${classroomId}`)
                        : setMessage("Cambios guardados."),
                onError: (reason) =>
                    setError(
                        errorMessage(reason, "No se pudo guardar la lección."),
                    ),
            },
        );
    };

    if (isEditMode && lessonQuery.isLoading && !loaded)
        return (
            <main className={styles.page}>
                <div className={styles.courseForm}>Cargando lección…</div>
            </main>
        );
    if (isEditMode && lessonQuery.isError && !loaded)
        return (
            <main className={styles.page}>
                <div className={styles.courseForm}>
                    <p>No se pudo cargar la lección.</p>
                </div>
            </main>
        );

    return (
        <main className={styles.page}>
            <header className={styles.header}>
                <div>
                    <span className={styles.eyebrow}>Panel docente</span>
                    <h1>{isEditMode ? "Editar lección" : "Crear lección"}</h1>
                    <p>
                        Organiza el contenido y comprueba un bloque a la vez
                        cómo lo verá el estudiante.
                    </p>
                </div>
                <div className={styles.headerControls}>
                    <button
                        type="button"
                        className={styles.previewToggle}
                        onClick={() =>
                            navigate(
                                classroomId
                                    ? `/teacher/classrooms/${classroomId}`
                                    : "/teacher/home",
                            )
                        }
                    >
                        <ChevronLeft size={20} /> Volver al aula
                    </button>
                    <button
                        type="button"
                        className={styles.previewToggle}
                        onClick={() => setPreviewEnabled((value) => !value)}
                    >
                        <Eye size={20} />{" "}
                        {previewEnabled
                            ? "Ocultar vista previa"
                            : "Mostrar vista previa"}
                    </button>
                </div>
            </header>

            <div
                className={`${styles.workspace} ${previewEnabled ? styles.withPreview : ""}`}
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
                            disabled={!title.trim() || createLesson.isPending}
                            onClick={createDraft}
                        >
                            <Plus size={20} /> Crear lección y abrir editor
                        </button>
                    ) : (
                        <>
                            <div className={styles.blockPalette}>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setBlocks((current) => [
                                            ...current,
                                            {
                                                id: createId(),
                                                kind: "information",
                                                markdown:
                                                    "## Nuevo contenido\n\nEscribe aquí usando **Markdown**.",
                                            },
                                        ])
                                    }
                                >
                                    <Info size={20} /> Información
                                </button>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setBlocks((current) => [
                                            ...current,
                                            {
                                                id: createId(),
                                                kind: "question",
                                                markdown:
                                                    "## ¿Cuál es la respuesta correcta?",
                                                options: [
                                                    "Opción A",
                                                    "Opción B",
                                                    "Opción C",
                                                ],
                                                correctOption: 0,
                                            },
                                        ])
                                    }
                                >
                                    <HelpCircle size={20} /> Pregunta
                                </button>
                                <button type="button" onClick={selectImage}>
                                    <ImagePlus size={20} /> Imagen
                                </button>
                                <input
                                    ref={imageInputRef}
                                    hidden
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    onChange={uploadSelectedImage}
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
                                                            className={`${styles.editorBlock} ${snapshot.isDragging ? styles.dragging : ""}`}
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
                                                                    "information"
                                                                        ? "Información"
                                                                        : block.kind ===
                                                                            "question"
                                                                          ? "Pregunta"
                                                                          : "Imagen"}
                                                                </strong>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setBlocks(
                                                                            (
                                                                                current,
                                                                            ) =>
                                                                                current.filter(
                                                                                    (
                                                                                        item,
                                                                                    ) =>
                                                                                        item.id !==
                                                                                        block.id,
                                                                                ),
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
                                                                <img
                                                                    src={
                                                                        block.imageUrl
                                                                    }
                                                                    alt="Contenido"
                                                                    className={
                                                                        styles.editorImage
                                                                    }
                                                                />
                                                            ) : (
                                                                <textarea
                                                                    value={
                                                                        block.markdown
                                                                    }
                                                                    rows={8}
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
                                                                                key={
                                                                                    optionIndex
                                                                                }
                                                                            >
                                                                                <input
                                                                                    type="radio"
                                                                                    name={`correct-${block.id}`}
                                                                                    checked={
                                                                                        block.correctOption ===
                                                                                        optionIndex
                                                                                    }
                                                                                    onChange={() =>
                                                                                        updateBlock(
                                                                                            block.id,
                                                                                            (
                                                                                                current,
                                                                                            ) =>
                                                                                                current.kind ===
                                                                                                "question"
                                                                                                    ? {
                                                                                                          ...current,
                                                                                                          correctOption:
                                                                                                              optionIndex,
                                                                                                      }
                                                                                                    : current,
                                                                                        )
                                                                                    }
                                                                                />
                                                                                <input
                                                                                    type="text"
                                                                                    value={
                                                                                        option
                                                                                    }
                                                                                    onChange={(
                                                                                        event,
                                                                                    ) =>
                                                                                        updateBlock(
                                                                                            block.id,
                                                                                            (
                                                                                                current,
                                                                                            ) => {
                                                                                                if (
                                                                                                    current.kind !==
                                                                                                    "question"
                                                                                                )
                                                                                                    return current;
                                                                                                const options =
                                                                                                    [
                                                                                                        ...current.options,
                                                                                                    ];
                                                                                                options[
                                                                                                    optionIndex
                                                                                                ] =
                                                                                                    event.target.value;
                                                                                                return {
                                                                                                    ...current,
                                                                                                    options,
                                                                                                };
                                                                                            },
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
                                                                                    onClick={() =>
                                                                                        updateBlock(
                                                                                            block.id,
                                                                                            (
                                                                                                current,
                                                                                            ) =>
                                                                                                current.kind ===
                                                                                                "question"
                                                                                                    ? {
                                                                                                          ...current,
                                                                                                          options:
                                                                                                              current.options.filter(
                                                                                                                  (
                                                                                                                      _,
                                                                                                                      i,
                                                                                                                  ) =>
                                                                                                                      i !==
                                                                                                                      optionIndex,
                                                                                                              ),
                                                                                                          correctOption:
                                                                                                              current.correctOption ===
                                                                                                              optionIndex
                                                                                                                  ? undefined
                                                                                                                  : current.correctOption,
                                                                                                      }
                                                                                                    : current,
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
                                                                            updateBlock(
                                                                                block.id,
                                                                                (
                                                                                    current,
                                                                                ) =>
                                                                                    current.kind ===
                                                                                    "question"
                                                                                        ? {
                                                                                              ...current,
                                                                                              options:
                                                                                                  [
                                                                                                      ...current.options,
                                                                                                      `Opción ${current.options.length + 1}`,
                                                                                                  ],
                                                                                          }
                                                                                        : current,
                                                                            )
                                                                        }
                                                                    >
                                                                        <Plus
                                                                            size={
                                                                                16
                                                                            }
                                                                        />{" "}
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
                                            {!blocks.length && (
                                                <div
                                                    className={
                                                        styles.emptyState
                                                    }
                                                >
                                                    Añade bloques para comenzar.
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </Droppable>
                            </DragDropContext>

                            <footer className={styles.actions}>
                                <button
                                    type="button"
                                    onClick={() => save(false)}
                                >
                                    <Save size={20} /> Guardar borrador
                                </button>
                                <button
                                    type="button"
                                    className={styles.publishButton}
                                    disabled={!blocks.length}
                                    onClick={() => save(true)}
                                >
                                    <Send size={20} /> Publicar lección
                                </button>
                            </footer>
                        </>
                    )}
                </section>

                {previewEnabled && (
                    <aside className={styles.preview}>
                        <div className={styles.previewDevice}>
                            <div className={styles.previewSpeaker} />
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
                            <div className={styles.previewProgress}>
                                <div
                                    style={{
                                        width: previewBlocks.length
                                            ? `${((previewIndex + 1) / previewBlocks.length) * 100}%`
                                            : "0%",
                                    }}
                                />
                            </div>
                            <div className={styles.previewContent}>
                                {currentPreviewBlock ? (
                                    <LessonBlockRenderer
                                        key={`${previewIndex}-${currentPreviewBlock.type}`}
                                        block={currentPreviewBlock}
                                        interactive={false}
                                    />
                                ) : (
                                    <div className={styles.previewEmpty}>
                                        <span>La vista previa está vacía</span>
                                        <p>Añade contenido para comenzar.</p>
                                    </div>
                                )}
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
                                    <ChevronLeft size={18} /> Anterior
                                </button>
                                <span>
                                    {!previewBlocks.length
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
                                    Siguiente <ChevronRight size={18} />
                                </button>
                            </footer>
                        </div>
                    </aside>
                )}
            </div>
            {error && <p className={styles.error}>{error}</p>}
            {message && <p className={styles.success}>{message}</p>}
        </main>
    );
}
