import type { UnitDba } from "@iris/shared-types";
import type { UnitBody } from "@/shared/api/hooks/useLessonsApi";

/** The DBA picked for a unit: one of the catalog (dba_id) or one the teacher
 * writes (own_name, not null while it's their own), with its Evidencias de
 * Aprendizaje: the catalog's ticked and the teacher's own. */
export interface UnitDbaDraft {
  dba_id: string | null;
  own_name: string | null;
  evidence_ids: string[];
  own_points: string[];
}

/** The unit's saved DBA as the form's draft, the catalog's evidences and the own ones apart. */
export function toUnitDbaDraft(dba: UnitDba | null | undefined): UnitDbaDraft {
  const points = dba?.points ?? [];
  return {
    dba_id: dba && !dba.own ? dba.id : null,
    own_name: dba?.own ? dba.name : null,
    evidence_ids: points.flatMap((point) => (point.evidence_id ? [point.evidence_id] : [])),
    own_points: points.flatMap((point) => (point.evidence_id ? [] : [point.text])),
  };
}

/** Whether the draft has a DBA to save. */
export function unitDbaReady(value: UnitDbaDraft): boolean {
  return value.own_name !== null ? value.own_name.trim().length > 0 : value.dba_id !== null;
}

/** Whether it has at least one evidence: one ticked or an own one with text. */
export function unitDbaHasPoints(value: UnitDbaDraft): boolean {
  return value.evidence_ids.length > 0 || value.own_points.some((point) => point.trim());
}

/** What the API gets: the DBA with its evidences, without the empty own ones. */
export function toUnitDbaBody(value: UnitDbaDraft): NonNullable<UnitBody["dba"]> {
  const own_points = value.own_points.map((point) => point.trim()).filter(Boolean);
  return value.own_name !== null
    ? { own_name: value.own_name.trim(), evidence_ids: [], own_points }
    : { dba_id: value.dba_id ?? "", evidence_ids: value.evidence_ids, own_points };
}
