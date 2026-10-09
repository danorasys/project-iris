import { useState } from "react";
import type { ClassStatistics, KidInLesson, LessonStatistics } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { useClassStatistics } from "@/shared/api/hooks/useClassroomsApi";
import { BarList } from "@/shared/ui/charts/BarList";
import { DonutChart } from "@/shared/ui/charts/DonutChart";
import { IconArrowLeft, IconArrowRight, IconChart } from "@/shared/ui/icons";
import { ViewEnter } from "@/shared/ui/ViewEnter";
import { classTotals, passRate, performance, scoreText } from "./statisticsView";
import portal from "../portal/portalSection.module.css";
import styles from "./StatisticsPanel.module.css";

// The same three colors in every chart: done, on the way, not yet.
const DONE = "var(--color-leaf)";
const ON_THE_WAY = "var(--color-sun)";
const NOT_YET = "var(--color-coral)";

/** "Estadísticas" of a classroom (HU-87): how far the class got, with a
 * donut and a bar per kid, and its lessons; each one opens its own
 * statistics (HU-86). Only the lessons themselves count, not their extras. */
export function StatisticsPanel({ classroomId }: { classroomId: string }) {
  const statistics = useClassStatistics(classroomId);
  const [open, setOpen] = useState<string | null>(null);

  if (statistics.isLoading) return <p className={portal.status}>Cargando las estadísticas…</p>;
  if (statistics.isError || !statistics.data) {
    return (
      <p role="alert" className={`${portal.status} ${portal.error}`}>
        {getAuthErrorMessage(statistics.error)}
      </p>
    );
  }

  const data = statistics.data;
  if (data.kids === 0 || data.lessons.length === 0) {
    return (
      <div className={portal.empty}>
        <span className={portal.emptyIcon} aria-hidden="true">
          <IconChart width={24} height={24} />
        </span>
        <p className={portal.emptyTitle}>Aún no hay estadísticas</p>
        <p className={portal.emptyText}>
          {data.kids === 0
            ? "Cuando haya estudiantes en la clase verás aquí cómo van."
            : "Cuando publiques la primera lección verás aquí cómo van tus estudiantes."}
        </p>
      </div>
    );
  }

  const lesson = data.lessons.find((l) => l.lesson_id === open) ?? null;
  return (
    <ViewEnter view={lesson?.lesson_id ?? "class"} level={lesson ? 1 : 0} className={portal.section}>
      {lesson ? (
        <LessonView lesson={lesson} onBack={() => setOpen(null)} />
      ) : (
        <ClassView data={data} onOpen={setOpen} />
      )}
    </ViewEnter>
  );
}

