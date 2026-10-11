import type { Dba } from "@iris/shared-types";
import { SelectField } from "@/features/auth/ui/SelectField";
import { CountedTextField } from "@/shared/ui/CountedTextField";
import { IconArrowRight, IconPlus, IconTrash } from "@/shared/ui/icons";
import { DBA_DOCUMENTS, DBA_OWN_NAME_MAX, DBA_OWN_POINTS_MAX, DBA_POINT_MAX } from "../../classrooms/classroomDetails";
import styles from "./Dba.module.css";
import { unitDbaHasPoints, type UnitDbaDraft } from "./unitDbaDraft";

interface UnitDbaPickerProps {
  /** The DBA of the class's area and grade, from the MEN catalog. */
  catalog: Dba[] | undefined;
  loading: boolean;
  failed: boolean;
  value: UnitDbaDraft;
  onChange: (next: UnitDbaDraft) => void;
  /** Show what's missing, after trying to save. */
  showErrors: boolean;
  disabled?: boolean;
}

// The value of the list's last option, the teacher's own DBA.
const OWN = "own";

/** The DBA of a unit, in the areas that have DBA: one of the MEN catalog of
 * the class's area and grade, with a link to the official text on Colombia
 * Aprende, or one the teacher writes. Then its Evidencias de Aprendizaje:
 * the catalog's, ticked, and the teacher's own. */
export function UnitDbaPicker({ catalog, loading, failed, value, onChange, showErrors, disabled }: UnitDbaPickerProps) {
  const own = value.own_name !== null;
  const chosen = own ? null : (catalog?.find((dba) => dba.id === value.dba_id) ?? null);
  // In humanities the list has language and English, so each one says which.
  const severalSubjects = new Set(catalog?.map((dba) => dba.subject)).size > 1;
  const picked = own || chosen !== null;

  // Another DBA: the ticked evidences were of the old one, the own ones stay.
  function pick(option: string) {
    if (option === OWN) onChange({ ...value, dba_id: null, own_name: value.own_name ?? "", evidence_ids: [] });
    else if (option !== value.dba_id || own) onChange({ ...value, dba_id: option, own_name: null, evidence_ids: [] });
  }

  function toggle(evidenceId: string) {
    const evidence_ids = value.evidence_ids.includes(evidenceId)
      ? value.evidence_ids.filter((id) => id !== evidenceId)
      : [...value.evidence_ids, evidenceId];
    onChange({ ...value, evidence_ids });
  }

  function setOwnPoint(index: number, text: string) {
    onChange({ ...value, own_points: value.own_points.map((point, i) => (i === index ? text : point)) });
  }

  return (
    <fieldset className={styles.box}>
      <legend className={styles.legend}>DBA de la unidad</legend>
      <p className={styles.intro}>
        El Derecho Básico de Aprendizaje del Ministerio de Educación que trabajan las lecciones de la unidad, o uno
        propio, y las Evidencias de Aprendizaje que trabaja de él.
      </p>

      {loading && <p className={styles.status}>Cargando los DBA de la clase…</p>}
      {failed && (
        <p role="alert" className={styles.error}>
          No pudimos cargar los DBA de la clase. Intenta de nuevo en un momento.
        </p>
      )}

      {catalog && (
        <SelectField
          id="unit-dba"
          label="DBA"
          value={own ? OWN : (value.dba_id ?? "")}
          onChange={pick}
          options={[
            { value: "", label: "Elige el DBA", disabled: true },
            ...catalog.map((dba) => ({
              value: dba.id,
              label: `${severalSubjects ? `${DBA_DOCUMENTS[dba.subject].name} · ` : ""}DBA ${dba.number}: ${dba.name}`,
            })),
            { value: OWN, label: "Escribir un DBA propio" },
          ]}
          error={
            showErrors && !own && value.dba_id === null ? "Elige el DBA de la unidad o escribe uno propio." : undefined
          }
          required
          disabled={disabled}
        />
      )}

      {own && (
        <CountedTextField
          id="unit-own-dba"
          label="Tu DBA propio"
          value={value.own_name ?? ""}
          onChange={(own_name) => onChange({ ...value, own_name })}
          max={DBA_OWN_NAME_MAX}
          error={showErrors && !value.own_name?.trim() ? "Escribe tu DBA propio." : undefined}
          required
          disabled={disabled}
          multiline
          rows={2}
          hint="Lo que esperas que logren tus estudiantes con la unidad, con tus palabras. Las familias lo verán como un DBA propio."
        />
      )}

      {chosen && (
        <a className={styles.link} href={DBA_DOCUMENTS[chosen.subject].url} target="_blank" rel="noopener noreferrer">
          Ver el texto oficial de los DBA de {DBA_DOCUMENTS[chosen.subject].name} en Colombia Aprende
          <IconArrowRight width={16} height={16} aria-hidden="true" />
        </a>
      )}

      {chosen && (
        <fieldset className={styles.points}>
          <legend className={styles.pointsTitle}>Evidencias de Aprendizaje del DBA</legend>
          {chosen.evidences.length > 0 ? (
            <ul className={styles.evidences}>
              {chosen.evidences.map((evidence) => (
                <li key={evidence.id}>
                  <label className={styles.evidence}>
                    <input
                      type="checkbox"
                      checked={value.evidence_ids.includes(evidence.id)}
                      onChange={() => toggle(evidence.id)}
                      disabled={disabled}
                    />
                    <span>{evidence.text}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.hint}>
              El documento del Ministerio no trae evidencias para este DBA: escribe las tuyas.
            </p>
          )}
        </fieldset>
      )}

      {picked && (
        <div className={styles.points}>
          <p className={styles.pointsTitle}>Evidencias de Aprendizaje propias</p>
          {value.own_points.map((point, index) => (
            <div key={index} className={styles.ownPoint}>
              <CountedTextField
                id={`unit-dba-point-${index}`}
                label={`Evidencia propia ${index + 1}`}
                value={point}
                onChange={(text) => setOwnPoint(index, text)}
                max={DBA_POINT_MAX}
                disabled={disabled}
              />
              <button
                type="button"
                className={styles.remove}
                onClick={() => onChange({ ...value, own_points: value.own_points.filter((_, i) => i !== index) })}
                aria-label={`Quitar la evidencia propia ${index + 1}`}
                disabled={disabled}
              >
                <IconTrash width={16} height={16} aria-hidden="true" />
              </button>
            </div>
          ))}
          {value.own_points.length < DBA_OWN_POINTS_MAX && (
            <button
              type="button"
              className={styles.add}
              onClick={() => onChange({ ...value, own_points: [...value.own_points, ""] })}
              disabled={disabled}
            >
              <IconPlus width={16} height={16} aria-hidden="true" />
              Agregar una evidencia propia
            </button>
          )}
        </div>
      )}

      {picked && showErrors && !unitDbaHasPoints(value) && (
        <p id="unit-dba-points-error" className={styles.error} tabIndex={-1}>
          {chosen && chosen.evidences.length > 0
            ? "Marca al menos una evidencia de aprendizaje o escribe una propia."
            : "Escribe al menos una evidencia de aprendizaje propia."}
        </p>
      )}
    </fieldset>
  );
}
