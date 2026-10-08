import { IconArrowLeft, IconArrowRight } from "@/shared/ui/icons";
import { GAP, pageNumbers } from "./pageNumbers";
import styles from "./NotificationTray.module.css";

interface TrayPagerProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

/** The pages of the tray, under the list: "Anterior", the page numbers
 * (with "…" when there are many) and "Siguiente". The current page is
 * blue. Only shown when there's more than one page. */
export function TrayPager({ page, totalPages, onChange }: TrayPagerProps) {
  if (totalPages <= 1) return null;

  return (
    <nav className={styles.pager} aria-label="Páginas de notificaciones">
      <button type="button" className={styles.pagerButton} onClick={() => onChange(page - 1)} disabled={page <= 1}>
        <IconArrowLeft width={16} height={16} />
        Anterior
      </button>

      <ol className={styles.pageList}>
        {pageNumbers(page, totalPages).map((item, index) =>
          item === GAP ? (
            <li key={`gap-${index}`} className={styles.pageGap} aria-hidden="true">
              …
            </li>
          ) : (
            <li key={item}>
              <button
                type="button"
                className={item === page ? `${styles.pageNumber} ${styles.pageCurrent}` : styles.pageNumber}
                onClick={() => onChange(item)}
                aria-label={`Página ${item}`}
                aria-current={item === page ? "page" : undefined}
              >
                {item}
              </button>
            </li>
          ),
        )}
      </ol>

      <button
        type="button"
        className={styles.pagerButton}
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
      >
        Siguiente
        <IconArrowRight width={16} height={16} />
      </button>

      <span className={styles.visuallyHidden} aria-live="polite">
        Página {page} de {totalPages}
      </span>
    </nav>
  );
}
