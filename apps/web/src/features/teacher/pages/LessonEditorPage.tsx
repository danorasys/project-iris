import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  useUpdateLesson,
  useCreateLesson,
  useUploadLessonImage,
  useLessonDetail,
  type ContentBlockInput,
} from "@/shared/api/hooks/useLessonsApi";
import { ApiError } from "@/shared/api/httpClient";
import { IconImage, IconUndo, IconText } from "@/shared/ui/icons";
import styles from "./LessonEditorPage.module.css";

interface EditorBlock extends ContentBlockInput {
  /** Local id, only for React's `key` and moving blocks around. Never
   * sent to the backend, the real `ContentBlockInput` doesn't carry it. */
  clientId: string;
}

let blockCounter = 0;
function generateClientId(): string {
  blockCounter += 1;
  return `block-${blockCounter}`;
}

function reorder(blocks: EditorBlock[]): EditorBlock[] {
  return blocks.map((block, index) => ({ ...block, order_index: index }));
}

function toApiBlocks(blocks: EditorBlock[]): ContentBlockInput[] {
  return blocks.map(({ clientId: _clientId, ...rest }) => rest);
}

/** Handles both `/teacher/classrooms/:classroomId/lessons/create` and
 * `/teacher/classrooms/:classroomId/lessons/:lessonId/edit`, the same editor
 * either way: (1) create the lesson as a draft with its title, or load an
 * existing one, (2) add text blocks or upload images that get inserted as a
 * block, (3) save (replaces the whole block set, per `useUpdateLesson`'s
 * contract) or publish directly. */
