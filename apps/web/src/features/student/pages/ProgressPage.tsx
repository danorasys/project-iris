import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { PartProgress } from "@iris/shared-types";
import { formatShortArrival } from "@/features/utils/formatArrival";
import { useAuth } from "@/shared/auth/useAuth";
import { useStudentClassrooms } from "@/shared/api/hooks/useClassroomsApi";
import { useMyClassProgress } from "@/shared/api/hooks/useLessonsApi";
import { BigChoiceButton } from "@/shared/ui/BigChoiceButton";
import { IconArrowLeft } from "@/shared/ui/icons";
import { Mascot } from "@/shared/ui/Mascot";
import { ViewEnter } from "@/shared/ui/ViewEnter";
import { DwellArrow } from "../components/DwellArrow";
import { getDwellDurationMs } from "../lib/dwellPreferences";
import styles from "./ProgressPage.module.css";

/** `/student/classrooms/:classroomId/progress` (HU-58, HU-59): how far the
 * kid got in each lesson of the class and its extras, as a bar with its
 * percent, and every try at their activities with its score. One lesson per
 * screen, the big arrows go through them. */
export default function ProgressPage() {
  const { classroomId = "" } = useParams<{ classroomId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const dwellDurationMs = session ? getDwellDurationMs(session.subjectId) : undefined;
  const progress = useMyClassProgress(classroomId);
  const classroom = useStudentClassrooms().data?.find((c) => c.id === classroomId);
  const [index, setIndex] = useState(0);

  const back = (
    <BigChoiceButton
      variant="teal"
      icon={<IconArrowLeft width={36} height={36} />}
      onSelect={() => navigate(`/student/classrooms/${classroomId}`)}
      dwellDurationMs={dwellDurationMs}
    >
      Volver a la clase
    </BigChoiceButton>
  );

  const lessons = progress.data ?? [];
  if (progress.isLoading || progress.isError || lessons.length === 0) {
    return (
      <main className={styles.centered}>
        <Mascot mood={progress.isError ? "thinking" : "happy"} size="large">
          {progress.isLoading
            ? "Buscando tu progreso…"
            : progress.isError
              ? "No pudimos cargar tu progreso. Inténtalo de nuevo en un momento."
              : "Tu profe todavía no ha publicado lecciones aquí. ¡Cuando lo haga, aquí verás cómo vas!"}
        </Mascot>
        {!progress.isLoading && back}
      </main>
    );
  }

  const current = Math.min(index, lessons.length - 1);
  const lesson = lessons[current];
  const paged = lessons.length > 1;

  return (
    <main className={styles.layout}>
      {paged && (
        <DwellArrow
          direction="left"
          label="Lección anterior"
          disabled={current === 0}
          onSelect={() => setIndex(Math.max(current - 1, 0))}
          dwellDurationMs={dwellDurationMs}
        />
      )}
      <div className={styles.middle}>
        {/* The way back on top: below a long lesson it could fall off the
            screen, and with the gaze there's no scrolling down to it. */}
        <div className={styles.head}>
          {back}
          <h1 className={styles.title}>Mi progreso{classroom ? ` en ${classroom.name}` : ""}</h1>
        </div>
        <ViewEnter view={lesson.lesson_id} level={current} className={styles.lesson}>
          <p className={styles.unit}>{lesson.unit_title}</p>
          <h2 className={styles.lessonTitle}>{lesson.title}</h2>
          <PartView part={lesson.main} label="La lección" />
          {lesson.extras.length > 0 && (
            <div className={styles.extras}>
              <h3 className={styles.extrasTitle}>Extra</h3>
              {lesson.extras.map((extra) => (
                <PartView
                  key={extra.extra_id}
                  part={extra}
                  label={`${extra.title} · ${extra.kind === "actividad" ? "actividad" : "para leer"}`}
                />
              ))}
            </div>
          )}
        </ViewEnter>
        {paged && (
          <p className={styles.count} aria-live="polite">
            Lección {current + 1} de {lessons.length}
          </p>
        )}
      </div>
      {paged && (
        <DwellArrow
          direction="right"
          label="Lección siguiente"
          disabled={current === lessons.length - 1}
          onSelect={() => setIndex(Math.min(current + 1, lessons.length - 1))}
          dwellDurationMs={dwellDurationMs}
        />
      )}
    </main>
  );
}

// One part (the lesson or an extra): its bar with the percent and, if it
// has an activity, every try with its score (HU-59).
function PartView({ part, label }: { part: PartProgress; label: string }) {
  return (
    <section className={styles.part} aria-label={label}>
      <div className={styles.partTop}>
        <span className={styles.partLabel}>{label}</span>
        <span className={styles.percent}>{part.percent} %</span>
      </div>
      <div
        className={styles.bar}
        role="progressbar"
        aria-label={`Avance de ${label}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={part.percent}
      >
        <span className={styles.barFill} style={{ width: `${part.percent}%` }} />
      </div>
      {part.has_activity &&
        (part.attempts.length === 0 ? (
          <p className={styles.noTries}>Aún no has hecho la actividad.</p>
        ) : (
          <ol className={styles.tries} aria-label={`Intentos de ${label}`}>
            {part.attempts.map((attempt, i) => (
              <li key={`${i}-${attempt.created_at}`} className={attempt.passed ? styles.passed : styles.notYet}>
                <span className={styles.tryNumber}>Intento {i + 1}</span>
                <span>
                  {attempt.correct} de {attempt.total}
                </span>
                <span>{attempt.passed ? "¡Aprobado!" : "Para repasar"}</span>
                <span className={styles.tryDate}>{formatShortArrival(attempt.created_at)}</span>
              </li>
            ))}
          </ol>
        ))}
    </section>
  );
}
