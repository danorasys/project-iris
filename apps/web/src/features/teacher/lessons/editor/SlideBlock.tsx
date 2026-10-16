import type { ChangeEvent, ReactNode } from "react";
import { lessonImagePath } from "@/shared/api/mediaPaths";
import { AuthImage } from "@/shared/ui/AuthImage";
import { IconArrowDown, IconArrowUp, IconImage, IconPlus, IconTrash } from "@/shared/ui/icons";
import { LIMITS } from "../lessonLimits";
import { BLOCK_KINDS } from "./blockKinds";
import { removeAt, replaceAt, type EditorBlock } from "./editorModel";
import styles from "./Slides.module.css";

interface SlideBlockProps {
  block: EditorBlock;
  lessonId: string;
  /** "Diapositiva 2, bloque 3", for the labels of screen readers. */
  where: string;
  onChange: (block: EditorBlock) => void;
  onMove: (step: -1 | 1) => void;
  onRemove: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** Picks a new picture for an image block. */
  onReplaceImage: (file: File) => void;
  uploading: boolean;
}

/** One block written right on the slide, looking the way the kid will read
 * it: a title is written big like a title, a paragraph like a paragraph.
 * Its buttons (move it, take it out) show when it's pointed at or focused.
 * Nothing is HTML: what's written is plain text. */