export default function LessonEditorPage() {
  const { classroomId, lessonId: lessonIdParam } = useParams<{ classroomId: string; lessonId?: string }>();
  const navigate = useNavigate();
  const isEditMode = Boolean(lessonIdParam);

  const createLesson = useCreateLesson(classroomId ?? "");
  const uploadImage = useUploadLessonImage();
  const updateLesson = useUpdateLesson();
  const existingLessonQuery = useLessonDetail(lessonIdParam);

  const [lessonId, setLessonId] = useState<string | null>(lessonIdParam ?? null);
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState<EditorBlock[]>([]);
  const [existingLessonLoaded, setExistingLessonLoaded] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Seeds the editor's local state from the fetched lesson exactly once,
  // then leaves it alone, so the user's own edits never get overwritten by
  // a background refetch.
  useEffect(() => {
    if (!isEditMode || existingLessonLoaded || !existingLessonQuery.data) return;
    const lesson = existingLessonQuery.data;
    setTitle(lesson.title);
    setBlocks(
      [...lesson.blocks]
        .sort((a, b) => a.order_index - b.order_index)
        .map((block) => ({
          clientId: generateClientId(),
          type: block.type,
          content: block.content ?? undefined,
          image_url: block.image_url ?? undefined,
          order_index: block.order_index,
        }))
    );
    setExistingLessonLoaded(true);
  }, [isEditMode, existingLessonLoaded, existingLessonQuery.data]);

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!classroomId) return;
    setCreateError(null);
    createLesson.mutate(
      { title: title.trim(), blocks: [] },
      {
        onSuccess: (lesson) => setLessonId(lesson.id),
        onError: (err) => {
          setCreateError(err instanceof ApiError ? err.message : "No se pudo crear la lección. Intenta de nuevo.");
        },
      }
    );
  };

  const addTextBlock = () => {
    setBlocks((current) => reorder([...current, { clientId: generateClientId(), type: "texto", content: "", order_index: 0 }]));
  };

  const selectImage = () => fileInputRef.current?.click();

  const handleFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !lessonId) return;
    setImageError(null);
    uploadImage.mutate(
      { lessonId, file },
      {
        onSuccess: ({ image_url }) => {
          setBlocks((current) =>
            reorder([...current, { clientId: generateClientId(), type: "imagen", image_url, order_index: 0 }])
          );
        },
        onError: (err) => {
          setImageError(err instanceof ApiError ? err.message : "No se pudo subir la imagen. Intenta de nuevo.");
        },
      }
    );
  };

  const updateBlockText = (clientId: string, content: string) => {
    setBlocks((current) => current.map((b) => (b.clientId === clientId ? { ...b, content } : b)));
  };

  const removeBlock = (clientId: string) => {
    setBlocks((current) => reorder(current.filter((b) => b.clientId !== clientId)));
  };

  const moveBlock = (clientId: string, direction: -1 | 1) => {
    setBlocks((current) => {
      const index = current.findIndex((b) => b.clientId === clientId);
      const targetIndex = index + direction;
      if (index === -1 || targetIndex < 0 || targetIndex >= current.length) return current;
      const copy = [...current];
      [copy[index], copy[targetIndex]] = [copy[targetIndex], copy[index]];
      return reorder(copy);
    });
  };

  const save = (status?: "publicada") => {
    if (!lessonId) return;
    setSaveError(null);
    setSaveMessage(null);
    updateLesson.mutate(
      { lessonId, body: { title: title.trim(), blocks: toApiBlocks(blocks), ...(status ? { status } : {}) } },
      {
        onSuccess: () => {
          if (status === "publicada") {
            navigate(`/teacher/classrooms/${classroomId}`);
          } else {
            setSaveMessage("Cambios guardados.");
          }
        },
        onError: (err) => {
          setSaveError(err instanceof ApiError ? err.message : "No se pudo guardar la lección. Intenta de nuevo.");
        },
      }
    );
  };

  // In edit mode, the editor only renders once the existing lesson finished
  // loading, so it never flashes an empty title and block list first.
  const showEditor = Boolean(lessonId) && (!isEditMode || existingLessonLoaded);

  return (
    <main className={styles.page}>
      <button
        type="button"
        className={styles.back}
        onClick={() => navigate(classroomId ? `/teacher/classrooms/${classroomId}` : "/teacher/home")}
      >
        <IconUndo width={18} height={18} />
        Volver al aula
      </button>

      <div className={styles.header}>
        <h1>{lessonId ? "Editar lección" : "Crear lección"}</h1>
        <p>Agrega texto e imágenes en el orden en que el estudiante los va a ver.</p>
      </div>

      {isEditMode && !existingLessonLoaded && existingLessonQuery.isLoading && <p>Cargando lección…</p>}

      {isEditMode && !existingLessonLoaded && existingLessonQuery.isError && (
        <p className={styles.error} role="alert">
          No se pudo cargar esta lección. Puede que ya no exista o que no tengas acceso.
        </p>
      )}

      {!lessonId && (
        <form className={styles.createForm} onSubmit={handleCreate} noValidate>
          <div className={styles.field}>
            <label htmlFor="titulo-leccion">Título de la lección</label>
            <input
              id="titulo-leccion"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={120}
              placeholder="Ej. Sumas hasta el 10"
            />
          </div>
          {createError && (
            <p className={styles.error} role="alert">
              {createError}
            </p>
          )}
          <button type="submit" className={styles.submit} disabled={createLesson.isPending || !title.trim() || !classroomId}>
            {createLesson.isPending ? "Creando…" : "Crear lección y continuar"}
          </button>
        </form>
      )}

      {showEditor && (
        <div className={styles.editor}>
          <div className={styles.field}>
            <label htmlFor="titulo-leccion-editable">Título</label>
            <input
              id="titulo-leccion-editable"
              className={styles.editableTitle}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
            />
          </div>

          <div className={styles.addBar}>
            <button type="button" className={styles.addButton} onClick={addTextBlock}>
              <IconText width={18} height={18} />
              Agregar bloque de texto
            </button>
            <button type="button" className={styles.addButton} onClick={selectImage} disabled={uploadImage.isPending}>
              <IconImage width={18} height={18} />
              {uploadImage.isPending ? "Subiendo imagen…" : "Agregar bloque de imagen"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className={styles.fileInput}
              onChange={handleFileSelected}
            />
          </div>

          {imageError && (
            <p className={styles.error} role="alert">
              {imageError}
            </p>
          )}

          {blocks.length === 0 ? (
            <p className={styles.empty}>Todavía no hay bloques — agrega texto o una imagen para empezar.</p>
          ) : (
            <ul className={styles.blockList}>
              {blocks.map((block, index) => (
                <li key={block.clientId} className={styles.block}>
                  <div className={styles.blockHeader}>
                    <span className={styles.blockType}>{block.type === "texto" ? "Texto" : "Imagen"}</span>
                    <div className={styles.blockActions}>
                      <button type="button" onClick={() => moveBlock(block.clientId, -1)} disabled={index === 0}>
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveBlock(block.clientId, 1)}
                        disabled={index === blocks.length - 1}
                      >
                        ↓
                      </button>
                      <button type="button" className={styles.remove} onClick={() => removeBlock(block.clientId)}>
                        Eliminar
                      </button>
                    </div>
                  </div>

                  {block.type === "texto" ? (
                    <textarea
                      className={styles.blockText}
                      value={block.content ?? ""}
                      onChange={(e) => updateBlockText(block.clientId, e.target.value)}
                      placeholder="Escribe el contenido de este bloque…"
                    />
                  ) : (
                    <img src={block.image_url} alt="" className={styles.blockImage} />
                  )}
                </li>
              ))}
            </ul>
          )}

          {saveError && (
            <p className={styles.error} role="alert">
              {saveError}
            </p>
          )}
          {saveMessage && <p className={styles.statusMessage}>{saveMessage}</p>}

          <div className={styles.saveBar}>
            <button
              type="button"
              className={styles.save}
              onClick={() => save()}
              disabled={updateLesson.isPending || !title.trim()}
            >
              {updateLesson.isPending ? "Guardando…" : "Guardar borrador"}
            </button>
            <button
              type="button"
              className={styles.publish}
              onClick={() => save("publicada")}
              disabled={updateLesson.isPending || !title.trim() || blocks.length === 0}
            >
              Publicar lección
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
