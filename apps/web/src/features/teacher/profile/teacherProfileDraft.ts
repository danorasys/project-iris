import type { StudyLevel, TeacherProfile } from "@iris/shared-types";

// The teacher's profile while it's being typed: every field as text, so the
// inputs stay controlled, plus a key per entry for React. profileFromDraft
// turns it into what the API expects.

/** Same limits identity-service checks (TeacherProfileRequest). */
export const PROFILE_LIMITS = {
  about: 2000,
  entryText: 150,
  description: 2000,
  studies: 10,
  experiences: 10,
  earliestYear: 1950,
} as const;

export const STUDY_LEVEL_LABELS: Record<StudyLevel, string> = {
  technical: "Técnico",
  technologist: "Tecnólogo",
  professional: "Profesional o licenciatura",
  specialization: "Especialización",
  masters: "Maestría",
  doctorate: "Doctorado",
};

export interface StudyDraft {
  key: string;
  level: StudyLevel | "";
  title: string;
  institution: string;
  /** When it ended, month and year apart like the jobs ("1" to "12" and "2020"). */
  endMonth: string;
  endYear: string;
  inProgress: boolean;
  /** Open to be changed. A new card starts open; once confirmed (check) it's
   * locked until the pencil opens it again. */
  editing: boolean;
}

export interface ExperienceDraft {
  key: string;
  role: string;
  place: string;
  /** Month and year apart, "1" to "12" and "2020". A month input would be
   * simpler, but Firefox shows it as plain text. */
  startMonth: string;
  startYear: string;
  endMonth: string;
  endYear: string;
  /** They still work there, so there's no end month. */
  current: boolean;
  description: string;
  /** Same as in StudyDraft. */
  editing: boolean;
}

export interface ProfileDraft {
  about: string;
  studies: StudyDraft[];
  experiences: ExperienceDraft[];
}

let lastKey = 0;
function newKey(): string {
  lastKey += 1;
  return `entry-${lastKey}`;
}

// From the lowest level to the highest, the order of STUDY_LEVEL_LABELS.
const LEVEL_RANK = Object.keys(STUDY_LEVEL_LABELS) as StudyLevel[];

/** The order the families read the studies in, the same one the server
 * keeps (TeacherProfile in identity-service): what's being studied now
 * first, then the most recently finished. On a tie (both in progress, or
 * the same year) the higher level goes first. A study still missing its
 * year or level goes after the complete ones. Returns a new list. */
export function sortStudies(studies: StudyDraft[]): StudyDraft[] {
  // "2018-06", or "" while the month or the year is missing.
  const ended = (s: StudyDraft) => (s.endMonth && /^\d{4}$/.test(s.endYear) ? toMonth(s.endYear, s.endMonth) : "");
  const rank = (s: StudyDraft) => (s.level ? LEVEL_RANK.indexOf(s.level) : -1);
  return [...studies].sort(
    (a, b) =>
      Number(!a.inProgress) - Number(!b.inProgress) || ended(b).localeCompare(ended(a)) || rank(b) - rank(a),
  );
}

/** The order of the jobs, the same one the server keeps: where they work
 * now first, then the job that ended most recently. On a tie (both current,
 * or the same end month) the one started later goes first. Returns a new
 * list. */
export function sortExperiences(jobs: ExperienceDraft[]): ExperienceDraft[] {
  // "2018-06", or "" while the month or the year is missing.
  const month = (m: string, y: string) => (m && /^\d{4}$/.test(y) ? toMonth(y, m) : "");
  const ended = (j: ExperienceDraft) => (j.current ? "" : month(j.endMonth, j.endYear));
  const started = (j: ExperienceDraft) => month(j.startMonth, j.startYear);
  return [...jobs].sort(
    (a, b) =>
      Number(!a.current) - Number(!b.current) ||
      ended(b).localeCompare(ended(a)) ||
      started(b).localeCompare(started(a)),
  );
}

