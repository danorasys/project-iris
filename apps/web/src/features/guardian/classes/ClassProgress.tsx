import { Navigate } from "react-router-dom";
import type { LessonProgress, PartProgress, ProgressAttempt } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { formatShortArrival } from "@/features/utils/formatArrival";
import { useFamilyProgress } from "@/shared/api/hooks/useClassroomsApi";
import { IconBook, IconCheck, IconSparkle } from "@/shared/ui/icons";
import { isPortalAccessRequired } from "../portalAccess";
import styles from "./ClassProgress.module.css";

/** HU-46 and HU-47: how far the kid got in each lesson of the class, unit
 * by unit, regular and extra, with a bar and its percentage, and every try
 * at the activities with its score. */
export function ClassProgress({ enrollmentId, firstName }: { enrollmentId: string; firstName: string }) {
  const progress = useFamilyProgress(enrollmentId);

  if (isPortalAccessRequired(progress.error)) return <Navigate to="/guardian/verify-2fa" replace />;
  if (progress.isLoading) return <p className={styles.status}>Cargando el progreso…</p>;
  if (progress.isError || !progress.data) {
    return (
      <p role="alert" className={`${styles.status} ${styles.error}`}>
        {getAuthErrorMessage(progress.error)}
      </p>
    );
  }

  const lessons = progress.data;
  if (lessons.length === 0) {
    return (
      <section className={styles.panel}>
        <p className={styles.empty}>
          Esta clase todavía no tiene lecciones publicadas. Aquí verás cómo avanza {firstName}.
        </p>
      </section>
    );
  }

  const finished = lessons.filter((lesson) => lesson.main.percent === 100).length;
  // The units in the order the lessons come, each with its lessons.
  const units: { title: string; lessons: LessonProgress[] }[] = [];
  for (const lesson of lessons) {
    const last = units[units.length - 1];
    if (last && last.title === lesson.unit_title) last.lessons.push(lesson);
    else units.push({ title: lesson.unit_title, lessons: [lesson] });
  }

  return (
    <>
      <section className={styles.summary} aria-label="Resumen del progreso">
        <span className={styles.summaryNumber}>
          {finished} de {lessons.length}
        </span>
        <span className={styles.summaryText}>
          {lessons.length === 1 ? "lección terminada" : "lecciones terminadas"} por {firstName}
        </span>
      </section>

      {units.map((unit, index) => (
        <section key={`${unit.title}-${index}`} className={styles.panel} aria-labelledby={`unit-${index}`}>
          <h3 id={`unit-${index}`} className={styles.unitTitle}>
            {unit.title}
          </h3>
          <ul className={styles.lessons}>
            {unit.lessons.map((lesson) => (
              <li key={lesson.lesson_id} className={styles.lesson}>
                <Part part={lesson.main} />
                {lesson.extras.length > 0 && (
                  <ul className={styles.extras} aria-label={`Contenido extra de ${lesson.title}`}>
                    {lesson.extras.map((extra) => (
                      <li key={extra.extra_id}>
                        <Part part={extra} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

const KIND_LABEL = { leccion: "Lección", contenido: "Extra para leer", actividad: "Actividad extra" } as const;

// One part with its bar, what it has done, and its record of tries.
function Part({ part }: { part: PartProgress }) {
  const isLesson = part.kind === "leccion";
  const done = part.percent === 100;
  return (
    <div className={isLesson ? styles.part : `${styles.part} ${styles.extraPart}`}>
      <div className={styles.partHead}>
        <span className={styles.partIcon} aria-hidden="true">
          {isLesson ? <IconBook width={18} height={18} /> : <IconSparkle width={18} height={18} />}
        </span>
        <span className={styles.partText}>
          <span className={styles.kind}>{KIND_LABEL[part.kind]}</span>
          <span className={styles.partTitle}>{part.title}</span>
        </span>
        <span className={done ? `${styles.percent} ${styles.done}` : styles.percent}>
          {done && <IconCheck width={14} height={14} aria-hidden="true" />}
          {part.percent}%
        </span>
      </div>

      <div
        className={styles.bar}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={part.percent}
        aria-label={`Progreso de ${part.title}`}
      >
        <span
          className={done ? `${styles.fill} ${styles.fillDone}` : styles.fill}
          style={{ width: `${part.percent}%` }}
        />
      </div>

      <p className={styles.facts}>
        {part.total_pages > 0 &&
          `Leyó ${part.pages_seen} de ${part.total_pages} ${part.total_pages === 1 ? "página" : "páginas"}`}
        {part.total_pages > 0 && part.has_activity && " · "}
        {part.has_activity &&
          (part.attempts.length === 0
            ? "Aún no intenta la actividad"
            : `${part.attempts.length} ${part.attempts.length === 1 ? "intento" : "intentos"} en la actividad`)}
      </p>

      {part.attempts.length > 0 && <Attempts attempts={part.attempts} title={part.title} />}
    </div>
  );
}

// HU-47: every try, the oldest first, with its score and if it passed.
function Attempts({ attempts, title }: { attempts: ProgressAttempt[]; title: string }) {
  return (
    <table className={styles.attempts}>
      <caption className={styles.visuallyHidden}>Intentos en la actividad de {title}</caption>
      <thead>
        <tr>
          <th scope="col">Intento</th>
          <th scope="col">Fecha</th>
          <th scope="col">Aciertos</th>
          <th scope="col">Resultado</th>
        </tr>
      </thead>
      <tbody>
        {attempts.map((attempt, index) => (
          <tr key={`${attempt.created_at}-${index}`}>
            <td>{index + 1}</td>
            <td>
              <time dateTime={attempt.created_at}>{formatShortArrival(attempt.created_at)}</time>
            </td>
            <td>
              {attempt.correct} de {attempt.total} ({Math.round((100 * attempt.correct) / attempt.total)}%)
            </td>
            <td>
              <span className={attempt.passed ? `${styles.pill} ${styles.passed}` : `${styles.pill} ${styles.review}`}>
                {attempt.passed ? "Aprobó" : "Para repasar"}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
