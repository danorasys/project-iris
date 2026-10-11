import type { UnitDba } from "@iris/shared-types";
import { IconArrowRight } from "@/shared/ui/icons";
import { DBA_DOCUMENTS, unitDbaText } from "../../classrooms/classroomDetails";
import styles from "./Dba.module.css";

interface LessonUnitDbaProps {
  /** The DBA of the lesson's unit, null until the unit has one. */
  unitDba: UnitDba | null;
}

/** In the editor's Datos, the DBA of the lesson's unit with its Evidencias de Aprendizaje, to
 * write the lesson from it. They're chosen in the unit, not here. */
export function LessonUnitDba({ unitDba }: LessonUnitDbaProps) {
  return (
    <section className={styles.box} aria-labelledby="lesson-unit-dba">
      <h3 id="lesson-unit-dba" className={styles.legend}>
        DBA de la unidad
      </h3>
      {!unitDba ? (
        <p className={styles.error}>
          La unidad de esta lección todavía no tiene DBA. Elígelo en «Unidades y lecciones», con el lápiz de la unidad.
        </p>
      ) : (
        <>
          <p className={styles.unitDba}>{unitDbaText(unitDba, "DBA propio de la unidad")}</p>
          {unitDba.points.length > 0 && <p className={styles.pointsTitle}>Evidencias de Aprendizaje</p>}
          {unitDba.points.length > 0 ? (
            <ul className={styles.unitPoints} aria-label="Evidencias de Aprendizaje">
              {unitDba.points.map((point, index) => (
                <li key={point.evidence_id ?? `own-${index}`}>{point.text}</li>
              ))}
            </ul>
          ) : (
            <p className={styles.error}>
              La unidad todavía no tiene Evidencias de Aprendizaje. Márcalas en «Unidades y lecciones», con el lápiz de
              la unidad.
            </p>
          )}
          {!unitDba.own && unitDba.subject && (
            <a
              className={styles.link}
              href={DBA_DOCUMENTS[unitDba.subject].url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ver el texto oficial de los DBA de {DBA_DOCUMENTS[unitDba.subject].name} en Colombia Aprende
              <IconArrowRight width={16} height={16} aria-hidden="true" />
            </a>
          )}
          <p className={styles.hint}>Se elige en la unidad: lo comparten todas sus lecciones.</p>
        </>
      )}
    </section>
  );
}