export function emptyStudy(): StudyDraft {
  return {
    key: newKey(),
    level: "",
    title: "",
    institution: "",
    endMonth: "",
    endYear: "",
    inProgress: false,
    editing: true,
  };
}

export function emptyExperience(): ExperienceDraft {
  return {
    key: newKey(),
    role: "",
    place: "",
    startMonth: "",
    startYear: "",
    endMonth: "",
    endYear: "",
    current: false,
    description: "",
    editing: true,
  };
}

export function emptyProfileDraft(): ProfileDraft {
  return { about: "", studies: [], experiences: [] };
}

export function draftFromProfile(profile: TeacherProfile): ProfileDraft {
  return {
    about: profile.about ?? "",
    studies: profile.studies.map((s) => ({
      key: newKey(),
      level: s.level,
      title: s.title,
      institution: s.institution,
      endMonth: s.end_month ? String(Number(s.end_month.slice(5))) : "",
      endYear: s.end_month ? s.end_month.slice(0, 4) : "",
      inProgress: s.in_progress,
      editing: false,
    })),
    experiences: profile.experiences.map((e) => ({
      key: newKey(),
      role: e.role,
      place: e.place,
      startMonth: String(Number(e.start_month.slice(5))),
      startYear: e.start_month.slice(0, 4),
      endMonth: e.end_month ? String(Number(e.end_month.slice(5))) : "",
      endYear: e.end_month ? e.end_month.slice(0, 4) : "",
      current: e.end_month === null,
      description: e.description ?? "",
      editing: false,
    })),
  };
}

/** What gets sent. Call it only when profileDraftErrors found nothing. */
export function profileFromDraft(draft: ProfileDraft): TeacherProfile {
  return {
    about: draft.about.trim() || null,
    studies: draft.studies.map((s) => ({
      level: s.level as StudyLevel,
      title: s.title.trim(),
      institution: s.institution.trim(),
      end_month: s.inProgress ? null : toMonth(s.endYear, s.endMonth),
      in_progress: s.inProgress,
    })),
    experiences: draft.experiences.map((e) => ({
      role: e.role.trim(),
      place: e.place.trim(),
      start_month: toMonth(e.startYear, e.startMonth),
      end_month: e.current ? null : toMonth(e.endYear, e.endMonth),
      description: e.description.trim() || null,
    })),
  };
}

export function isDraftEmpty(draft: ProfileDraft): boolean {
  return (
    !draft.about.trim() && draft.studies.length === 0 && draft.experiences.length === 0
  );
}

export const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

/** "2015-11" -> "noviembre de 2015", to read a month in a sentence. */
export function monthLabel(month: string): string {
  return `${MONTH_NAMES[Number(month.slice(5)) - 1].toLowerCase()} de ${month.slice(0, 4)}`;
}

/** "2020" and "5" -> "2020-05", the format the API uses. */
function toMonth(year: string, month: string): string {
  return `${year}-${month.padStart(2, "0")}`;
}

export const END_BEFORE_START = "La fecha de fin no puede ser anterior a la de inicio.";

/** Checked while the dates are being edited: the end can't come before the
 * start. Only once both are complete, so nothing shows half-way through
 * typing a year. */
export function experienceRangeError(job: ExperienceDraft): string | null {
  const complete = (month: string, year: string) => month !== "" && /^\d{4}$/.test(year);
  if (job.current || !complete(job.startMonth, job.startYear) || !complete(job.endMonth, job.endYear)) return null;
  return toMonth(job.endYear, job.endMonth) < toMonth(job.startYear, job.startMonth) ? END_BEFORE_START : null;
}

/** A count the Colombian way, with a dot for thousands: "2.000". */
export function formatCount(count: number): string {
  return count.toLocaleString("es-CO");
}

function monthOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function requiredText(value: string, message: string, errors: Record<string, string>, key: string): void {
  if (!value.trim()) errors[key] = message;
  else if (value.trim().length > PROFILE_LIMITS.entryText)
    errors[key] = `Usa máximo ${PROFILE_LIMITS.entryText} caracteres.`;
}

