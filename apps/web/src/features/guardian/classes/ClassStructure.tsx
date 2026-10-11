import { Navigate } from "react-router-dom";
import type { LessonProgress, UnitDba } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { DBA_DOCUMENTS, unitDbaText } from "@/features/teacher/classrooms/classroomDetails";
import { useFamilyProgress } from "@/shared/api/hooks/useClassroomsApi";
import {
  IconArrowRight,
  IconBook,
  IconCheck,
  IconInfo,
  IconLayers,
  IconQuestion,
  IconSparkle,
} from "@/shared/ui/icons";
import { isPortalAccessRequired } from "../portalAccess";
import { lessonsByUnit } from "./lessonUnits";
import styles from "./ClassStructure.module.css";

const EXTRA_LABEL = { contenido: "Extra para leer", actividad: "Actividad extra" } as const;

/** How the class is organized, for the family: its units, each with the
 * question that guides it, and their lessons, each with what it's for, what
 * the kid should manage after it and its moments (start, content, activity
 * and the extras the kid gets). Only published lessons, like Progreso. */
interface ClassStructureProps {
  enrollmentId: string;
  firstName: string;
}

export function ClassStructure({ enrollmentId, firstName }: ClassStructureProps) {
  // Same request as Progreso, so going from one to the other asks nothing new.
  const progress = useFamilyProgress(enrollmentId);

  if (isPortalAccessRequired(progress.error)) return <Navigate to="/guardian/verify-2fa" replace />;
  if (progress.isLoading) return <p className={styles.status}>Cargando la estructura de la clase…</p>;
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
          Esta clase todavía no tiene lecciones publicadas. Cuando el docente publique la primera, aquí verás cómo está
          organizada.
        </p>
      </section>
    );
  }

  const units = lessonsByUnit(lessons);
  // Lessons are numbered across the whole class: where each unit starts.
  const firstNumbers = units.map((_, index) =>
    units.slice(0, index).reduce((count, unit) => count + unit.lessons.length, 1),
  );

  const withDba = units.some((unit) => unit.dba);

  return (
    <>
      <StructureOverview
        unitCount={units.length}
        lessonCount={lessons.length}
        firstName={firstName}
        withDba={withDba}
      />

      {units.map((unit, unitIndex) => (
        <section
          key={`${unit.title}-${unitIndex}`}
          className={styles.panel}
          aria-labelledby={`structure-unit-${unitIndex}`}
        >
          <header className={styles.unitHead}>
            <span className={styles.eyebrow}>Unidad {unitIndex + 1}</span>
            <h3 id={`structure-unit-${unitIndex}`} className={styles.unitTitle}>
              {unit.title}
            </h3>
            {(unit.guidingQuestion || unit.learningGoal || unit.dba) && (
              <div className={styles.unitFacts}>
                {unit.guidingQuestion && (
                  <p className={styles.question}>
                    <IconQuestion width={18} height={18} aria-hidden="true" />
                    <span>
                      <span className={styles.questionLabel}>Pregunta guía</span>
                      {unit.guidingQuestion}
                    </span>
                  </p>
                )}
                {unit.learningGoal && (
                  <p className={styles.question}>
                    <IconCheck width={18} height={18} aria-hidden="true" />
                    <span>
                      <span className={styles.questionLabel}>Qué debería lograr {firstName} con esta unidad</span>
                      {unit.learningGoal}
                    </span>
                  </p>
                )}
                {unit.dba && <UnitDbaNote dba={unit.dba} />}
              </div>
            )}
          </header>

          <ol className={styles.lessons}>
            {unit.lessons.map((lesson, lessonIndex) => (
              <LessonOutline
                key={lesson.lesson_id}
                lesson={lesson}
                number={firstNumbers[unitIndex] + lessonIndex}
                firstName={firstName}
              />
            ))}
          </ol>
        </section>
      ))}
    </>
  );
}

interface StructureOverviewProps {
  unitCount: number;
  lessonCount: number;
  firstName: string;
  withDba: boolean;
}

