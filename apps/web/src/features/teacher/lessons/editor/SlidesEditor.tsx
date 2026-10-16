import { useLayoutEffect, useRef, useState, type ChangeEvent } from "react";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { useUploadLessonImage } from "@/shared/api/hooks/useLessonsApi";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { BlockView } from "@/shared/ui/lesson/BlockView";
import { IconArrowLeft, IconArrowRight, IconImage, IconLayers, IconPlus, IconTrash } from "@/shared/ui/icons";
import { IMAGE_MAX_BYTES, LIMITS } from "../lessonLimits";
import { BLOCK_KINDS } from "./blockKinds";
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
import { SlideBlock } from "./SlideBlock";
import styles from "./Slides.module.css";

const ADDABLE = ["titulo", "subtitulo", "texto", "lista", "tabla"] as const;

interface SlidesEditorProps {
  lessonId: string;
  /** The lesson's (or the extra's) title, on top of each slide like the kid sees it. */
  title: string;
  pages: EditorPage[];
  onChange: (pages: EditorPage[]) => void;
  /** Called when an upload fails, to tell the teacher. */
  onError: (message: string) => void;
  /** "la lección" or "el extra", for the hints. */
  owner: string;
}

// Anything written on the slide, so taking it out asks first.
function hasContent(page: EditorPage): boolean {
  return page.blocks.some((block) => {
    if (block.type === "imagen") return true;
    if (block.type === "lista") return block.items.some((item) => item.trim());
    if (block.type === "tabla") return block.rows.some((row) => row.some((cell) => cell.trim()));
    return block.text.trim() !== "";
  });
}

// A copy of a slide with new keys, so both can change on their own.
function duplicate(page: EditorPage): EditorPage {
  return { key: newKey(), blocks: page.blocks.map((block) => ({ ...block, key: newKey() })) };
}

/** The pages of a lesson or of an extra as slides (HU-79): on the left the
 * slides in small, the way the kid will see them; in the middle the one
 * being written, on the kid's own screen (colors, letters and arrows), with
 * each block written right where the kid will read it; under it, what can be
 * added to it. The kid gets one slide at a time (HU-62). */