function ClassView({ data, onOpen }: { data: ClassStatistics; onOpen: (lessonId: string) => void }) {
  const totals = classTotals(data);
  return (
    <>
      <div className={styles.kpis}>
        <Kpi value={String(data.kids)} label={data.kids === 1 ? "estudiante" : "estudiantes"} />
        <Kpi value={String(data.lessons.length)} label="lecciones publicadas" />
        <Kpi value={`${data.completed_percent} %`} label="de las lecciones completadas" />
        <Kpi value={`${data.average_percent} %`} label="de avance promedio" />
      </div>

      <div className={styles.charts}>
        <section className={portal.panel}>
          <DonutChart
            title="Lecciones de tus estudiantes"
            center={`${data.completed_percent} %`}
            centerLabel="completadas"
            slices={[
              { label: "Completadas", value: totals.completed, color: DONE },
              { label: "En curso", value: totals.inProgress, color: ON_THE_WAY },
              { label: "Sin empezar", value: totals.notStarted, color: NOT_YET },
            ]}
          />
        </section>
        <section className={portal.panel}>
          <BarList
            title="Avance de cada estudiante"
            items={data.by_kid.map((kid) => ({
              key: kid.student_id,
              label: kid.first_name,
              percent: kid.average_percent,
              note: kid.completed_lessons === 1 ? "1 completada" : `${kid.completed_lessons} completadas`,
            }))}
          />
        </section>
      </div>

      <section aria-labelledby="stats-lessons-title" className={portal.section}>
        <h2 id="stats-lessons-title" className={portal.subTitle}>
          Por lección
        </h2>
        <ul className={portal.list}>
          {data.lessons.map((lesson) => (
            <li key={lesson.lesson_id}>
              <button
                type="button"
                className={`${portal.row} ${styles.lessonRow}`}
                onClick={() => onOpen(lesson.lesson_id)}
              >
                <span className={portal.rowMain}>
                  <span className={portal.rowTitle}>{lesson.title}</span>
                  <span className={portal.rowMeta}>
                    {lesson.unit_title} · {lesson.completed} de {lesson.kids.length} la completaron · {lesson.passed}{" "}
                    aprobaron
                  </span>
                </span>
                <span className={styles.rowPercent}>{lesson.average_percent} %</span>
                <IconArrowRight width={18} height={18} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function LessonView({ lesson, onBack }: { lesson: LessonStatistics; onBack: () => void }) {
  const { best, lowest, notTried } = performance(lesson);
  const rate = passRate(lesson);
  return (
    <>
      <button type="button" className={portal.backButton} onClick={onBack}>
        <IconArrowLeft width={18} height={18} />
        Regresar a las estadísticas de la clase
      </button>
      <div>
        <p className={portal.eyebrow}>{lesson.unit_title}</p>
        <h2 className={portal.subTitle}>{lesson.title}</h2>
      </div>

      <div className={styles.kpis}>
        <Kpi value={`${lesson.average_percent} %`} label="de avance promedio" />
        <Kpi value={`${rate} %`} label="aprobaron la actividad" />
        <Kpi value={`${lesson.completed} de ${lesson.kids.length}`} label="completaron la lección" />
      </div>

      <div className={styles.charts}>
        <section className={portal.panel}>
          <DonutChart
            title="Actividad de la lección"
            center={`${rate} %`}
            centerLabel="aprobaron"
            slices={[
              { label: "Aprobaron", value: lesson.passed, color: DONE },
              { label: "La intentaron sin aprobar", value: lesson.tried_not_passed, color: ON_THE_WAY },
              { label: "Aún no la intentan", value: notTried.length, color: NOT_YET },
            ]}
          />
        </section>
        <section className={portal.panel}>
          <BarList
            title="Avance de cada estudiante"
            items={lesson.kids.map((kid) => ({ key: kid.student_id, label: kid.first_name, percent: kid.percent }))}
          />
        </section>
      </div>

      <div className={styles.charts}>
        <Ranking title="Mejor rendimiento" kids={best} empty="Nadie ha hecho la actividad todavía." />
        <Ranking
          title="Rendimiento más bajo"
          kids={lowest}
          empty={best.length ? "Solo un estudiante ha hecho la actividad." : "Nadie ha hecho la actividad todavía."}
        />
      </div>
      {notTried.length > 0 && (
        <p className={portal.rowMeta}>
          <span className={portal.metaLabel}>Todavía sin intentarla:</span>{" "}
          {notTried.map((k) => k.first_name).join(", ")}
        </p>
      )}
    </>
  );
}

function Ranking({ title, kids, empty }: { title: string; kids: KidInLesson[]; empty: string }) {
  return (
    <section className={portal.panel} aria-label={title}>
      <h3 className={styles.rankingTitle}>{title}</h3>
      {kids.length === 0 ? (
        <p className={portal.rowMeta}>{empty}</p>
      ) : (
        <ol className={styles.ranking}>
          {kids.map((kid) => (
            <li key={kid.student_id}>
              <span className={styles.rankingName}>{kid.first_name}</span>
              <span>
                Mejor intento: <strong>{scoreText(kid)}</strong>
                {kid.passed ? " · aprobó" : ""} · {kid.tries === 1 ? "1 intento" : `${kid.tries} intentos`}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <div className={styles.kpi}>
      <span className={styles.kpiValue}>{value}</span>
      <span className={styles.kpiLabel}>{label}</span>
    </div>
  );
}
