import { Link } from "react-router-dom";
import { useClassroomLessons } from "@/shared/api/hooks/useLessonsApi";
import { IconArrowRight, IconBook, IconPlus } from "@/shared/ui/icons";
import styles from "../portalSection.module.css";

interface LessonsPanelProps {
  classroomId: string;
}

/** "Lecciones" of a classroom: the list and the way into the editor. The
 * full lesson editor (blocks, activity, publishing) comes with phase 3 of
 * the teacher's portal, see docs/specs/portal-docente.md. */
export function LessonsPanel({ classroomId }: LessonsPanelProps) {
  const lessons = useClassroomLessons(classroomId);

  return (
    <section aria-labelledby="lecciones-titulo" className={styles.section}>
      <h2 id="lecciones-titulo" className={styles.subTitle}>
        Lecciones de la clase
      </h2>
      <Link
        to={`/teacher/classrooms/${classroomId}/lessons/create`}
        className={`${styles.primaryButton} ${styles.alignStart}`}
      >
        <IconPlus width={16} height={16} />
        Nueva lección
      </Link>

      {lessons.isLoading && <p className={styles.status}>Cargando las lecciones…</p>}
      {lessons.isError && (
        <p role="alert" className={`${styles.status} ${styles.error}`}>
          No pudimos cargar las lecciones. Intenta recargar la página.
        </p>
      )}
      {lessons.data && lessons.data.length === 0 && (
        <div className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden="true">
            <IconBook width={24} height={24} />
          </span>
          <p className={styles.emptyTitle}>Esta clase aún no tiene lecciones</p>
          <p className={styles.emptyText}>Crea la primera con "Nueva lección".</p>
        </div>
      )}
      {lessons.data && lessons.data.length > 0 && (
        <ul className={styles.list}>
          {lessons.data.map((lesson) => (
            <li key={lesson.id}>
              <Link
                to={`/teacher/classrooms/${classroomId}/lessons/${lesson.id}/edit`}
                className={`${styles.row} ${styles.optionCard}`}
              >
                <span className={styles.optionIcon} aria-hidden="true">
                  <IconBook width={22} height={22} />
                </span>
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>{lesson.title}</span>
                  <span className={styles.rowMeta}>
                    {lesson.status === "publicada" ? "Publicada" : "En progreso, solo la ves tú"}
                  </span>
                </span>
                <IconArrowRight width={18} height={18} className={styles.optionArrow} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
