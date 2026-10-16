import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { LessonDetail } from "@iris/shared-types";
import { LessonPlayer } from "@/features/student/lesson/LessonPlayer";
import { IconClose, IconEye, IconUndo } from "@/shared/ui/icons";
import { useModalDialog } from "@/shared/ui/useModalDialog";
import { previewLesson, type LessonDraft } from "./previewLesson";
import styles from "./LessonPreview.module.css";

interface LessonPreviewProps {
  lesson: LessonDetail;
  draft: LessonDraft;
  onClose: () => void;
}

/** The teacher's draft (saved or not) the way a kid will see it, over the
 * whole screen. The teacher can try it with the mouse, but nothing is saved
 * and "Empezar de nuevo" goes back to the start. */
export function LessonPreview({ lesson, draft, onClose }: LessonPreviewProps) {
  const { ref, leaving, close } = useModalDialog<HTMLDivElement>();
  // A new run of the preview, from the start.
  const [run, setRun] = useState(0);
  const preview = useMemo(() => previewLesson(lesson, draft), [lesson, draft]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close(onClose);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close, onClose]);

  return createPortal(
    <div
      ref={ref}
      className={leaving ? `${styles.backdrop} ${styles.leaving}` : styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lesson-preview-title"
    >
      <header className={styles.bar}>
        <span className={styles.barIcon} aria-hidden="true">
          <IconEye width={20} height={20} />
        </span>
        <div className={styles.barText}>
          <h2 id="lesson-preview-title" className={styles.barTitle}>
            Vista previa · así la verá tu estudiante
          </h2>
          <p className={styles.barNote}>Puedes leerla y responderla como un peque. Nada de lo que hagas aquí se guarda.</p>
        </div>
        <button type="button" className={styles.again} onClick={() => setRun((n) => n + 1)}>
          <IconUndo width={16} height={16} />
          Empezar de nuevo
        </button>
        <button type="button" className={styles.close} onClick={() => close(onClose)}>
          <IconClose width={18} height={18} />
          Cerrar
        </button>
      </header>

      <div className={styles.screen} data-theme="kid">
        <LessonPlayer
          key={run}
          lesson={preview.lesson}
          backend={preview.backend}
          onExit={() => setRun((n) => n + 1)}
          onReload={() => setRun((n) => n + 1)}
        />
      </div>
    </div>,
    document.body,
  );
}
