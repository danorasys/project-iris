import {
    useMemo,
    useRef,
    useState,
    type ChangeEvent,
    type FormEvent,
} from "react";
import {
    DragDropContext,
    Draggable,
    Droppable,
    type DropResult,
} from "@hello-pangea/dnd";
import {
    BookOpen,
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
import { useNavigate } from "react-router-dom";

import { ApiError } from "@/shared/api/httpClient";
import { useCreateClassroom } from "@/shared/api/hooks/useClassroomsApi";
import {
    type ContentBlockInput,
    useCreateLesson,
    useUpdateLesson,
    useUploadLessonImage,
} from "@/shared/api/hooks/useLessonsApi";
import {
    encodeInformation,
    encodeQuestion,
    LessonBlockRenderer,
} from "@/features/lessons/components/LessonBlockRenderer";

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
          imageUrl: string;
      };

function createId(): string {
    return crypto.randomUUID();
}

function toApiBlocks(blocks: EditorBlock[]): ContentBlockInput[] {
    return blocks.map((block, orderIndex) => {
        if (block.kind === "image") {
            return {
                type: "imagen",
                image_url: block.imageUrl,
                order_index: orderIndex,
            };
        }

        if (block.kind === "question") {
            return {
                type: "texto",
                content: encodeQuestion(
                    block.markdown.trim() || "## Escribe la pregunta",
                    block.options.filter((option) => option.trim()),
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

export default function CourseBuilderPage() {
    const navigate = useNavigate();

    const createClassroom = useCreateClassroom();
    const updateLesson = useUpdateLesson();
    const uploadImage = useUploadLessonImage();

    const [classroomId, setClassroomId] = useState<string | null>(null);
    const [classroomName, setClassroomName] = useState("");
    const [classroomDescription, setClassroomDescription] = useState("");

    const createLesson = useCreateLesson(classroomId ?? "");

    const [lessonId, setLessonId] = useState<string | null>(null);
    const [lessonTitle, setLessonTitle] = useState("");
    const [blocks, setBlocks] = useState<EditorBlock[]>([]);
    const [previewEnabled, setPreviewEnabled] = useState(true);

    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const imageInputRef = useRef<HTMLInputElement>(null);

    const previewBlocks = useMemo(() => toApiBlocks(blocks), [blocks]);

    const getErrorMessage = (reason: unknown, fallback: string) =>
        reason instanceof ApiError ? reason.message : fallback;

    const handleCreateClassroom = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);

        createClassroom.mutate(
            {
                name: classroomName.trim(),
                description: classroomDescription.trim(),
            },
            {
                onSuccess: (classroom) => {
                    setClassroomId(classroom.id);
                    setMessage(
                        "Curso creado. Ahora puedes construir su primera lección.",
                    );
                },
                onError: (reason) => {
                    setError(
                        getErrorMessage(reason, "No se pudo crear el curso."),
                    );
                },
            },
        );
    };

    const handleCreateLesson = () => {
        if (!classroomId || !lessonTitle.trim()) return;

        setError(null);
        createLesson.mutate(
            {
                title: lessonTitle.trim(),
                blocks: [],
            },
            {
                onSuccess: (lesson) => {
                    setLessonId(lesson.id);
                    setMessage("Lección creada como borrador.");
                },
                onError: (reason) => {
                    setError(
                        getErrorMessage(reason, "No se pudo crear la lección."),
                    );
                },
            },
        );
    };

    const addInformation = () => {
        setBlocks((current) => [
            ...current,
            {
                id: createId(),
                kind: "information",
                markdown:
                    "## Nuevo tema\n\nEscribe el contenido usando **Markdown**.",
            },
        ]);
    };

    const addQuestion = () => {
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

    const handleSelectImage = () => {
        if (!lessonId) {
            setError("Primero crea la lección para poder subir imágenes.");
            return;
        }

        imageInputRef.current?.click();
    };

    const handleUploadImage = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";

        if (!file || !lessonId) return;

        setError(null);
        uploadImage.mutate(
            { lessonId, file },
            {
                onSuccess: ({ image_url }) => {
                    setBlocks((current) => [
                        ...current,
                        {
                            id: createId(),
                            kind: "image",
                            imageUrl: image_url,
                        },
                    ]);
                },
                onError: (reason) => {
                    setError(
                        getErrorMessage(reason, "No se pudo subir la imagen."),
                    );
                },
            },
        );
    };

    const handleDragEnd = ({ source, destination }: DropResult) => {
        if (!destination || source.index === destination.index) return;

        setBlocks((current) => {
            const next = [...current];
            const [movedBlock] = next.splice(source.index, 1);
            next.splice(destination.index, 0, movedBlock);
            return next;
        });
    };

    const updateBlock = (
        id: string,
        updater: (block: EditorBlock) => EditorBlock,
    ) => {
        setBlocks((current) =>
            current.map((block) => (block.id === id ? updater(block) : block)),
        );
    };

    const removeBlock = (id: string) => {
        setBlocks((current) => current.filter((block) => block.id !== id));
    };

    const saveLesson = (publish = false) => {
        if (!lessonId || !lessonTitle.trim()) return;

        setError(null);
        setMessage(null);

        updateLesson.mutate(
            {
                lessonId,
                body: {
                    title: lessonTitle.trim(),
                    blocks: toApiBlocks(blocks),
                    ...(publish ? { status: "publicada" as const } : {}),
                },
            },
            {
                onSuccess: () => {
                    if (publish && classroomId) {
                        navigate(`/teacher/classrooms/${classroomId}`);
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

    return (
        <main className={styles.page}>
            <header className={styles.header}>
                <div>
                    <span className={styles.eyebrow}>Panel docente</span>
                    <h1>Crear curso y lecciones</h1>
                    <p>
                        Organiza la experiencia del estudiante mediante bloques
                        visuales, preguntas e información.
                    </p>
                </div>

                <button
                    type="button"
                    className={styles.previewToggle}
                    onClick={() => setPreviewEnabled((value) => !value)}
                >
                    <Eye size={20} />
                    {previewEnabled
                        ? "Ocultar vista previa"
                        : "Mostrar vista previa"}
                </button>
            </header>

            {!classroomId ? (
                <form
                    className={styles.courseForm}
                    onSubmit={handleCreateClassroom}
                >
                    <div className={styles.sectionHeading}>
                        <BookOpen />
                        <div>
                            <h2>Información del curso</h2>
                            <p>
                                Estos datos se guardarán en el aula del
                                profesor.
                            </p>
                        </div>
                    </div>

                    <label>
                        Nombre del curso
                        <input
                            value={classroomName}
                            maxLength={120}
                            required
                            placeholder="Ej. Ciencias naturales"
                            onChange={(event) =>
                                setClassroomName(event.target.value)
                            }
                        />
                    </label>

                    <label>
                        Descripción
                        <textarea
                            value={classroomDescription}
                            maxLength={1000}
                            placeholder="Describe qué aprenderán los estudiantes."
                            onChange={(event) =>
                                setClassroomDescription(event.target.value)
                            }
                        />
                    </label>

                    <button
                        type="submit"
                        className={styles.primaryButton}
                        disabled={
                            createClassroom.isPending || !classroomName.trim()
                        }
                    >
                        <Plus size={20} />
                        {createClassroom.isPending
                            ? "Creando curso…"
                            : "Crear curso y añadir lección"}
                    </button>
                </form>
            ) : (
                <div
                    className={`${styles.workspace} ${
                        previewEnabled ? styles.withPreview : ""
                    }`}
                >
                    <section className={styles.builder}>
                        <div className={styles.lessonHeader}>
                            <div>
                                <span className={styles.step}>
                                    Curso creado
                                </span>
                                <h2>{classroomName}</h2>
                            </div>

                            <input
                                aria-label="Título de la lección"
                                className={styles.lessonTitle}
                                value={lessonTitle}
                                placeholder="Título de la lección"
                                maxLength={200}
                                onChange={(event) =>
                                    setLessonTitle(event.target.value)
                                }
                            />
                        </div>

                        {!lessonId ? (
                            <button
                                type="button"
                                className={styles.primaryButton}
                                disabled={
                                    createLesson.isPending ||
                                    !lessonTitle.trim()
                                }
                                onClick={handleCreateLesson}
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
                                        onClick={addInformation}
                                    >
                                        <Info size={20} />
                                        Información
                                    </button>

                                    <button type="button" onClick={addQuestion}>
                                        <HelpCircle size={20} />
                                        Pregunta
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handleSelectImage}
                                        disabled={uploadImage.isPending}
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
                                        onChange={handleUploadImage}
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
                                                        {(
                                                            draggable,
                                                            snapshot,
                                                        ) => (
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
                                                                        <GripVertical />
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
                                                                    "image" && (
                                                                    <img
                                                                        src={
                                                                            block.imageUrl
                                                                        }
                                                                        alt=""
                                                                        className={
                                                                            styles.editorImage
                                                                        }
                                                                    />
                                                                )}

                                                                {block.kind !==
                                                                    "image" && (
                                                                    <textarea
                                                                        value={
                                                                            block.markdown
                                                                        }
                                                                        rows={8}
                                                                        placeholder="Puedes utilizar títulos, listas, negrita y enlaces Markdown."
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
                                                                                            updateBlock(
                                                                                                block.id,
                                                                                                (
                                                                                                    current,
                                                                                                ) => {
                                                                                                    if (
                                                                                                        current.kind !==
                                                                                                        "question"
                                                                                                    ) {
                                                                                                        return current;
                                                                                                    }

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
                                                                                                          `Opción ${
                                                                                                              current
                                                                                                                  .options
                                                                                                                  .length +
                                                                                                              1
                                                                                                          }`,
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
                                                        Arrastra y organiza aquí
                                                        el contenido de la
                                                        lección.
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </Droppable>
                                </DragDropContext>

                                <footer className={styles.actions}>
                                    <button
                                        type="button"
                                        onClick={() => saveLesson(false)}
                                        disabled={updateLesson.isPending}
                                    >
                                        <Save size={20} />
                                        Guardar borrador
                                    </button>

                                    <button
                                        type="button"
                                        className={styles.publishButton}
                                        onClick={() => saveLesson(true)}
                                        disabled={
                                            updateLesson.isPending ||
                                            blocks.length === 0 ||
                                            !lessonTitle.trim()
                                        }
                                    >
                                        <Send size={20} />
                                        Publicar
                                    </button>
                                </footer>
                            </>
                        )}
                    </section>

                    {previewEnabled && (
                        <aside className={styles.preview}>
                            <div className={styles.previewDevice}>
                                <header>
                                    <span>Vista del estudiante</span>
                                    <strong>
                                        {lessonTitle || "Nueva lección"}
                                    </strong>
                                </header>

                                <div className={styles.previewContent}>
                                    {previewBlocks.length === 0 ? (
                                        <p>
                                            Añade bloques para visualizar la
                                            lección.
                                        </p>
                                    ) : (
                                        previewBlocks.map((block, index) => (
                                            <LessonBlockRenderer
                                                key={`${block.type}-${index}`}
                                                block={block}
                                                interactive
                                            />
                                        ))
                                    )}
                                </div>
                            </div>
                        </aside>
                    )}
                </div>
            )}

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
