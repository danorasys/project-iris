import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import {
  ArrowLeft,
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

/*
 * Reutilizamos los estilos de CourseBuilder para que crear y editar
 * mantengan exactamente la misma identidad visual.
 */
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

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/**
 * Convierte los bloques visuales del editor al contrato actual del backend.
 *
 * El backend solamente conoce "texto" e "imagen". Los bloques de preguntas
 * e información se guardan como texto con metadatos internos.
 */
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
  const {
    classroomId,
    lessonId: lessonIdParam,
  } = useParams<{
    classroomId: string;
    lessonId?: string;
  }>();

  const navigate = useNavigate();
  const isEditMode = Boolean(lessonIdParam);

  const createLesson = useCreateLesson(classroomId ?? "");
  const updateLesson = useUpdateLesson();
  const uploadImage = useUploadLessonImage();
  const lessonQuery = useLessonDetail(lessonIdParam);

  const [lessonId, setLessonId] = useState<string | null>(
    lessonIdParam ?? null,
  );
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState<EditorBlock[]>([]);
  const [lessonLoaded, setLessonLoaded] = useState(false);
  const [previewEnabled, setPreviewEnabled] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);

  /**
   * Carga la lección existente una sola vez.
   *
   * Los bloques antiguos, que solo contienen texto, se interpretan como
   * bloques de información. Los bloques nuevos se decodifican como
   * información o pregunta.
   */
  useEffect(() => {
    if (
      !isEditMode ||
      lessonLoaded ||
      !lessonQuery.data
    ) {
      return;
    }

    const lesson = lessonQuery.data;

    const editorBlocks: EditorBlock[] = [...lesson.blocks]
      .sort(
        (left, right) =>
          left.order_index - right.order_index,
      )
      .map((block): EditorBlock => {
        if (block.type === "imagen") {
          return {
            id: createId(),
            kind: "image",
            imageUrl: block.image_url ?? "",
          };
        }

        const decoded = decodeTextBlock(block.content);

        if (decoded.metadata.kind === "question") {
          return {
            id: createId(),
            kind: "question",
            markdown: decoded.markdown,
            options:
              decoded.metadata.question?.options.length
                ? decoded.metadata.question.options
                : ["Opción A", "Opción B"],
            correctOption:
              decoded.metadata.question?.correctOption,
          };
        }

        return {
          id: createId(),
          kind: "information",
          markdown: decoded.markdown,
        };
      });

    setTitle(lesson.title);
    setBlocks(editorBlocks);
    setLessonId(lesson.id);
    setLessonLoaded(true);
  }, [
    isEditMode,
    lessonLoaded,
    lessonQuery.data,
  ]);

  const previewBlocks = useMemo(
    () => toApiBlocks(blocks),
    [blocks],
  );

  const goBack = () => {
    navigate(
      classroomId
        ? `/teacher/classrooms/${classroomId}`
        : "/teacher/home",
    );
  };

  const handleCreateLesson = () => {
    if (!classroomId || !title.trim()) return;

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
            getErrorMessage(
              reason,
              "No se pudo crear la lección.",
            ),
          );
        },
      },
    );
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
        options: [
          "Primera opción",
          "Segunda opción",
          "Tercera opción",
        ],
        correctOption: 0,
      },
    ]);
  };

  const handleSelectImage = () => {
    if (!lessonId) {
      setError(
        "Primero debes crear la lección para poder subir imágenes.",
      );
      return;
    }

    imageInputRef.current?.click();
  };

  const handleImageSelected = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !lessonId) return;

    setError(null);
    setMessage(null);

    uploadImage.mutate(
      {
        lessonId,
        file,
      },
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

          setMessage("Imagen añadida a la lección.");
        },
        onError: (reason) => {
          setError(
            getErrorMessage(
              reason,
              "No se pudo subir la imagen.",
            ),
          );
        },
      },
    );
  };

  const handleDragEnd = ({
    source,
    destination,
  }: DropResult) => {
    if (
      !destination ||
      source.index === destination.index
    ) {
      return;
    }

    setBlocks((current) => {
      const next = [...current];
      const [movedBlock] = next.splice(source.index, 1);

      next.splice(destination.index, 0, movedBlock);

      return next;
    });
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
    setBlocks((current) =>
      current.filter((block) => block.id !== blockId),
    );
  };

  const addQuestionOption = (blockId: string) => {
    updateBlock(blockId, (block) => {
      if (block.kind !== "question") return block;

      return {
        ...block,
        options: [
          ...block.options,
          `Opción ${block.options.length + 1}`,
        ],
      };
    });
  };

  const updateQuestionOption = (
    blockId: string,
    optionIndex: number,
    value: string,
  ) => {
    updateBlock(blockId, (block) => {
      if (block.kind !== "question") return block;

      const options = [...block.options];
      options[optionIndex] = value;

      return {
        ...block,
        options,
      };
    });
  };

  const removeQuestionOption = (
    blockId: string,
    optionIndex: number,
  ) => {
    updateBlock(blockId, (block) => {
      if (
        block.kind !== "question" ||
        block.options.length <= 2
      ) {
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

  const validateLesson = (): string | null => {
    if (!title.trim()) {
      return "La lección necesita un título.";
    }

    if (blocks.length === 0) {
      return "Añade al menos un bloque antes de publicar.";
    }

    for (const block of blocks) {
      if (
        block.kind !== "image" &&
        !block.markdown.trim()
      ) {
        return "Los bloques de texto no pueden estar vacíos.";
      }

      if (block.kind === "question") {
        const validOptions = block.options.filter((option) =>
          option.trim(),
        );

        if (validOptions.length < 2) {
          return "Cada pregunta necesita al menos dos opciones.";
        }

        if (block.correctOption === undefined) {
          return "Selecciona la respuesta correcta de cada pregunta.";
        }

        if (
          !block.options[block.correctOption]?.trim()
        ) {
          return "La respuesta correcta no puede estar vacía.";
        }
      }
    }

    return null;
  };

  const saveLesson = (publish = false) => {
    if (!lessonId) return;

    if (publish) {
      const validationError = validateLesson();

      if (validationError) {
        setError(validationError);
        return;
      }
    } else if (!title.trim()) {
      setError("La lección necesita un título.");
      return;
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
            ? { status: "publicada" as const }
            : {}),
        },
      },
      {
        onSuccess: () => {
          if (publish) {
            navigate(
              `/teacher/classrooms/${classroomId}`,
            );
            return;
          }

          setMessage(
            "Los cambios se guardaron correctamente.",
          );
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

  if (
    isEditMode &&
    lessonQuery.isLoading &&
    !lessonLoaded
  ) {
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

  if (
    isEditMode &&
    lessonQuery.isError &&
    !lessonLoaded
  ) {
    return (
      <main className={styles.page}>
        <div className={styles.courseForm}>
          <p className={styles.error} role="alert">
            No se pudo cargar esta lección. Puede que ya no
            exista o que no tengas acceso.
          </p>

          <button
            type="button"
            className={styles.primaryButton}
            onClick={goBack}
          >
            <ArrowLeft size={20} />
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
          <span className={styles.eyebrow}>
            Panel docente
          </span>

          <h1>
            {isEditMode
              ? "Editar lección"
              : "Crear lección"}
          </h1>

          <p>
            Organiza el contenido mediante bloques
            arrastrables y comprueba cómo lo verá el
            estudiante antes de publicarlo.
          </p>
        </div>

        <div className={styles.headerControls}>
          <button
            type="button"
            className={styles.previewToggle}
            onClick={goBack}
          >
            <ArrowLeft size={20} />
            Volver al aula
          </button>

          <button
            type="button"
            className={styles.previewToggle}
            onClick={() =>
              setPreviewEnabled((current) => !current)
            }
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
              onChange={(event) =>
                setTitle(event.target.value)
              }
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
                  onClick={handleSelectImage}
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

              <DragDropContext
                onDragEnd={handleDragEnd}
              >
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
                              ref={draggable.innerRef}
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
                                    size={20}
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
                                  <Trash2 size={18} />
                                </button>
                              </header>

                              {block.kind ===
                                "image" && (
                                <img
                                  src={block.imageUrl}
                                  alt="Contenido de la lección"
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
                                          aria-label={`Marcar la opción ${
                                            optionIndex +
                                            1
                                          } como correcta`}
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
                                          value={option}
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
                                            block.options
                                              .length <= 2
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
                                            size={16}
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
                                    <Plus size={16} />
                                    Añadir opción
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
                          Añade bloques de información,
                          preguntas o imágenes para
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
                  disabled={
                    updateLesson.isPending ||
                    !title.trim()
                  }
                  onClick={() =>
                    saveLesson(false)
                  }
                >
                  <Save size={20} />

                  {updateLesson.isPending
                    ? "Guardando…"
                    : "Guardar borrador"}
                </button>

                <button
                  type="button"
                  className={
                    styles.publishButton
                  }
                  disabled={
                    updateLesson.isPending ||
                    !title.trim() ||
                    blocks.length === 0
                  }
                  onClick={() =>
                    saveLesson(true)
                  }
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
              <header>
                <span>Vista del estudiante</span>
                <strong>
                  {title || "Nueva lección"}
                </strong>
              </header>

              <div className={styles.previewContent}>
                {previewBlocks.length === 0 ? (
                  <p>
                    Añade contenido para visualizar
                    cómo quedará la lección.
                  </p>
                ) : (
                  previewBlocks.map(
                    (block, index) => (
                      <LessonBlockRenderer
                        key={`${block.type}-${index}`}
                        block={block}
                        interactive
                      />
                    ),
                  )
                )}
              </div>
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