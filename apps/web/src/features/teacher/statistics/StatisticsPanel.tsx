import { useState, type CSSProperties } from "react";
import type { ClassStatistics, KidInLesson, LessonStatistics } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { useClassStatistics } from "@/shared/api/hooks/useClassroomsApi";
import { CountUp } from "@/shared/ui/charts/CountUp";
import { DonutChart } from "@/shared/ui/charts/DonutChart";
import { ProgressRing } from "@/shared/ui/charts/ProgressRing";
import {
  IconArrowLeft,
  IconArrowRight,
  IconBook,
  IconChart,
  IconCheck,
  IconChild,
  IconClock,
  IconSparkle,
} from "@/shared/ui/icons";
import { SectionOverview } from "@/shared/ui/portal/SectionOverview";
import { ViewEnter } from "@/shared/ui/ViewEnter";
import { Kpi, KidIdentity, KidProgressList, type KidProgress } from "./StatisticsParts";
import {
  byProgress,
  byUnit,
  classTotals,
  KIDS_SHOWN,
  passRate,
  performance,
  scoreText,
  type UnitStatistics,
} from "./statisticsView";
import { StudentResults } from "./StudentResults";
import { StudentsView } from "./StudentsView";
import portal from "../portal/portalSection.module.css";
import styles from "./StatisticsPanel.module.css";

// The same three colors in every chart: done, on the way, not yet.
const DONE = "var(--landing-mint)";
const ON_THE_WAY = "var(--landing-sun)";
const NOT_YET = "var(--landing-orange)";

// The places inside Estadísticas, one on top of the other: the class is the
// bottom, then every kid, one kid's results or a lesson. "Regresar" goes
// back one step, to wherever it came from.
type Place =
  | { kind: "students" }
  | { kind: "student"; id: string }
  | { kind: "lesson"; id: string }
  | { kind: "lessonStudents"; id: string };

// The place of a card in the page, so they come in one after the other.
const order = (n: number) => ({ "--order": n }) as CSSProperties;

/** "Estadísticas" of a classroom (HU-87): how far the class got, the
 * progress of each kid and the lessons grouped by unit. A lesson opens its
 * own numbers (HU-86) and a kid their results. Extras don't count. */
export function StatisticsPanel({ classroomId }: { classroomId: string }) {
  const statistics = useClassStatistics(classroomId);
  const [trail, setTrail] = useState<Place[]>([]);

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
      <div className={portal.section}>
        <StatisticsOverview data={data} />
        <section className={portal.panel}>
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
        </section>
      </div>
    );
  }

  const place = trail.at(-1) ?? null;
  const open = (next: Place) => setTrail([...trail, next]);
  const back = () => setTrail(trail.slice(0, -1));
  // What "Regresar" says: where it goes back to.
  const before = trail.at(-2) ?? null;
  const backLabel =
    before?.kind === "students" || before?.kind === "lessonStudents"
      ? "Regresar a todos los estudiantes"
      : before?.kind === "student"
        ? "Regresar a los resultados del estudiante"
        : before?.kind === "lesson"
          ? "Regresar a la lección"
          : "Regresar a las estadísticas de la clase";
  const openStudent = (id: string) => open({ kind: "student", id });
  const openLesson = (id: string) => open({ kind: "lesson", id });
  const lesson =
    place?.kind === "lesson" || place?.kind === "lessonStudents"
      ? data.lessons.find((l) => l.lesson_id === place.id)
      : undefined;

  // Each place comes in from the right and goes back to the left.
  return (
    <ViewEnter
      view={place ? `${place.kind}:${"id" in place ? place.id : ""}` : "class"}
      level={trail.length}
      className={portal.section}
    >
      {place?.kind === "students" ? (
        <StudentsView
          title="Avance de cada estudiante"
          items={classProgress(data)}
          backLabel={backLabel}
          onBack={back}
          onOpen={openStudent}
        />
      ) : place?.kind === "lessonStudents" && lesson ? (
        <StudentsView
          title={`Avance en “${lesson.title}”`}
          items={lessonProgress(lesson)}
          backLabel={backLabel}
          onBack={back}
          onOpen={openStudent}
        />
      ) : place?.kind === "student" ? (
        <StudentResults
          data={data}
          studentId={place.id}
          backLabel={backLabel}
          onBack={back}
          onOpenLesson={openLesson}
        />
      ) : lesson ? (
        <LessonView
          lesson={lesson}
          backLabel={backLabel}
          onBack={back}
          onOpenStudent={openStudent}
          onAllStudents={() => open({ kind: "lessonStudents", id: lesson.lesson_id })}
        />
      ) : (
        <ClassView
          data={data}
          onOpen={openLesson}
          onOpenStudent={openStudent}
          onAllStudents={() => open({ kind: "students" })}
        />
      )}
    </ViewEnter>
  );
}