// The card on top: how many units and lessons the class has, and what each
// unit and each lesson tells below, with the same icons they use.
function StructureOverview({ unitCount, lessonCount, firstName, withDba }: StructureOverviewProps) {
  return (
    <section className={styles.panel} aria-labelledby="structure-overview-title">
      <header className={styles.overviewHead}>
        <span className={styles.overviewIcon} aria-hidden="true">
          <IconLayers width={22} height={22} />
        </span>
        <div>
          <h3 id="structure-overview-title" className={styles.overviewTitle}>
            Cómo está organizada la clase
          </h3>
          <p className={styles.overviewText}>
            Tiene <strong>{unitCount === 1 ? "1 unidad" : `${unitCount} unidades`}</strong> con{" "}
            <strong>{lessonCount === 1 ? "1 lección" : `${lessonCount} lecciones`}</strong>.
          </p>
        </div>
      </header>

      <div className={styles.overviewGuide}>
        <div className={styles.guideColumn}>
          <p className={styles.guideTitle}>
            <IconLayers width={16} height={16} aria-hidden="true" />
            En cada unidad
          </p>
          <ul className={styles.guideList}>
            <li>
              <IconQuestion width={16} height={16} aria-hidden="true" />
              La pregunta que la guía
            </li>
            <li>
              <IconCheck width={16} height={16} aria-hidden="true" />
              Lo que {firstName} debería lograr con ella
            </li>
            {withDba && (
              <li>
                <IconBook width={16} height={16} aria-hidden="true" />
                Su Derecho Básico de Aprendizaje (DBA) y sus Evidencias de Aprendizaje
              </li>
            )}
          </ul>
        </div>
        <div className={styles.guideColumn}>
          <p className={styles.guideTitle}>
            <IconBook width={16} height={16} aria-hidden="true" />
            En cada lección
          </p>
          <ul className={styles.guideList}>
            <li>
              <IconInfo width={16} height={16} aria-hidden="true" />
              Para qué es
            </li>
            <li>
              <IconCheck width={16} height={16} aria-hidden="true" />
              Qué debería lograr al terminarla
            </li>
            <li>
              <IconSparkle width={16} height={16} aria-hidden="true" />
              Sus momentos y sus extras
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

interface LessonOutlineProps {
  lesson: LessonProgress;
  number: number;
  firstName: string;
}

// One lesson: its number and title, what it's for, what the kid should
// manage and its moments in order.
function LessonOutline({ lesson, number, firstName }: LessonOutlineProps) {
  const pages = lesson.main.total_pages;
  return (
    <li className={styles.lesson}>
      <span className={styles.lessonIcon} aria-hidden="true">
        <IconBook width={18} height={18} />
      </span>
      <div className={styles.lessonBody}>
        <span className={styles.eyebrow}>Lección {number}</span>
        <h4 className={styles.lessonTitle}>{lesson.title}</h4>

        {(lesson.purpose || lesson.learning_goal) && (
          <dl className={styles.facts}>
            {lesson.purpose && (
              <div className={styles.fact}>
                <dt>Propósito</dt>
                <dd>{lesson.purpose}</dd>
              </div>
            )}
            {lesson.learning_goal && (
              <div className={styles.fact}>
                <dt>Qué debería lograr {firstName}</dt>
                <dd>{lesson.learning_goal}</dd>
              </div>
            )}
          </dl>
        )}

        <ul className={styles.moments} aria-label={`Momentos de ${lesson.title}`}>
          <li className={styles.moment}>Inicio</li>
          <li className={styles.moment}>Contenido · {pages === 1 ? "1 página" : `${pages} páginas`}</li>
          {lesson.main.has_activity && <li className={styles.moment}>Actividad</li>}
          {lesson.extras.map((extra) => (
            <li key={extra.extra_id} className={`${styles.moment} ${styles.momentExtra}`}>
              <IconSparkle width={14} height={14} aria-hidden="true" />
              {extra.kind === "leccion" ? "Extra" : EXTRA_LABEL[extra.kind]}: {extra.title}
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

// The DBA of a unit with its Evidencias de Aprendizaje: one of the MEN
// catalog, with its number and the link to its official text, or one the
// teacher wrote.
function UnitDbaNote({ dba }: { dba: UnitDba }) {
  const official =
    !dba.own && dba.subject && dba.grade && dba.number
      ? { subject: dba.subject, grade: dba.grade, number: dba.number }
      : null;
  return (
    <div className={styles.question}>
      <IconBook width={18} height={18} aria-hidden="true" />
      <div className={styles.dba}>
        <span className={styles.questionLabel}>Derecho Básico de Aprendizaje de la unidad</span>
        <span className={styles.dbaLabel}>{unitDbaText(dba, "DBA propio del docente")}</span>
        {dba.points.length > 0 && (
          <div className={styles.dbaPointsBlock}>
            <span className={styles.dbaPointsTitle}>Evidencias de Aprendizaje</span>
            <ul className={styles.dbaPoints}>
              {dba.points.map((point, index) => (
                <li key={point.evidence_id ?? `own-${index}`}>{point.text}</li>
              ))}
            </ul>
          </div>
        )}
        {official && (
          <a
            className={styles.dbaLink}
            href={DBA_DOCUMENTS[official.subject].url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ver el texto oficial de los DBA de {DBA_DOCUMENTS[official.subject].name} del Ministerio de Educación
            <IconArrowRight width={15} height={15} aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  );
}
