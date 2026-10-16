import type { ContentBlock } from "@iris/shared-types";
import { BlockView } from "@/shared/ui/lesson/BlockView";
import { KidPage } from "@/shared/ui/kid/KidKit";
import styles from "./LessonPlayer.module.css";

interface PagesStepProps {
  lessonId: string;
  title: string;
  pages: ContentBlock[][];
  page: number;
  dwellDurationMs?: number;
  onPage: (page: number) => void;
  /** Back to where they came from, from any page; the page is kept. */
  onBefore: () => void;
  /** What the way back says: "Volver a la lección" or "a los extras". */
  backLabel: string;
  /** After the last page. */
  onDone: () => void;
}

/** One page at a time, with the arrows on the edges of the screen (HU-62).
 * The page is a white sheet in the middle, drawn in the kid's own colors,
 * the same as the teacher sees it in the editor. The way back is the bar on
 * the bottom edge: leaving halfway keeps the page for next time. */
export function PagesStep({
  lessonId,
  title,
  pages,
  page,
  dwellDurationMs,
  onPage,
  onBefore,
  backLabel,
  onDone,
}: PagesStepProps) {
  const last = page === pages.length - 1;
  return (
    <KidPage
      fill
      back={{ label: backLabel, onSelect: onBefore }}
      previousArrow={{
        label: page === 0 ? "Volver" : "Página anterior",
        onSelect: () => (page === 0 ? onBefore() : onPage(page - 1)),
      }}
      nextArrow={{
        label: last ? "Terminar la lectura" : "Página siguiente",
        onSelect: () => (last ? onDone() : onPage(page + 1)),
      }}
      dwellDurationMs={dwellDurationMs}
    >
      <div className={styles.sheetTop}>
        <p className={styles.counter} aria-live="polite">
          {title} · Página {page + 1} de {pages.length}
        </p>
        <span className={styles.progressTrack} aria-hidden="true">
          <span className={styles.progressFill} style={{ width: `${((page + 1) / pages.length) * 100}%` }} />
        </span>
      </div>
      <div className={styles.sheet} data-theme="kid">
        {pages[page].map((block) => (
          <BlockView key={block.id} block={block} lessonId={lessonId} large />
        ))}
      </div>
    </KidPage>
  );
}