// Every kid of the class by their progress in it (the server sends them
// best first), and every kid of a lesson by how far they got in it.
function classProgress(data: ClassStatistics): KidProgress[] {
  const lessons = data.lessons.length;
  return data.by_kid.map((kid) => ({
    kid,
    percent: kid.average_percent,
    note: `${kid.completed_lessons} de ${lessons} ${lessons === 1 ? "completada" : "completadas"}`,
  }));
}

function lessonProgress(lesson: LessonStatistics): KidProgress[] {
  return byProgress(lesson.kids).map((kid) => ({ kid, percent: kid.percent }));
}

// A card with the first kids by progress, their place, and "Ver todos"
// to every one of them.
function TopKidsCard({
  titleId,
  items,
  onSelect,
  onAll,
  place,
}: {
  titleId: string;
  items: KidProgress[];
  onSelect: (studentId: string) => void;
  onAll: () => void;
  place: number;
}) {
  return (
    <section className={`${portal.panel} ${styles.card} ${styles.rise}`} style={order(place)} aria-labelledby={titleId}>
      <div className={styles.cardHead}>
        <h3 id={titleId} className={styles.cardTitle}>
          Avance de cada estudiante
        </h3>
        <button type="button" className={styles.seeAll} onClick={onAll}>
          Ver todos
          <IconArrowRight width={16} height={16} aria-hidden="true" />
        </button>
      </div>
      <KidProgressList
        onSelect={onSelect}
        items={items.slice(0, KIDS_SHOWN).map((item, index) => ({ ...item, rank: index + 1 }))}
      />
      {items.length > KIDS_SHOWN && (
        <p className={styles.moreKids}>
          y {items.length - KIDS_SHOWN} más en <strong>Ver todos</strong>
        </p>
      )}
    </section>
  );
}

// The card on top, like the other options of the class: what counts here.
function StatisticsOverview({ data }: { data: ClassStatistics }) {
  const units = new Set(data.lessons.map((lesson) => lesson.unit_id)).size;
  return (
    <SectionOverview
      titleId="statistics-overview-title"
      Icon={IconChart}
      title="Cómo va la clase"
      text={
        <>
          Cuenta a <strong>{data.kids === 1 ? "1 estudiante" : `${data.kids} estudiantes`}</strong> en{" "}
          <strong>
            {data.lessons.length === 1 ? "1 lección publicada" : `${data.lessons.length} lecciones publicadas`}
          </strong>
          {units > 0 && (
            <>
              {" "}
              de <strong>{units === 1 ? "1 unidad" : `${units} unidades`}</strong>
            </>
          )}
          .{data.kids > 0 && data.lessons.length > 0 && " Abre una lección para ver cómo le fue a cada uno."}
        </>
      }
    />
  );
}

function ClassView({
  data,
  onOpen,
  onOpenStudent,
  onAllStudents,
}: {
  data: ClassStatistics;
  onOpen: (lessonId: string) => void;
  onOpenStudent: (studentId: string) => void;
  onAllStudents: () => void;
}) {
  const totals = classTotals(data);
  return (
    <>
      <StatisticsOverview data={data} />

      <div className={styles.kpis}>
        <Kpi Icon={IconChild} value={data.kids} label={data.kids === 1 ? "estudiante" : "estudiantes"} />
        <Kpi Icon={IconBook} value={data.lessons.length} label="lecciones publicadas" order={1} />
        <Kpi
          Icon={IconCheck}
          value={data.completed_percent}
          suffix=" %"
          label="de las lecciones completadas"
          order={2}
        />
        <Kpi Icon={IconSparkle} value={data.average_percent} suffix=" %" label="de avance promedio" order={3} />
      </div>

      <div className={styles.charts}>
        <section className={`${portal.panel} ${styles.card} ${styles.rise}`} style={order(4)}>
          <DonutChart
            title="Lecciones de tus estudiantes"
            percent={data.completed_percent}
            centerLabel="completadas"
            slices={[
              { label: "Completadas", value: totals.completed, color: DONE },
              { label: "En curso", value: totals.inProgress, color: ON_THE_WAY },
              { label: "Sin empezar", value: totals.notStarted, color: NOT_YET },
            ]}
          />
        </section>
        {/* The first kids (best first); "Ver todos" has every one. */}
        <TopKidsCard
          titleId="stats-kids-title"
          items={classProgress(data)}
          onSelect={onOpenStudent}
          onAll={onAllStudents}
          place={5}
        />
      </div>

      <section aria-labelledby="stats-units-title" className={styles.units}>
        <h2 id="stats-units-title" className={styles.unitsTitle}>
          Por unidad
        </h2>
        {byUnit(data).map((unit, index) => (
          <UnitStatisticsCard key={unit.unitId} unit={unit} number={index + 1} onOpen={onOpen} />
        ))}
      </section>
    </>
  );
}

