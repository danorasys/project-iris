import { useLayoutEffect, useRef, useState, type ChangeEvent } from "react";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { useUploadLessonImage } from "@/shared/api/hooks/useLessonsApi";
import { BlockView } from "@/shared/ui/lesson/BlockView";
import { IconArrowDown, IconArrowUp, IconImage, IconPlus, IconTrash } from "@/shared/ui/icons";
import { IMAGE_MAX_BYTES, LIMITS } from "../lessonLimits";
import { BLOCK_KINDS } from "./blockKinds";
import { BlockEditor } from "./BlockEditor";
import {
  emptyBlock,
  emptyPage,
  move,
  newKey,
  removeAt,
  replaceAt,
  type EditorBlock,
  type EditorPage,
} from "./editorModel";
import styles from "./Editor.module.css";

const ADDABLE = ["titulo", "subtitulo", "texto", "lista", "tabla"] as const;

interface PagesEditorProps {
  lessonId: string;
  pages: EditorPage[];
  onChange: (pages: EditorPage[]) => void;
  /** Called when an upload fails, to tell the teacher. */
  onError: (message: string) => void;
  /** "la lección" or "el extra", for the hints. */
  owner: string;
}

/** The pages of a lesson or of an extra (HU-79): each one with its blocks,
 * which can be added, moved and taken out, and a preview of how the kid
 * will see them, one page at a time (HU-62). */
