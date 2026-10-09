import type { ContentBlock } from "@iris/shared-types";
import { BigChoiceButton } from "@/shared/ui/BigChoiceButton";
import { IconArrowLeft } from "@/shared/ui/icons";
import { BlockView } from "@/shared/ui/lesson/BlockView";
import { DwellArrow } from "../components/DwellArrow";
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

/** One page at a time, with the big arrows on the sides (HU-62). The way
 * back is on every page: leaving halfway keeps the page for next time. */
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
    <main className={styles.viewer}>
      <DwellArrow
        direction="left"
        label={page === 0 ? "Volver" : "Página anterior"}
        onSelect={() => (page === 0 ? onBefore() : onPage(page - 1))}
        dwellDurationMs={dwellDurationMs}
      />
      <div className={styles.content}>
        <div className={styles.pagesTop}>
          <BigChoiceButton
            variant="teal"
            icon={<IconArrowLeft width={28} height={28} />}
            onSelect={onBefore}
            dwellDurationMs={dwellDurationMs}
          >
            {backLabel}
          </BigChoiceButton>
          <p className={styles.counter} aria-live="polite">
            {title} · Página {page + 1} de {pages.length}
          </p>
        </div>
        <div className={styles.page}>
          {pages[page].map((block) => (
            <BlockView key={block.id} block={block} lessonId={lessonId} large />
          ))}
        </div>
      </div>
      <DwellArrow
        direction="right"
        label={last ? "Terminar la lectura" : "Página siguiente"}
        onSelect={() => (last ? onDone() : onPage(page + 1))}
        dwellDurationMs={dwellDurationMs}
      />
    </main>
  );
}