// One unit: a ring with how its lessons are going together, its title and
// counts as small tags, and under it each lesson with its own bar, which
// opens its statistics.
function UnitStatisticsCard({
  unit,
  number,
  onOpen,
}: {
  unit: UnitStatistics;
  number: number;
  onOpen: (lessonId: string) => void;
}) {
  const titleId = `stats-unit-${unit.unitId}`;
  return (
    <section aria-labelledby={titleId} className={`${portal.panel} ${styles.unitCard} ${styles.rise}`} style={order(5 + number)}>
      <div className={styles.unitHead}>
        <ProgressRing percent={unit.averagePercent} size={76} stroke={8} label={`Avance de la unidad ${unit.title}`}>
          <span className={styles.ringPercent}>
            <CountUp value={unit.averagePercent} />
            <small>%</small>
          </span>
        </ProgressRing>
        <div className={styles.unitMain}>
          <p className={styles.unitEyebrow}>Unidad {number}</p>
          <h3 id={titleId} className={styles.unitTitle}>
            {unit.title}
          </h3>
          <p className={styles.unitMeta}>
            <span className={styles.tag}>
              <IconBook width={14} height={14} aria-hidden="true" />
              {unit.lessons.length === 1 ? "1 lección" : `${unit.lessons.length} lecciones`}
            </span>
            <span className={styles.tag} data-tone="mint">
              <IconCheck width={14} height={14} aria-hidden="true" />
              {unit.completed} de {unit.pairs} completadas
            </span>
            <span className={styles.tag} data-tone="sun">
              <IconSparkle width={14} height={14} aria-hidden="true" />
              {unit.passed === 1 ? "1 aprobó" : `${unit.passed} aprobaron`}
            </span>
          </p>
        </div>
      </div>
      <ul className={styles.lessonList}>
        {unit.lessons.map((lesson, index) => (
          <li key={lesson.lesson_id}>
            <button type="button" className={styles.lessonRow} onClick={() => onOpen(lesson.lesson_id)}>
              <span className={styles.lessonNumber} aria-hidden="true">
                {index + 1}
              </span>
              <span className={styles.lessonMain}>
                <span className={styles.lessonTitle}>{lesson.title}</span>
                <span className={styles.lessonMeta}>
                  {lesson.completed} de {lesson.kids.length} la completaron · {lesson.passed} aprobaron
                </span>
              </span>
              <span className={styles.miniTrack} aria-hidden="true">
                <span style={{ width: `${lesson.average_percent}%`, "--order": index } as CSSProperties} />
              </span>
              <span className={styles.rowPercent}>{lesson.average_percent} %</span>
              <IconArrowRight width={18} height={18} aria-hidden="true" className={styles.rowArrow} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LessonView({
  lesson,
  backLabel,
  onBack,
  onOpenStudent,
  onAllStudents,
}: {
  lesson: LessonStatistics;
  backLabel: string;
  onBack: () => void;
  onOpenStudent: (studentId: string) => void;
  onAllStudents: () => void;
}) {
  const { best, lowest, notTried } = performance(lesson);
  const rate = passRate(lesson);
  return (
    <>
      <button type="button" className={portal.backButton} onClick={onBack}>
        <IconArrowLeft width={18} height={18} />
        {backLabel}
      </button>

      <header className={`${styles.hero} ${styles.rise}`}>
        <ProgressRing percent={lesson.average_percent} size={92} stroke={9}>
          <span className={styles.ringPercent} data-size="large">
            <CountUp value={lesson.average_percent} />
            <small>%</small>
          </span>
        </ProgressRing>
        <div>
          <p className={styles.heroEyebrow}>{lesson.unit_title}</p>
          <h2 className={styles.heroTitle}>{lesson.title}</h2>
          <p className={styles.heroText}>Así va la lección entre tus estudiantes.</p>
        </div>
      </header>

      <div className={styles.kpis}>
        <Kpi Icon={IconSparkle} value={lesson.average_percent} suffix=" %" label="de avance promedio" />
        <Kpi Icon={IconCheck} value={rate} suffix=" %" label="aprobaron la actividad" order={1} />
        <Kpi
          Icon={IconBook}
          value={lesson.completed}
          of={lesson.kids.length}
          label="completaron la lección"
          order={2}
        />
      </div>

      <div className={styles.charts}>
        <section className={`${portal.panel} ${styles.card} ${styles.rise}`} style={order(3)}>
          <DonutChart
            title="Actividad de la lección"
            percent={rate}
            centerLabel="aprobaron"
            slices={[
              { label: "Aprobaron", value: lesson.passed, color: DONE },
              { label: "La intentaron sin aprobar", value: lesson.tried_not_passed, color: ON_THE_WAY },
              { label: "Aún no la intentan", value: notTried.length, color: NOT_YET },
            ]}
          />
        </section>
        <TopKidsCard
          titleId="stats-lesson-kids-title"
          items={lessonProgress(lesson)}
          onSelect={onOpenStudent}
          onAll={onAllStudents}
          place={4}
        />
      </div>

      <div className={styles.charts}>
        <Ranking
          title="Mejor rendimiento"
          tone="best"
          kids={best}
          empty="Nadie ha hecho la actividad todavía."
          onOpen={onOpenStudent}
          order={5}
        />
        <Ranking
          title="Rendimiento más bajo"
          tone="low"
          kids={lowest}
          empty={best.length ? "Solo un estudiante ha hecho la actividad." : "Nadie ha hecho la actividad todavía."}
          onOpen={onOpenStudent}
          order={6}
        />
      </div>

      {notTried.length > 0 && (
        <section className={`${portal.panel} ${styles.card} ${styles.rise}`} style={order(7)} aria-labelledby="stats-not-tried">
          <h3 id="stats-not-tried" className={styles.cardTitle}>
            <IconClock width={18} height={18} aria-hidden="true" className={styles.titleIcon} />
            Todavía sin intentarla
          </h3>
          <ul className={styles.chips}>
            {notTried.map((kid) => (
              <li key={kid.student_id}>
                <button type="button" className={styles.chip} onClick={() => onOpenStudent(kid.student_id)}>
                  <KidIdentity kid={kid} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// The best or the lowest performances of a lesson: each kid with their
// place, their best try as a score and whether they passed. Each one opens
// the kid's results.
function Ranking({
  title,
  tone,
  kids,
  empty,
  onOpen,
  order: place,
}: {
  title: string;
  tone: "best" | "low";
  kids: KidInLesson[];
  empty: string;
  onOpen: (studentId: string) => void;
  order: number;
}) {
  return (
    <section className={`${portal.panel} ${styles.card} ${styles.ranking} ${styles.rise}`} data-tone={tone} style={order(place)} aria-label={title}>
      <h3 className={styles.cardTitle}>
        {tone === "best" ? (
          <IconSparkle width={18} height={18} aria-hidden="true" className={styles.titleIcon} />
        ) : (
          <IconChart width={18} height={18} aria-hidden="true" className={styles.titleIcon} />
        )}
        {title}
      </h3>
      {kids.length === 0 ? (
        <p className={portal.rowMeta}>{empty}</p>
      ) : (
        <ol className={styles.rankingList}>
          {kids.map((kid, index) => (
            <li key={kid.student_id}>
              <button type="button" className={styles.rankingRow} onClick={() => onOpen(kid.student_id)}>
                <span className={styles.rank} data-top={tone === "best" ? index + 1 : undefined} aria-hidden="true">
                  {index + 1}
                </span>
                <KidIdentity
                  kid={kid}
                  note={`${kid.passed ? "Aprobó" : "No ha aprobado"} · ${kid.tries === 1 ? "1 intento" : `${kid.tries} intentos`}`}
                />
                <span className={styles.score} data-passed={kid.passed}>
                  <span className={styles.scoreLabel}>Mejor intento</span>
                  {scoreText(kid)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