export function PagesEditor({ lessonId, pages, onChange, onError, owner }: PagesEditorProps) {
  const [preview, setPreview] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const upload = useUploadLessonImage();
  // The newest pages, for when an upload ends after more edits.
  const latest = useRef({ pages, onChange });
  useLayoutEffect(() => {
    latest.current = { pages, onChange };
  });

  const setPage = (index: number, page: EditorPage) => onChange(replaceAt(pages, index, page));
  const setBlocks = (index: number, blocks: EditorBlock[]) => setPage(index, { ...pages[index], blocks });

  // Uploads the picture to the lesson's private folder, then puts it in a
  // new block (at the end of the page) or in place of the old picture.
  async function placeImage(pageIndex: number, file: File, blockIndex?: number) {
    if (file.size > IMAGE_MAX_BYTES) {
      onError("La imagen no puede superar 5 MB.");
      return;
    }
    const target = `${pageIndex}-${blockIndex ?? "new"}`;
    setUploading(target);
    try {
      const { image_file } = await upload.mutateAsync({ lessonId, file });
      const { pages: now, onChange: change } = latest.current;
      const page = now[pageIndex];
      if (!page) return;
      let blocks = page.blocks;
      if (blockIndex === undefined) {
        const block: EditorBlock = {
          key: newKey(),
          type: "imagen",
          image_file,
          alt_text: "",
          page_index: 0,
          order_index: 0,
        };
        blocks = [...page.blocks, block];
      } else if (page.blocks[blockIndex]?.type === "imagen") {
        blocks = replaceAt(page.blocks, blockIndex, { ...page.blocks[blockIndex], image_file } as EditorBlock);
      }
      change(replaceAt(now, pageIndex, { ...page, blocks }));
    } catch (error) {
      onError(getAuthErrorMessage(error));
    } finally {
      setUploading(null);
    }
  }

  function pickNewImage(pageIndex: number, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void placeImage(pageIndex, file);
  }

  return (
    <div className={styles.stack}>
      <div className={styles.toolbar}>
        <p className={styles.hint}>
          Organiza {owner} en páginas cortas: el peque ve una página a la vez. Una lección se lee en 5 a 15 minutos,
          unas 6 a 10 páginas.
        </p>
        <div
          className={preview ? `${styles.modes} ${styles.modesSecond}` : styles.modes}
          role="radiogroup"
          aria-label="Modo"
        >
          <button
            type="button"
            role="radio"
            aria-checked={!preview}
            className={preview ? styles.mode : `${styles.mode} ${styles.modeActive}`}
            onClick={() => setPreview(false)}
          >
            Editar
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={preview}
            className={preview ? `${styles.mode} ${styles.modeActive}` : styles.mode}
            onClick={() => setPreview(true)}
          >
            Vista previa
          </button>
        </div>
      </div>

      {preview &&
        pages.map((page, pageIndex) => (
          <section
            key={page.key}
            className={styles.previewPage}
            aria-label={`Página ${pageIndex + 1} de ${pages.length}`}
          >
            <p className={styles.previewLabel}>
              Página {pageIndex + 1} de {pages.length}
            </p>
            {page.blocks.map((block) => (
              <BlockView key={block.key} block={block} lessonId={lessonId} />
            ))}
          </section>
        ))}

      {!preview &&
        pages.map((page, pageIndex) => (
          <section key={page.key} className={styles.card} aria-labelledby={`${page.key}-title`}>
            <div className={styles.cardHead}>
              <span className={styles.number} aria-hidden="true">
                {pageIndex + 1}
              </span>
              <h3 id={`${page.key}-title`} className={styles.cardTitle}>
                Página {pageIndex + 1}
              </h3>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => onChange(move(pages, pageIndex, -1))}
                  disabled={pageIndex === 0}
                  aria-label={`Subir la página ${pageIndex + 1}`}
                >
                  <IconArrowUp width={16} height={16} />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => onChange(move(pages, pageIndex, 1))}
                  disabled={pageIndex === pages.length - 1}
                  aria-label={`Bajar la página ${pageIndex + 1}`}
                >
                  <IconArrowDown width={16} height={16} />
                </button>
                <button
                  type="button"
                  className={`${styles.iconButton} ${styles.danger}`}
                  onClick={() => onChange(removeAt(pages, pageIndex))}
                  aria-label={`Quitar la página ${pageIndex + 1}`}
                >
                  <IconTrash width={16} height={16} />
                </button>
              </div>
            </div>

            {page.blocks.map((block, blockIndex) => (
              <BlockEditor
                key={block.key}
                block={block}
                lessonId={lessonId}
                where={`página ${pageIndex + 1}, bloque ${blockIndex + 1}`}
                onChange={(changed) => setBlocks(pageIndex, replaceAt(page.blocks, blockIndex, changed))}
                onMove={(step) => setBlocks(pageIndex, move(page.blocks, blockIndex, step))}
                onRemove={() => setBlocks(pageIndex, removeAt(page.blocks, blockIndex))}
                canMoveUp={blockIndex > 0}
                canMoveDown={blockIndex < page.blocks.length - 1}
                onReplaceImage={(file) => void placeImage(pageIndex, file, blockIndex)}
                uploading={uploading === `${pageIndex}-${blockIndex}`}
                disabled={false}
              />
            ))}

            <div className={styles.addRow}>
              <span className={styles.addLabel}>Agregar:</span>
              {ADDABLE.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={styles.small}
                  onClick={() => setBlocks(pageIndex, [...page.blocks, emptyBlock(type)])}
                  disabled={page.blocks.length >= LIMITS.blocksPerPage}
                >
                  {BLOCK_KINDS[type].icon}
                  {BLOCK_KINDS[type].label}
                </button>
              ))}
              <label className={styles.small} aria-disabled={page.blocks.length >= LIMITS.blocksPerPage}>
                <IconImage width={16} height={16} />
                {uploading === `${pageIndex}-new` ? "Subiendo…" : "Imagen"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className={styles.fileInput}
                  onChange={(event) => pickNewImage(pageIndex, event)}
                  disabled={uploading !== null || page.blocks.length >= LIMITS.blocksPerPage}
                  aria-label={`Agregar una imagen a la página ${pageIndex + 1}`}
                />
              </label>
            </div>
          </section>
        ))}

      {!preview && (
        <button
          type="button"
          className={styles.addBig}
          onClick={() => onChange([...pages, emptyPage()])}
          disabled={pages.length >= LIMITS.pages}
        >
          <IconPlus width={18} height={18} />
          Agregar página
        </button>
      )}
    </div>
  );
}
