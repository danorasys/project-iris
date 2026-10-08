import { useEffect, useRef } from "react";
import { IconArrowLeft, IconArrowRight, IconTrash } from "@/shared/ui/icons";
import styles from "./NotificationTray.module.css";

/** Which ones of all are on this page ("1–8 de 26") and the arrows to the
 * page before and after; a missing one means there's no page there. */
export interface TrayRange {
  from: number;
  to: number;
  total: number;
  onPrev?: () => void;
  onNext?: () => void;
}

interface TrayToolbarProps {
  selectedCount: number;
  allSelected: boolean;
  onToggleAll: () => void;
  onDelete: () => void;
  busy: boolean;
  range: TrayRange;
}

/** The bar on top of the tray: a box to pick the whole page and, once
 * something is picked, how many and "Eliminar"; on the right, which ones
 * are shown and the arrows to the other pages. */
export function TrayToolbar({ selectedCount, allSelected, onToggleAll, onDelete, busy, range }: TrayToolbarProps) {
  const box = useRef<HTMLInputElement>(null);

  // Half marked when only some are picked, like Gmail.
  useEffect(() => {
    if (box.current) box.current.indeterminate = selectedCount > 0 && !allSelected;
  }, [selectedCount, allSelected]);

  return (
    <div className={styles.toolbar}>
      <label className={styles.check}>
        <input
          ref={box}
          type="checkbox"
          checked={allSelected}
          onChange={onToggleAll}
          aria-label="Seleccionar todas las notificaciones de esta página"
        />
      </label>
      {selectedCount > 0 ? (
        <>
          <span className={styles.toolbarText} aria-live="polite">
            {selectedCount === 1 ? "1 seleccionada" : `${selectedCount} seleccionadas`}
          </span>
          <button type="button" className={styles.toolbarDelete} onClick={onDelete} disabled={busy}>
            <IconTrash width={16} height={16} />
            Eliminar
          </button>
        </>
      ) : (
        <span className={styles.toolbarHint}>Seleccionar todas</span>
      )}

      <div className={styles.toolbarRange}>
        <span className={styles.toolbarCount}>
          {range.from}–{range.to} de {range.total}
        </span>
        <button
          type="button"
          className={styles.mailStep}
          onClick={range.onPrev}
          disabled={!range.onPrev}
          aria-label="Página anterior"
          title="Página anterior"
        >
          <IconArrowLeft width={18} height={18} />
        </button>
        <button
          type="button"
          className={styles.mailStep}
          onClick={range.onNext}
          disabled={!range.onNext}
          aria-label="Página siguiente"
          title="Página siguiente"
        >
          <IconArrowRight width={18} height={18} />
        </button>
      </div>
    </div>
  );
}
