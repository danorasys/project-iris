import type { ChangeEvent, ReactNode } from "react";
import { lessonImagePath } from "@/shared/api/mediaPaths";
import { AuthImage } from "@/shared/ui/AuthImage";
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from "@/shared/ui/icons";
import { LIMITS } from "../lessonLimits";
import { BLOCK_KINDS } from "./blockKinds";
import { removeAt, replaceAt, type EditorBlock } from "./editorModel";
import styles from "./Editor.module.css";

interface BlockEditorProps {
  block: EditorBlock;
  lessonId: string;
  /** "Página 2, bloque 3", for the labels of screen readers. */
  where: string;
  onChange: (block: EditorBlock) => void;
  onMove: (step: -1 | 1) => void;
  onRemove: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** Picks a new picture for an image block. */
  onReplaceImage: (file: File) => void;
  uploading: boolean;
  disabled: boolean;
}

/** One block of a page, with the editor its type needs and its buttons to
 * move it or take it out. Nothing is HTML: what's written is plain text. */
export function BlockEditor({
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
  disabled,
}: BlockEditorProps) {
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
          className={`${styles.input} ${styles.headingInput} ${block.text.trim() ? "" : styles.inputMissing}`}
          value={block.text}
          maxLength={LIMITS.heading}
          onChange={(event) => onChange({ ...block, text: event.target.value.replace(/\n/g, " ") })}
          aria-label={`${kind.label}, ${where}`}
          placeholder={block.type === "titulo" ? "Escribe el título" : "Escribe el subtítulo"}
          disabled={disabled}
        />
      );
      break;
    case "texto":
      editor = (
        <textarea
          className={`${styles.textarea} ${block.text.trim() ? "" : styles.inputMissing}`}
          value={block.text}
          maxLength={LIMITS.paragraph}
          onChange={(event) => onChange({ ...block, text: event.target.value })}
          aria-label={`Párrafo, ${where}`}
          placeholder="Escribe el párrafo"
          disabled={disabled}
        />
      );
      break;
    case "lista":
      editor = (
        <div className={styles.stackTight}>
          {block.items.map((item, index) => (
            // Items are plain strings that can repeat, their position is their key.
            <div key={index} className={styles.row}>
              <span className={styles.bullet} aria-hidden="true" />
              <input
                className={`${styles.input} ${item.trim() ? "" : styles.inputMissing}`}
                value={item}
                maxLength={LIMITS.listItem}
                onChange={(event) => onChange({ ...block, items: replaceAt(block.items, index, event.target.value) })}
                aria-label={`Elemento ${index + 1} de la lista, ${where}`}
                disabled={disabled}
              />
              <button
                type="button"
                className={`${styles.iconButton} ${styles.danger}`}
                onClick={() => onChange({ ...block, items: removeAt(block.items, index) })}
                disabled={disabled || block.items.length === 1}
                aria-label={`Quitar el elemento ${index + 1} de la lista`}
              >
                <IconTrash width={16} height={16} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className={styles.small}
            onClick={() => onChange({ ...block, items: [...block.items, ""] })}
            disabled={disabled || block.items.length >= LIMITS.listItems}
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
        <div className={styles.stackTight}>
          <div className={styles.tableWrap}>
            <div className={styles.tableGrid} style={{ gridTemplateColumns: `repeat(${columns}, minmax(110px, 1fr))` }}>
              {block.rows.map((row, rowIndex) =>
                row.map((cell, column) => (
                  <input
                    // Cells are plain strings, their position is their key.
                    key={`${rowIndex}-${column}`}
                    className={`${styles.input} ${rowIndex === 0 ? styles.headerCell : ""} ${cell.trim() ? "" : styles.inputMissing}`}
                    value={cell}
                    maxLength={LIMITS.tableCell}
                    onChange={(event) => setCell(rowIndex, column, event.target.value)}
                    aria-label={
                      rowIndex === 0
                        ? `Encabezado de la columna ${column + 1}, ${where}`
                        : `Fila ${rowIndex}, columna ${column + 1}, ${where}`
                    }
                    placeholder={rowIndex === 0 ? "Encabezado" : ""}
                    disabled={disabled}
                  />
                )),
              )}
            </div>
          </div>
          <div className={styles.row}>
            <button
              type="button"
              className={styles.small}
              onClick={() => onChange({ ...block, rows: [...block.rows, Array<string>(columns).fill("")] })}
              disabled={disabled || block.rows.length >= LIMITS.tableRows}
            >
              <IconPlus width={14} height={14} /> Fila
            </button>
            <button
              type="button"
              className={styles.small}
              onClick={() => onChange({ ...block, rows: block.rows.slice(0, -1) })}
              disabled={disabled || block.rows.length <= 2}
            >
              Quitar fila
            </button>
            <button
              type="button"
              className={styles.small}
              onClick={() => onChange({ ...block, rows: block.rows.map((row) => [...row, ""]) })}
              disabled={disabled || columns >= LIMITS.tableColumns}
            >
              <IconPlus width={14} height={14} /> Columna
            </button>
            <button
              type="button"
              className={styles.small}
              onClick={() => onChange({ ...block, rows: block.rows.map((row) => row.slice(0, -1)) })}
              disabled={disabled || columns <= 1}
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
        <div className={styles.stackTight}>
          <AuthImage path={lessonImagePath(lessonId, block.image_file)} alt="" className={styles.image} />
          <input
            className={`${styles.input} ${(block.alt_text ?? "").trim() ? "" : styles.inputMissing}`}
            value={block.alt_text ?? ""}
            maxLength={LIMITS.altText}
            onChange={(event) => onChange({ ...block, alt_text: event.target.value })}
            aria-label={`Descripción de la imagen, ${where}`}
            placeholder="Describe lo que muestra la imagen, por ejemplo: un perro corriendo en el parque"
            disabled={disabled}
          />
          {!(block.alt_text ?? "").trim() && (
            <p className={styles.missing}>Describe la imagen: la necesita quien no puede verla.</p>
          )}
          <label className={styles.small}>
            {uploading ? "Subiendo…" : "Cambiar imagen"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className={styles.fileInput}
              onChange={pickImage}
              disabled={disabled || uploading}
            />
          </label>
        </div>
      );
      break;
  }

  return (
    <div className={styles.block}>
      <div className={styles.blockHead}>
        <span className={styles.blockType}>
          {kind.icon}
          {kind.label}
        </span>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => onMove(-1)}
            disabled={disabled || !canMoveUp}
            aria-label={`Subir ${kind.label.toLowerCase()}, ${where}`}
          >
            <IconArrowUp width={16} height={16} />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => onMove(1)}
            disabled={disabled || !canMoveDown}
            aria-label={`Bajar ${kind.label.toLowerCase()}, ${where}`}
          >
            <IconArrowDown width={16} height={16} />
          </button>
          <button
            type="button"
            className={`${styles.iconButton} ${styles.danger}`}
            onClick={onRemove}
            disabled={disabled}
            aria-label={`Quitar ${kind.label.toLowerCase()}, ${where}`}
          >
            <IconTrash width={16} height={16} />
          </button>
        </div>
      </div>
      {editor}
    </div>
  );
}
