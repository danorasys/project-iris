import {
    useEffect,
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

function getErrorMessage(error: unknown, fallback: string): string {
    return error instanceof ApiError ? error.message : fallback;
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
                    block.options
                        .map((option) => option.trim())
                        .filter(Boolean),
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
    const [previewIndex, setPreviewIndex] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    const previewBlocks = useMemo(() => toApiBlocks(blocks), [blocks]);
    const currentPreviewBlock = previewBlocks[previewIndex];
    const previewIsFirst = previewIndex === 0;
    const previewIsLast =
        previewBlocks.length === 0 || previewIndex === previewBlocks.length - 1;

    useEffect(() => {
        setPreviewIndex((current) =>
            Math.min(current, Math.max(previewBlocks.length - 1, 0)),
        );
    }, [previewBlocks.length]);

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
                onError: (reason) =>
                    setError(
                        getErrorMessage(reason, "No se pudo crear el curso."),
                    ),
            },
        );
    };

    const handleCreateLesson = () => {
        if (!classroomId || !lessonTitle.trim()) return;
        setError(null);
        createLesson.mutate(
            { title: lessonTitle.trim(), blocks: [] },
            {
                onSuccess: (lesson) => {
                    setLessonId(lesson.id);
                    setMessage("Lección creada como borrador.");
                },
                onError: (reason) =>
                    setError(
                        getErrorMessage(reason, "No se pudo crear la lección."),
                    ),
            },
        );
    };

    const updateBlock = (
        id: string,
        updater: (block: EditorBlock) => EditorBlock,
    ) => {
        setBlocks((current) =>
            current.map((block) => (block.id === id ? updater(block) : block)),
        );
    };

    const handleDragEnd = ({ source, destination }: DropResult) => {
        if (!destination || source.index === destination.index) return;
        setBlocks((current) => {
            const next = [...current];
            const [moved] = next.splice(source.index, 1);
            next.splice(destination.index, 0, moved);
            return next;
        });
    };

    const addInformation = () => {
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

    const selectImage = () => {
        if (!lessonId) {
            setError("Primero crea la lección para poder subir imágenes.");
            return;
        }
        imageInputRef.current?.click();
    };

    const handleImageSelected = (event: ChangeEvent<HTMLInputElement>) => {
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
                        { id: createId(), kind: "image", imageUrl: image_url },
                    ]);
                    setMessage("Imagen añadida a la lección.");
                },
                onError: (reason) =>
                    setError(
                        getErrorMessage(reason, "No se pudo subir la imagen."),
                    ),
            },
        );
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
                    } else {
                        setMessage("Los cambios se guardaron correctamente.");
                    }
                },
                onError: (reason) =>
                    setError(
                        getErrorMessage(
                            reason,
                            "No se pudo guardar la lección.",
                        ),
                    ),
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
                        Organiza la experiencia del estudiante con bloques
                        visuales y una vista previa fiel.
                    </p>
                </div>
                <div className={styles.headerControls}>
                    <button
                        type="button"
                        className={styles.previewToggle}
                        onClick={() => navigate("/teacher/home")}
                    >
                        <ChevronLeft size={20} /> Volver
                    </button>
                    {classroomId && (
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
                    )}
                </div>
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
                        <Plus size={20} />{" "}
                        {createClassroom.isPending
                            ? "Creando curso…"
                            : "Crear curso y añadir lección"}
                    </button>
                </form>
            ) : (
                <div
                    className={`${styles.workspace} ${previewEnabled ? styles.withPreview : ""}`}
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
                                className={styles.lessonTitle}
                                aria-label="Título de la lección"
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
                                <Plus size={20} />{" "}
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
                                        <Info size={20} /> Información
                                    </button>
                                    <button type="button" onClick={addQuestion}>
                                        <HelpCircle size={20} /> Pregunta
                                    </button>
                                    <button
                                        type="button"
                                        onClick={selectImage}
                                        disabled={uploadImage.isPending}
                                    >
                                        <ImagePlus size={20} />{" "}
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
                                                        {(
                                                            draggable,
                                                            snapshot,
                                                        ) => (
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
                                                                        "information"
                                                                            ? "Información"
                                                                            : block.kind ===
                                                                                "question"
                                                                              ? "Pregunta"
                                                                              : "Imagen"}
                                                                    </strong>
                                                                    <button
                                                                        type="button"
                                                                        aria-label="Eliminar bloque"
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
                                                                        alt="Contenido de la lección"
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
                                                                        placeholder="Escribe Markdown…"
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
                                                                                        type="text"
                                                                                        value={
                                                                                            option
                                                                                        }
                                                                                        aria-label={`Opción ${optionIndex + 1}`}
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
                                                                                                ) => {
                                                                                                    if (
                                                                                                        current.kind !==
                                                                                                            "question" ||
                                                                                                        current
                                                                                                            .options
                                                                                                            .length <=
                                                                                                            2
                                                                                                    )
                                                                                                        return current;
                                                                                                    const options =
                                                                                                        current.options.filter(
                                                                                                            (
                                                                                                                _,
                                                                                                                itemIndex,
                                                                                                            ) =>
                                                                                                                itemIndex !==
                                                                                                                optionIndex,
                                                                                                        );
                                                                                                    const correctOption =
                                                                                                        current.correctOption ===
                                                                                                        optionIndex
                                                                                                            ? undefined
                                                                                                            : current.correctOption !==
                                                                                                                    undefined &&
                                                                                                                current.correctOption >
                                                                                                                    optionIndex
                                                                                                              ? current.correctOption -
                                                                                                                1
                                                                                                              : current.correctOption;
                                                                                                    return {
                                                                                                        ...current,
                                                                                                        options,
                                                                                                        correctOption,
                                                                                                    };
                                                                                                },
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
                                                {blocks.length === 0 && (
                                                    <div
                                                        className={
                                                            styles.emptyState
                                                        }
                                                    >
                                                        Añade bloques para
                                                        comenzar.
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
                                        disabled={
                                            updateLesson.isPending ||
                                            !lessonTitle.trim()
                                        }
                                    >
                                        <Save size={20} /> Guardar borrador
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.publishButton}
                                        onClick={() => saveLesson(true)}
                                        disabled={
                                            updateLesson.isPending ||
                                            !lessonTitle.trim() ||
                                            blocks.length === 0
                                        }
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
                                <div
                                    className={styles.previewSpeaker}
                                    aria-hidden="true"
                                />
                                <header className={styles.previewHeader}>
                                    <div>
                                        <span>Vista del estudiante</span>
                                        <strong>
                                            {lessonTitle || "Nueva lección"}
                                        </strong>
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
                                            width: previewBlocks.length
                                                ? `${((previewIndex + 1) / previewBlocks.length) * 100}%`
                                                : "0%",
                                        }}
                                    />
                                </div>
                                <div className={styles.previewContent}>
                                    {currentPreviewBlock ? (
                                        <LessonBlockRenderer
                                            block={currentPreviewBlock}
                                            interactive={false}
                                            showCorrectness={false}
                                        />
                                    ) : (
                                        <div className={styles.previewEmpty}>
                                            <span>
                                                La vista previa está vacía
                                            </span>
                                            <p>
                                                Añade información, preguntas o
                                                imágenes.
                                            </p>
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