export function SlidesEditor({ lessonId, title, pages, onChange, onError, owner }: SlidesEditorProps) {
  const [current, setCurrent] = useState(0);
  const [uploading, setUploading] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const upload = useUploadLessonImage();
  // The newest pages, for when an upload ends after more edits.
  const latest = useRef({ pages, onChange });
  useLayoutEffect(() => {
    latest.current = { pages, onChange };
  });

  const index = Math.min(current, Math.max(pages.length - 1, 0));
  const page = pages[index];
  const full = (page?.blocks.length ?? 0) >= LIMITS.blocksPerPage;

  const setBlocks = (blocks: EditorBlock[]) => onChange(replaceAt(pages, index, { ...page, blocks }));

  function addSlide() {
    onChange([...pages.slice(0, index + 1), emptyPage(), ...pages.slice(index + 1)]);
    setCurrent(pages.length === 0 ? 0 : index + 1);
  }

  function moveSlide(step: -1 | 1) {
    onChange(move(pages, index, step));
    setCurrent(Math.max(0, Math.min(pages.length - 1, index + step)));
  }

  function duplicateSlide() {
    onChange([...pages.slice(0, index + 1), duplicate(page), ...pages.slice(index + 1)]);
    setCurrent(index + 1);
  }

  function removeSlide() {
    setConfirmingRemove(false);
    onChange(removeAt(pages, index));
    setCurrent(Math.max(0, index - 1));
  }

  // Uploads the picture to the lesson's private folder, then puts it in a
  // new block (at the end of the slide) or in place of the old picture.
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
      const slide = now[pageIndex];
      if (!slide) return;
      let blocks = slide.blocks;
      if (blockIndex === undefined) {
        const block: EditorBlock = {
          key: newKey(),
          type: "imagen",
          image_file,
          alt_text: "",
          page_index: 0,
          order_index: 0,
        };
        blocks = [...slide.blocks, block];
      } else if (slide.blocks[blockIndex]?.type === "imagen") {
        blocks = replaceAt(slide.blocks, blockIndex, { ...slide.blocks[blockIndex], image_file } as EditorBlock);
      }
      change(replaceAt(now, pageIndex, { ...slide, blocks }));
    } catch (error) {
      onError(getAuthErrorMessage(error));
    } finally {
      setUploading(null);
    }
  }

  function pickNewImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void placeImage(index, file);
  }

  if (!page) {
    return (
      <div className={styles.emptyDeck}>
        <span className={styles.emptyIcon} aria-hidden="true">
          <IconLayers width={24} height={24} />
        </span>
        <p className={styles.emptyTitle}>Aún no hay diapositivas</p>
        <p className={styles.emptyText}>
          Escribe {owner} en diapositivas cortas: el peque ve una a la vez, tal como la armes aquí.
        </p>
        <button type="button" className={styles.primary} onClick={addSlide}>
          <IconPlus width={16} height={16} />
          Crear la primera diapositiva
        </button>
      </div>
    );
  }

  const where = (blockIndex: number) => `diapositiva ${index + 1}, bloque ${blockIndex + 1}`;

  return (
    <div className={styles.deck}>
      {/* --- The slides in small, like the kid will see them --- */}
      <nav className={styles.rail} aria-label="Diapositivas">
        <ol className={styles.thumbs}>
          {pages.map((slide, slideIndex) => (
            <li key={slide.key}>
              <button
                type="button"
                className={styles.thumb}
                aria-current={slideIndex === index ? "true" : undefined}
                aria-label={`Diapositiva ${slideIndex + 1}${slide.blocks.length === 0 ? ", vacía" : ""}`}
                onClick={() => setCurrent(slideIndex)}
              >
                <span className={styles.thumbNumber} aria-hidden="true">
                  {slideIndex + 1}
                </span>
                <span className={styles.thumbScreen} data-theme="kid" aria-hidden="true">
                  {slide.blocks.length === 0 ? (
                    <span className={styles.thumbEmpty}>Vacía</span>
                  ) : (
                    <span className={styles.thumbPage}>
                      {slide.blocks.map((block) => (
                        <BlockView key={block.key} block={block} lessonId={lessonId} large />
                      ))}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className={styles.addSlide} onClick={addSlide} disabled={pages.length >= LIMITS.pages}>
          <IconPlus width={16} height={16} />
          Nueva diapositiva
        </button>
      </nav>

      <section className={styles.stage} aria-label={`Diapositiva ${index + 1} de ${pages.length}`}>
        {/* --- What can be done with this slide --- */}
        <div className={styles.slideBar}>
          <span className={styles.slideCount}>
            Diapositiva <strong>{index + 1}</strong> de {pages.length}
          </span>
          <div className={styles.slideActions}>
            <button type="button" className={styles.barButton} onClick={() => moveSlide(-1)} disabled={index === 0}>
              <IconArrowLeft width={15} height={15} />
              Mover antes
            </button>
            <button
              type="button"
              className={styles.barButton}
              onClick={() => moveSlide(1)}
              disabled={index === pages.length - 1}
            >
              Mover después
              <IconArrowRight width={15} height={15} />
            </button>
            <button
              type="button"
              className={styles.barButton}
              onClick={duplicateSlide}
              disabled={pages.length >= LIMITS.pages}
            >
              <IconLayers width={15} height={15} />
              Duplicar
            </button>
            <button
              type="button"
              className={`${styles.barButton} ${styles.barDanger}`}
              onClick={() => (hasContent(page) ? setConfirmingRemove(true) : removeSlide())}
              aria-label={`Eliminar la diapositiva ${index + 1}`}
            >
              <IconTrash width={15} height={15} />
              Eliminar
            </button>
          </div>
        </div>

        {/* --- The slide, on the kid's own screen --- */}
        <div className={styles.screen} data-theme="kid">
          <button
            type="button"
            className={styles.screenArrow}
            onClick={() => setCurrent(index - 1)}
            disabled={index === 0}
            aria-label="Diapositiva anterior"
          >
            <IconArrowLeft width={26} height={26} />
          </button>
          <div className={styles.screenBody}>
            <p className={styles.screenCounter}>
              {title} · Página {index + 1} de {pages.length}
            </p>
            <div className={styles.slide}>
              {page.blocks.length === 0 && (
                <p className={styles.slideEmpty}>Esta diapositiva está vacía. Agrégale algo con los botones de abajo.</p>
              )}
              {page.blocks.map((block, blockIndex) => (
                <SlideBlock
                  key={block.key}
                  block={block}
                  lessonId={lessonId}
                  where={where(blockIndex)}
                  onChange={(changed) => setBlocks(replaceAt(page.blocks, blockIndex, changed))}
                  onMove={(step) => setBlocks(move(page.blocks, blockIndex, step))}
                  onRemove={() => setBlocks(removeAt(page.blocks, blockIndex))}
                  canMoveUp={blockIndex > 0}
                  canMoveDown={blockIndex < page.blocks.length - 1}
                  onReplaceImage={(file) => void placeImage(index, file, blockIndex)}
                  uploading={uploading === `${index}-${blockIndex}`}
                />
              ))}
            </div>
          </div>
          <button
            type="button"
            className={styles.screenArrow}
            onClick={() => setCurrent(index + 1)}
            disabled={index === pages.length - 1}
            aria-label="Diapositiva siguiente"
          >
            <IconArrowRight width={26} height={26} />
          </button>
        </div>

        {/* --- What can go on it --- */}
        <div className={styles.insert} role="group" aria-label="Agregar a esta diapositiva">
          <span className={styles.insertLabel}>Agregar a esta diapositiva</span>
          <div className={styles.insertButtons}>
            {ADDABLE.map((type) => (
              <button
                key={type}
                type="button"
                className={styles.insertButton}
                onClick={() => setBlocks([...page.blocks, emptyBlock(type)])}
                disabled={full}
              >
                <span className={styles.insertIcon} aria-hidden="true">
                  {BLOCK_KINDS[type].icon}
                </span>
                {BLOCK_KINDS[type].label}
              </button>
            ))}
            <label className={styles.insertButton} aria-disabled={full || uploading !== null}>
              <span className={styles.insertIcon} aria-hidden="true">
                <IconImage width={16} height={16} />
              </span>
              {uploading === `${index}-new` ? "Subiendo…" : "Imagen"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className={styles.fileInput}
                onChange={pickNewImage}
                disabled={uploading !== null || full}
                aria-label={`Agregar una imagen a la diapositiva ${index + 1}`}
              />
            </label>
          </div>
        </div>
        <p className={styles.tip}>
          Diapositivas cortas se leen mejor siguiendo con la mirada: {owner} se lee en 5 a 15 minutos, unas 6 a 10
          diapositivas.
        </p>
      </section>

      {confirmingRemove && (
        <ConfirmDialog
          title="Eliminar diapositiva"
          message={`¿Quieres eliminar la diapositiva ${index + 1}? Se quita todo lo que tiene.`}
          acceptLabel="Sí, eliminarla"
          cancelLabel="Cancelar"
          danger
          onAccept={removeSlide}
          onCancel={() => setConfirmingRemove(false)}
        />
      )}
    </div>
  );
}