export function SlideBlock({
  block,
  lessonId,
  where,
  onChange,
  onMove,
  onRemove,
  canMoveUp,
  canMoveDown,
  onReplaceImage,
  uploading,
}: SlideBlockProps) {
  const kind = BLOCK_KINDS[block.type];

  function pickImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onReplaceImage(file);
  }

  let editor: ReactNode = null;
  switch (block.type) {
    case "titulo":
    case "subtitulo":
      editor = (
        <input
          className={block.type === "titulo" ? styles.title : styles.subtitle}
          value={block.text}
          maxLength={LIMITS.heading}
          onChange={(event) => onChange({ ...block, text: event.target.value.replace(/\n/g, " ") })}
          aria-label={`${kind.label}, ${where}`}
          placeholder={block.type === "titulo" ? "Escribe el título" : "Escribe el subtítulo"}
          data-empty={!block.text.trim()}
        />
      );
      break;
    case "texto":
      editor = (
        <textarea
          className={styles.paragraph}
          value={block.text}
          maxLength={LIMITS.paragraph}
          onChange={(event) => onChange({ ...block, text: event.target.value })}
          aria-label={`Párrafo, ${where}`}
          placeholder="Escribe lo que el peque va a leer"
          rows={2}
          data-empty={!block.text.trim()}
        />
      );
      break;
    case "lista":
      editor = (
        <div className={styles.list}>
          {block.items.map((item, index) => (
            // Items are plain strings that can repeat, their position is their key.
            <div key={index} className={styles.listItem}>
              <span className={styles.bullet} aria-hidden="true" />
              <input
                className={styles.listInput}
                value={item}
                maxLength={LIMITS.listItem}
                onChange={(event) => onChange({ ...block, items: replaceAt(block.items, index, event.target.value) })}
                aria-label={`Elemento ${index + 1} de la lista, ${where}`}
                placeholder={`Elemento ${index + 1}`}
                data-empty={!item.trim()}
              />
              <button
                type="button"
                className={styles.inlineRemove}
                onClick={() => onChange({ ...block, items: removeAt(block.items, index) })}
                disabled={block.items.length === 1}
                aria-label={`Quitar el elemento ${index + 1} de la lista`}
              >
                <IconTrash width={14} height={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className={styles.inlineAdd}
            onClick={() => onChange({ ...block, items: [...block.items, ""] })}
            disabled={block.items.length >= LIMITS.listItems}
          >
            <IconPlus width={14} height={14} /> Agregar elemento
          </button>
        </div>
      );
      break;
    case "tabla": {
      const columns = block.rows[0]?.length ?? 1;
      const setCell = (row: number, column: number, value: string) =>
        onChange({ ...block, rows: replaceAt(block.rows, row, replaceAt(block.rows[row], column, value)) });
      editor = (
        <div className={styles.tableBlock}>
          <div className={styles.tableWrap}>
            <div className={styles.table} style={{ gridTemplateColumns: `repeat(${columns}, minmax(110px, 1fr))` }}>
              {block.rows.map((row, rowIndex) =>
                row.map((cell, column) => (
                  <input
                    // Cells are plain strings, their position is their key.
                    key={`${rowIndex}-${column}`}
                    className={rowIndex === 0 ? `${styles.cell} ${styles.headerCell}` : styles.cell}
                    value={cell}
                    maxLength={LIMITS.tableCell}
                    onChange={(event) => setCell(rowIndex, column, event.target.value)}
                    aria-label={
                      rowIndex === 0
                        ? `Encabezado de la columna ${column + 1}, ${where}`
                        : `Fila ${rowIndex}, columna ${column + 1}, ${where}`
                    }
                    placeholder={rowIndex === 0 ? "Encabezado" : ""}
                    data-empty={!cell.trim()}
                  />
                )),
              )}
            </div>
          </div>
          <div className={styles.inlineRow}>
            <button
              type="button"
              className={styles.inlineAdd}
              onClick={() => onChange({ ...block, rows: [...block.rows, Array<string>(columns).fill("")] })}
              disabled={block.rows.length >= LIMITS.tableRows}
            >
              <IconPlus width={14} height={14} /> Fila
            </button>
            <button
              type="button"
              className={styles.inlineAdd}
              onClick={() => onChange({ ...block, rows: block.rows.slice(0, -1) })}
              disabled={block.rows.length <= 2}
            >
              Quitar fila
            </button>
            <button
              type="button"
              className={styles.inlineAdd}
              onClick={() => onChange({ ...block, rows: block.rows.map((row) => [...row, ""]) })}
              disabled={columns >= LIMITS.tableColumns}
            >
              <IconPlus width={14} height={14} /> Columna
            </button>
            <button
              type="button"
              className={styles.inlineAdd}
              onClick={() => onChange({ ...block, rows: block.rows.map((row) => row.slice(0, -1)) })}
              disabled={columns <= 1}
            >
              Quitar columna
            </button>
          </div>
        </div>
      );
      break;
    }
    case "imagen":
      editor = (
        <figure className={styles.figure}>
          <AuthImage path={lessonImagePath(lessonId, block.image_file)} alt="" className={styles.image} />
          <figcaption className={styles.altBox}>
            <input
              className={styles.altInput}
              value={block.alt_text ?? ""}
              maxLength={LIMITS.altText}
              onChange={(event) => onChange({ ...block, alt_text: event.target.value })}
              aria-label={`Descripción de la imagen, ${where}`}
              placeholder="Describe la imagen, por ejemplo: un perro corriendo en el parque"
              data-empty={!(block.alt_text ?? "").trim()}
            />
            <label className={styles.inlineAdd}>
              <IconImage width={14} height={14} />
              {uploading ? "Subiendo…" : "Cambiar imagen"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className={styles.fileInput}
                onChange={pickImage}
                disabled={uploading}
              />
            </label>
          </figcaption>
          {!(block.alt_text ?? "").trim() && (
            <p className={styles.altMissing}>Describe la imagen: la necesita quien no puede verla.</p>
          )}
        </figure>
      );
      break;
  }

  return (
    <div className={styles.block} data-type={block.type}>
      <div className={styles.blockTools}>
        <span className={styles.blockKind}>
          {kind.icon}
          {kind.label}
        </span>
        <button
          type="button"
          className={styles.toolButton}
          onClick={() => onMove(-1)}
          disabled={!canMoveUp}
          aria-label={`Subir ${kind.label.toLowerCase()}, ${where}`}
        >
          <IconArrowUp width={15} height={15} />
        </button>
        <button
          type="button"
          className={styles.toolButton}
          onClick={() => onMove(1)}
          disabled={!canMoveDown}
          aria-label={`Bajar ${kind.label.toLowerCase()}, ${where}`}
        >
          <IconArrowDown width={15} height={15} />
        </button>
        <button
          type="button"
          className={`${styles.toolButton} ${styles.toolDanger}`}
          onClick={onRemove}
          aria-label={`Quitar ${kind.label.toLowerCase()}, ${where}`}
        >
          <IconTrash width={15} height={15} />
        </button>
      </div>
      {editor}
    </div>
  );
}
