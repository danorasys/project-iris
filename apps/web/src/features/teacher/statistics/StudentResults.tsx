import type { CSSProperties } from "react";
import type { ClassStatistics, KidInLesson } from "@iris/shared-types";
import { CountUp } from "@/shared/ui/charts/CountUp";
import { ProgressRing } from "@/shared/ui/charts/ProgressRing";
import { IconArrowLeft, IconArrowRight, IconBook, IconCheck, IconClock, IconSparkle } from "@/shared/ui/icons";
import { StudentAvatarImage } from "@/shared/ui/StudentAvatarImage";
import { Kpi } from "./StatisticsParts";
import { fullName, kidResults, scoreText } from "./statisticsView";
import portal from "../portal/portalSection.module.css";
import styles from "./StatisticsPanel.module.css";

// Where a kid is in one lesson, in words.
function stateOf(result: KidInLesson | null): { text: string; tone: "done" | "going" | "none" } {
  if (!result || result.percent === 0) return { text: "Sin empezar", tone: "none" };
  if (result.percent === 100) return { text: "Completada", tone: "done" };
  return { text: "En curso", tone: "going" };
}

// What they did in the activity of one lesson.
function activityText(hasActivity: boolean, result: KidInLesson | null): string {
  if (!hasActivity) return "Sin actividad";
  if (!result || result.tries === 0) return "Aún no intenta la actividad";
  const tries = result.tries === 1 ? "1 intento" : `${result.tries} intentos`;
  return `Mejor intento: ${scoreText(result)}${result.passed ? " · aprobó" : " · no ha aprobado"} · ${tries}`;
}

const order = (n: number) => ({ "--order": n }) as CSSProperties;

/** The results of one kid (one by one): their avatar inside a ring with how
 * far they got, their full name, their totals and, unit by unit, how they
 * did in every lesson. A lesson opens its own statistics. */
export function StudentResults({
  data,
  studentId,
  backLabel,
  onBack,
  onOpenLesson,
}: {
  data: ClassStatistics;
  studentId: string;
  backLabel: string;
  onBack: () => void;
  onOpenLesson: (lessonId: string) => void;
}) {
  const kid = data.by_kid.find((k) => k.student_id === studentId);
  const back = (
    <button type="button" className={portal.backButton} onClick={onBack}>
      <IconArrowLeft width={18} height={18} />
      {backLabel}
    </button>
  );
  if (!kid) {
    return (
      <>
        {back}
        <p className={portal.status}>Este estudiante ya no está en la clase.</p>
      </>
    );
  }

  const results = kidResults(data, studentId);
  const place = data.by_kid.indexOf(kid) + 1;
  return (
    <>
      {back}

      <header className={`${styles.hero} ${styles.rise}`} aria-labelledby="stats-student-name">
        <ProgressRing percent={kid.average_percent} size={112} stroke={8} label={`Avance de ${fullName(kid)}`}>
          <StudentAvatarImage avatarId={kid.avatar_id} size="medium" label="" />
        </ProgressRing>
        <div>
          <p className={styles.heroEyebrow}>Resultados del estudiante</p>
          <h2 id="stats-student-name" className={styles.heroTitle}>
            {fullName(kid)}
          </h2>
          <p className={styles.heroText}>
            Va en el puesto <strong>{place}</strong> de {data.by_kid.length} de la clase, con{" "}
            <strong>{kid.average_percent} %</strong> de avance.
          </p>
        </div>
      </header>

      <div className={styles.kpis}>
        <Kpi Icon={IconSparkle} value={kid.average_percent} suffix=" %" label="de avance promedio" />
        <Kpi
          Icon={IconBook}
          value={results.completed}
          of={results.lessons}
          label="lecciones completadas"
          order={1}
        />
        <Kpi
          Icon={IconCheck}
          value={results.passed}
          of={results.withActivity}
          label="actividades aprobadas"
          order={2}
        />
        <Kpi
          Icon={IconClock}
          value={results.tries}
          label={results.tries === 1 ? "intento en total" : "intentos en total"}
          order={3}
        />
      </div>

      <section aria-labelledby="stats-student-units" className={styles.units}>
        <h2 id="stats-student-units" className={styles.unitsTitle}>
          Por unidad
        </h2>
        {results.units.map((unit, number) => (
          <section
            key={unit.unitId}
            className={`${portal.panel} ${styles.unitCard} ${styles.rise}`}
            style={order(4 + number)}
            aria-labelledby={`stats-kid-unit-${unit.unitId}`}
          >
            <div className={styles.unitHead}>
              <ProgressRing percent={unit.averagePercent} size={76} stroke={8}>
                <span className={styles.ringPercent}>
                  <CountUp value={unit.averagePercent} />
                  <small>%</small>
                </span>
              </ProgressRing>
              <div className={styles.unitMain}>
                <p className={styles.unitEyebrow}>Unidad {number + 1}</p>
                <h3 id={`stats-kid-unit-${unit.unitId}`} className={styles.unitTitle}>
                  {unit.title}
                </h3>
                <p className={styles.unitMeta}>
                  <span className={styles.tag} data-tone="mint">
                    <IconCheck width={14} height={14} aria-hidden="true" />
                    {unit.lessons.filter(({ result }) => result?.percent === 100).length} de {unit.lessons.length}{" "}
                    completadas
                  </span>
                </p>
              </div>
            </div>
            <ul className={styles.lessonList}>
              {unit.lessons.map(({ lesson, result }, index) => {
                const state = stateOf(result);
                const percent = result?.percent ?? 0;
                return (
                  <li key={lesson.lesson_id}>
                    <button type="button" className={styles.lessonRow} onClick={() => onOpenLesson(lesson.lesson_id)}>
                      <span className={styles.lessonNumber} aria-hidden="true">
                        {index + 1}
                      </span>
                      <span className={styles.lessonMain}>
                        <span className={styles.lessonHead}>
                          <span className={styles.lessonTitle}>{lesson.title}</span>
                          <span className={styles.state} data-tone={state.tone}>
                            {state.text}
                          </span>
                        </span>
                        <span className={styles.lessonMeta}>{activityText(lesson.has_activity, result)}</span>
                      </span>
                      <span className={styles.miniTrack} aria-hidden="true">
                        <span style={{ width: `${percent}%`, "--order": index } as CSSProperties} />
                      </span>
                      <span className={styles.rowPercent}>{percent} %</span>
                      <IconArrowRight width={18} height={18} aria-hidden="true" className={styles.rowArrow} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </section>
    </>
  );
}
