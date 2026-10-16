import { useEffect, useRef } from "react";
import type { TrayBox } from "@/shared/api/hooks/useNotifications";
import { IconArrowLeft, IconArrowRight, IconInbox, IconSend, IconTrash } from "@/shared/ui/icons";
import styles from "./NotificationTray.module.css";
import { NOTIFICATION_WORDS, type TrayWords } from "./trayWords";

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
  /** Notifications unless said otherwise. */
  words?: TrayWords;
  /** "Recibidos" or "Enviados", and how to move between them. */
  box?: TrayBox;
  onBoxChange?: (box: TrayBox) => void;
}

const BOXES = [
  { box: "received", label: "Recibidos", Icon: IconInbox },
  { box: "sent", label: "Enviados", Icon: IconSend },
] as const;

/** The bar on top of the tray: a box to pick the whole page and, once
 * something is picked, how many and "Eliminar"; then "Recibidos" and
 * "Enviados", like the folders of a mail; on the right, which ones are
 * shown and the arrows to the other pages. */
export function TrayToolbar({
  selectedCount,
  allSelected,
  onToggleAll,
  onDelete,
  busy,
  range,
  words = NOTIFICATION_WORDS,
  box,
  onBoxChange,
}: TrayToolbarProps) {
  const pickAll = useRef<HTMLInputElement>(null);

  // Half marked when only some are picked, like Gmail.
  useEffect(() => {
    if (pickAll.current) pickAll.current.indeterminate = selectedCount > 0 && !allSelected;
  }, [selectedCount, allSelected]);

  return (
    <div className={styles.toolbar}>
      <label className={styles.check}>
        <input
          ref={pickAll}
          type="checkbox"
          checked={allSelected}
          onChange={onToggleAll}
          disabled={range.total === 0}
          aria-label={`Seleccionar ${words.all} ${words.those} ${words.many} de esta página`}
        />
      </label>
      {selectedCount > 0 ? (
        <>
          <span className={styles.toolbarText} aria-live="polite">
            {selectedCount === 1 ? `1 ${words.picked}` : `${selectedCount} ${words.pickedMany}`}
          </span>
          <button type="button" className={styles.toolbarDelete} onClick={onDelete} disabled={busy}>
            <IconTrash width={16} height={16} />
            Eliminar
          </button>
        </>
      ) : (
        <span className={styles.toolbarHint}>Seleccionar {words.all}</span>
      )}

      {box && onBoxChange && (
        <div className={styles.boxes} role="group" aria-label="Bandeja">
          {BOXES.map(({ box: each, label, Icon }) => (
            <button
              key={each}
              type="button"
              className={styles.box}
              aria-pressed={box === each}
              onClick={() => onBoxChange(each)}
            >
              <Icon width={17} height={17} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      )}

      <div className={styles.toolbarRange}>
        {range.total > 0 && (
          <span className={styles.toolbarCount}>
            {range.from}–{range.to} de {range.total}
          </span>
        )}
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