// Checks a month and year typed apart, and gives back "YYYY-MM" when both
// are fine, to compare it with the other date.
function checkMonth(
  year: string,
  month: string,
  thisMonth: string,
  verb: string,
  errors: Record<string, string>,
  key: string,
): string | null {
  if (!month || !/^\d{4}$/.test(year)) {
    errors[key] = `Elige el mes y escribe el año en que ${verb}.`;
    return null;
  }
  const value = toMonth(year, month);
  if (Number(year) < PROFILE_LIMITS.earliestYear) errors[key] = "Revisa el año.";
  else if (value > thisMonth) errors[key] = "La fecha no puede ser futura.";
  else return value;
  return null;
}

/** The same rules the server applies, so the teacher sees them right away.
 * Keys are the field names, with the entry's key for studies and jobs
 * (like "study-entry-3-title"). Empty means everything is fine. */
export function profileDraftErrors(draft: ProfileDraft, today: Date = new Date()): Record<string, string> {
  const errors: Record<string, string> = {};
  const thisMonth = monthOf(today);

  if (draft.about.trim().length > PROFILE_LIMITS.about)
    errors.about = `Tu presentación puede tener máximo ${formatCount(PROFILE_LIMITS.about)} caracteres.`;

  for (const s of draft.studies) {
    const at = (field: string) => `study-${s.key}-${field}`;
    // Same order as the card, so the first error is the top one.
    requiredText(s.institution, "Escribe dónde lo estudiaste.", errors, at("institution"));
    requiredText(s.title, "Escribe el título del estudio.", errors, at("title"));
    if (!s.level) errors[at("level")] = "Elige el nivel del estudio.";
    if (!s.inProgress) {
      if (!s.endMonth || !/^\d{4}$/.test(s.endYear))
        errors[at("end")] = "Elige el mes y escribe el año en que terminaste, o marca que está en curso.";
      else if (Number(s.endYear) < PROFILE_LIMITS.earliestYear) errors[at("end")] = "Revisa el año.";
      else if (toMonth(s.endYear, s.endMonth) > thisMonth)
        errors[at("end")] = "Si aún no terminas, marca que está en curso.";
    }
  }

  for (const e of draft.experiences) {
    const at = (field: string) => `experience-${e.key}-${field}`;
    requiredText(e.role, "Escribe tu cargo.", errors, at("role"));
    requiredText(e.place, "Escribe dónde trabajaste.", errors, at("place"));
    const start = checkMonth(e.startYear, e.startMonth, thisMonth, "empezaste", errors, at("start"));
    if (!e.current) {
      const end = checkMonth(e.endYear, e.endMonth, thisMonth, "terminaste", errors, at("end"));
      if (start && end && end < start) errors[at("end")] = END_BEFORE_START;
    }
    if (e.description.trim().length > PROFILE_LIMITS.description)
      errors[at("description")] = `Usa máximo ${formatCount(PROFILE_LIMITS.description)} caracteres.`;
  }

  return errors;
}

/** The errors of one card only, so it can be confirmed on its own. */
export function entryErrors(draft: ProfileDraft, key: string, today: Date = new Date()): Record<string, string> {
  return Object.fromEntries(
    Object.entries(profileDraftErrors(draft, today)).filter(([field]) => field.includes(`-${key}-`)),
  );
}

export const OPEN_ENTRY_MESSAGE = "Confirma o quita el estudio o la experiencia que estás editando.";

/** The confirm button of the first card still open (without the form's id
 * prefix), or null when every card is confirmed. While one is open the
 * teacher can't move to another step or save. */
export function firstOpenEntry(draft: ProfileDraft): string | null {
  const study = draft.studies.find((s) => s.editing);
  if (study) return `study-${study.key}-confirm`;
  const job = draft.experiences.find((e) => e.editing);
  return job ? `experience-${job.key}-confirm` : null;
}
