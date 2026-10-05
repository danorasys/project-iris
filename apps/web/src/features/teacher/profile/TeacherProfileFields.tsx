import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { StudyLevel } from "@iris/shared-types";
import { TextField } from "@/features/auth/ui/TextField";
import { SelectField } from "@/features/auth/ui/SelectField";
import fields from "@/features/auth/ui/Fields.module.css";
import {
  IconBriefcase,
  IconCheck,
  IconGraduationCap,
  IconInfo,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@/shared/ui/icons";
import {
  MONTH_NAMES,
  PROFILE_LIMITS,
  STUDY_LEVEL_LABELS,
  emptyExperience,
  emptyStudy,
  END_BEFORE_START,
  entryErrors,
  experienceRangeError,
  formatCount,
  sortExperiences,
  sortStudies,
  type ExperienceDraft,
  type ProfileDraft,
  type StudyDraft,
} from "./teacherProfileDraft";
import styles from "./TeacherProfileFields.module.css";

interface TeacherProfileFieldsProps {
  /** Prefix of every id, so the form can live twice in the app. */
  idPrefix: string;
  draft: ProfileDraft;
  onChange: (draft: ProfileDraft) => void;
  /** From profileDraftErrors. */
  errors: Record<string, string>;
  disabled?: boolean;
  /** "Indicaciones iniciales", which says what the profile is for. The
   * registration shows it; Mi perfil doesn't, there it's already known. */
  showIntro?: boolean;
}

type EntryKind = "study" | "experience";

const LEVEL_OPTIONS = [
  { value: "", label: "Elige el nivel" },
  ...(Object.entries(STUDY_LEVEL_LABELS) as [StudyLevel, string][]).map(([value, label]) => ({ value, label })),
];

const MONTH_OPTIONS = [
  { value: "", label: "Mes" },
  ...MONTH_NAMES.map((name, index) => ({ value: String(index + 1), label: name })),
];

// Years are typed, only digits and at most 4.
function onlyYear(value: string): string {
  return value.replace(/\D/g, "").slice(0, 4);
}

/** The teacher's profile: about me, studies and experience (HU-96).
 * Everything optional. The registration shows it as an optional step and
 * the teacher's panel uses it to edit, so both look and check the same.
 * Each study or job is a card that's edited and then confirmed (check),
 * which locks it until the pencil opens it again. */
export function TeacherProfileFields({
  idPrefix,
  draft,
  onChange,
  errors,
  disabled,
  showIntro = true,
}: TeacherProfileFieldsProps) {
  const id = (key: string) => `${idPrefix}-${key}`;
  // Errors found when confirming a card, shown on that card's fields.
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});

  // Confirming, opening or adding a card can move or replace what had the
  // focus, so it's put where it belongs once the cards are drawn again.
  const focusNext = useRef<string | null>(null);
  useLayoutEffect(() => {
    const target = focusNext.current;
    focusNext.current = null;
    if (target) document.getElementById(id(target))?.focus();
  });

  function updateStudy(key: string, change: Partial<StudyDraft>) {
    onChange({ ...draft, studies: draft.studies.map((s) => (s.key === key ? { ...s, ...change } : s)) });
  }

  function updateExperience(key: string, change: Partial<ExperienceDraft>) {
    onChange({ ...draft, experiences: draft.experiences.map((e) => (e.key === key ? { ...e, ...change } : e)) });
  }

  // A field's error only shows while its card is open: a confirmed card
  // already passed every check.
  function fieldError(editing: boolean, field: string): string | undefined {
    return editing ? (cardErrors[field] ?? errors[field]) : undefined;
  }

  // Check: the card is checked on its own. If something is wrong it stays
  // open and says what; if not, it's locked, and the cards take their place
  // (newest on top) only now, never while one is being typed.
  function confirmEntry(kind: EntryKind, key: string) {
    const found = entryErrors(draft, key);
    setCardErrors((current) => ({
      ...Object.fromEntries(Object.entries(current).filter(([field]) => !field.includes(`-${key}-`))),
      ...found,
    }));
    const firstProblem = Object.keys(found)[0];
    if (firstProblem) {
      document.getElementById(id(firstProblem))?.focus();
      return;
    }
    if (kind === "study") {
      onChange({
        ...draft,
        studies: sortStudies(draft.studies.map((s) => (s.key === key ? { ...s, editing: false } : s))),
      });
    } else {
      onChange({
        ...draft,
        experiences: sortExperiences(draft.experiences.map((e) => (e.key === key ? { ...e, editing: false } : e))),
      });
    }
    focusNext.current = `${kind}-${key}-edit`;
  }

  // Pencil: the card opens again, starting at its first field.
  function editEntry(kind: EntryKind, key: string) {
    if (kind === "study") updateStudy(key, { editing: true });
    else updateExperience(key, { editing: true });
    focusNext.current = kind === "study" ? `study-${key}-institution` : `experience-${key}-role`;
  }

  function addStudy() {
    const study = emptyStudy();
    onChange({ ...draft, studies: [...draft.studies, study] });
    focusNext.current = `study-${study.key}-institution`;
  }

  function addExperience() {
    const job = emptyExperience();
    onChange({ ...draft, experiences: [...draft.experiences, job] });
    focusNext.current = `experience-${job.key}-role`;
  }

  return (
    <div className={styles.profile}>
      {/* The two notices go together at the start, like in step 1. */}
      <div className={styles.notices}>
        {showIntro && (
          <div className={styles.notice}>
            <IconInfo className={styles.noticeIcon} />
            <div className={styles.noticeBody}>
              <p className={styles.noticeHeading}>Indicaciones iniciales:</p>
              <p className={styles.noticeText}>
                Esta es tu carta de presentación para las familias: así conocerán tu formación y tu experiencia antes de
                confiarte a sus peques. Todo es opcional y puedes cambiarlo cuando quieras. Comparte solo lo
                relacionado con tu trayectoria como docente.
              </p>
            </div>
          </div>
        )}
        <CardsGuide />
      </div>

      <section className={`${styles.section} ${styles.aboutSection}`} aria-labelledby={id("about-title")}>
        <h3 id={id("about-title")} className={styles.sectionTitle}>
          Sobre mí
        </h3>
        <TextField
          id={id("about")}
          label="Preséntate en pocas palabras"
          hideLabel
          multiline
          rows={4}
          value={draft.about}
          onChange={(about) => onChange({ ...draft, about })}
          error={errors.about}
          disabled={disabled}
          placeholder="Preséntate en pocas palabras: por ejemplo, cuántos años llevas enseñando y cómo te gusta hacerlo."
        />
        <p className={styles.counter} aria-live="polite">
          {formatCount(draft.about.trim().length)} / {formatCount(PROFILE_LIMITS.about)}
        </p>
      </section>

      <section className={styles.section} aria-labelledby={id("studies-title")}>
        <h3 id={id("studies-title")} className={styles.sectionTitle}>
          Estudios
        </h3>
        {draft.studies.length === 0 && (
          <EmptyList icon={<IconGraduationCap />} hint="Cuéntales a las familias dónde te formaste.">
            Aún no has agregado estudios.
          </EmptyList>
        )}
        <ol className={styles.entries}>
          {draft.studies.map((study, index) => {
            const at = (field: string) => `study-${study.key}-${field}`;
            // Counted from the bottom: the oldest is 1, the newest on top has the highest number.
            const number = draft.studies.length - index;
            const locked = disabled || !study.editing;
            return (
              <li key={study.key} className={study.editing ? styles.entry : `${styles.entry} ${styles.entryLocked}`}>
                <EntryHeader
                  icon={<IconGraduationCap />}
                  title={`Estudio ${number}`}
                  caption={
                    [study.title, study.institution]
                      .map((t) => t.trim())
                      .filter(Boolean)
                      .join(" · ") || "Nuevo estudio"
                  }
                  name={`el estudio ${number}`}
                  editing={study.editing}
                  confirmId={id(at("confirm"))}
                  editId={id(at("edit"))}
                  onConfirm={() => confirmEntry("study", study.key)}
                  onEdit={() => editEntry("study", study.key)}
                  onRemove={() => onChange({ ...draft, studies: draft.studies.filter((s) => s.key !== study.key) })}
                  disabled={disabled}
                />
                <div className={styles.entryBody}>
                  {/* Institution and title get the whole width, both can be long.
                      Level and year are short, so they share a row. */}
                  <TextField
                    id={id(at("institution"))}
                    label="Institución"
                    value={study.institution}
                    onChange={(institution) => updateStudy(study.key, { institution })}
                    error={fieldError(study.editing, at("institution"))}
                    required
                    disabled={locked}
                    maxLength={PROFILE_LIMITS.entryText}
                  />
                  <TextField
                    id={id(at("title"))}
                    label="Título"
                    value={study.title}
                    onChange={(title) => updateStudy(study.key, { title })}
                    error={fieldError(study.editing, at("title"))}
                    required
                    disabled={locked}
                    maxLength={PROFILE_LIMITS.entryText}
                  />
                  <div className={styles.grid}>
                    <SelectField
                      id={id(at("level"))}
                      label="Nivel"
                      value={study.level}
                      options={LEVEL_OPTIONS}
                      onChange={(level) => updateStudy(study.key, { level: level as StudyLevel | "" })}
                      error={fieldError(study.editing, at("level"))}
                      required
                      disabled={locked}
                    />
                    {study.inProgress ? (
                      // While it's in progress there's no month or year, just one
                      // box that says so. The * stays: the date is still asked
                      // for, it's answered by the checkbox.
                      <TextField
                        id={id(at("end"))}
                        label="Fecha de finalización"
                        value="En curso"
                        onChange={() => undefined}
                        required
                        disabled
                      />
                    ) : (
                      <MonthYear
                        id={id(at("end"))}
                        legend="Fecha de finalización"
                        month={study.endMonth}
                        year={study.endYear}
                        onChange={(endMonth, endYear) => updateStudy(study.key, { endMonth, endYear })}
                        error={fieldError(study.editing, at("end"))}
                        disabled={locked}
                      />
                    )}
                  </div>
                  <label className={styles.inlineCheck}>
                    <input
                      type="checkbox"
                      checked={study.inProgress}
                      onChange={(event) =>
                        updateStudy(study.key, { inProgress: event.target.checked, endMonth: "", endYear: "" })
                      }
                      disabled={locked}
                    />
                    Lo estoy cursando actualmente
                  </label>
                </div>
              </li>
            );
          })}
        </ol>
        {draft.studies.length < PROFILE_LIMITS.studies && (
          <button type="button" className={styles.addButton} onClick={addStudy} disabled={disabled}>
            <IconPlus width={18} height={18} />
            Agregar un estudio
          </button>
        )}
      </section>

      <section className={styles.section} aria-labelledby={id("experience-title")}>
        <h3 id={id("experience-title")} className={styles.sectionTitle}>
          Experiencia
        </h3>
        {draft.experiences.length === 0 && (
          <EmptyList icon={<IconBriefcase />} hint="Cuéntales a las familias dónde has enseñado.">
            Aún no has agregado experiencia.
          </EmptyList>
        )}
        <ol className={styles.entries}>
          {draft.experiences.map((job, index) => {
            const at = (field: string) => `experience-${job.key}-${field}`;
            // Counted from the bottom, like the studies.
            const number = draft.experiences.length - index;
            const locked = disabled || !job.editing;
            // The order of the dates is checked live, while they're edited. A
            // saved "fin antes del inicio" goes away once the dates are fixed.
            const rangeError = job.editing ? experienceRangeError(job) : null;
            const savedEndError = fieldError(job.editing, at("end"));
            const endError = rangeError ?? (savedEndError === END_BEFORE_START ? undefined : savedEndError);
            return (
              <li key={job.key} className={job.editing ? styles.entry : `${styles.entry} ${styles.entryLocked}`}>
                <EntryHeader
                  icon={<IconBriefcase />}
                  title={`Experiencia ${number}`}
                  caption={
                    [job.role, job.place]
                      .map((t) => t.trim())
                      .filter(Boolean)
                      .join(" · ") || "Nueva experiencia"
                  }
                  name={`la experiencia ${number}`}
                  editing={job.editing}
                  confirmId={id(at("confirm"))}
                  editId={id(at("edit"))}
                  onConfirm={() => confirmEntry("experience", job.key)}
                  onEdit={() => editEntry("experience", job.key)}
                  onRemove={() =>
                    onChange({ ...draft, experiences: draft.experiences.filter((e) => e.key !== job.key) })
                  }
                  disabled={disabled}
                />
                <div className={styles.entryBody}>
                  {/* Role and place get the whole width; the two dates share a row. */}
                  <TextField
                    id={id(at("role"))}
                    label="Cargo"
                    value={job.role}
                    onChange={(role) => updateExperience(job.key, { role })}
                    error={fieldError(job.editing, at("role"))}
                    required
                    disabled={locked}
                    maxLength={PROFILE_LIMITS.entryText}
                  />
                  <TextField
                    id={id(at("place"))}
                    label="Dónde"
                    value={job.place}
                    onChange={(place) => updateExperience(job.key, { place })}
                    error={fieldError(job.editing, at("place"))}
                    required
                    disabled={locked}
                    maxLength={PROFILE_LIMITS.entryText}
                  />
                  <div className={styles.grid}>
                    <MonthYear
                      id={id(at("start"))}
                      legend="Desde"
                      month={job.startMonth}
                      year={job.startYear}
                      onChange={(startMonth, startYear) => updateExperience(job.key, { startMonth, startYear })}
                      error={fieldError(job.editing, at("start"))}
                      disabled={locked}
                    />
                    {!job.current && (
                      <MonthYear
                        id={id(at("end"))}
                        legend="Hasta"
                        month={job.endMonth}
                        year={job.endYear}
                        onChange={(endMonth, endYear) => updateExperience(job.key, { endMonth, endYear })}
                        error={endError}
                        disabled={locked}
                      />
                    )}
                  </div>
                  <label className={styles.inlineCheck}>
                    <input
                      type="checkbox"
                      checked={job.current}
                      onChange={(event) =>
                        updateExperience(job.key, { current: event.target.checked, endMonth: "", endYear: "" })
                      }
                      disabled={locked}
                    />
                    Trabajo ahí actualmente
                  </label>
                  <TextField
                    id={id(at("description"))}
                    label="Descripción (opcional)"
                    multiline
                    rows={4}
                    value={job.description}
                    onChange={(description) => updateExperience(job.key, { description })}
                    error={fieldError(job.editing, at("description"))}
                    disabled={locked}
                  />
                  <p className={styles.counter} aria-live="polite">
                    {formatCount(job.description.trim().length)} / {formatCount(PROFILE_LIMITS.description)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
        {draft.experiences.length < PROFILE_LIMITS.experiences && (
          <button type="button" className={styles.addButton} onClick={addExperience} disabled={disabled}>
            <IconPlus width={18} height={18} />
            Agregar una experiencia
          </button>
        )}
      </section>
    </div>
  );
}

// How the study and job cards work, each step next to a copy of its button
// (only a picture: the real buttons are on the cards). Same box as step 1's
// notices.
function CardsGuide() {
  return (
    <div className={styles.notice}>
      <IconInfo className={styles.noticeIcon} />
      <div className={styles.noticeBody}>
        <p className={styles.noticeHeading}>Indicaciones para tus estudios y tu experiencia:</p>
        <ul className={styles.guideList}>
          <li>
            <span className={styles.guideAdd} aria-hidden="true">
              <IconPlus width={14} height={14} />
              Agregar
            </span>
            <span>
              Toca <strong>Agregar un estudio</strong> o <strong>Agregar una experiencia</strong> para abrir una tarjeta
              nueva y llenar sus datos.
            </span>
          </li>
          <li>
            <span className={`${styles.guideIcon} ${styles.guideConfirm}`} aria-hidden="true">
              <IconCheck width={16} height={16} />
            </span>
            <span>
              Cuando termines, toca el <strong>check</strong> para confirmar la tarjeta: se revisan sus datos, queda
              bloqueada y toma su lugar, con lo más reciente arriba.
            </span>
          </li>
          <li>
            <span className={styles.guideIcon} aria-hidden="true">
              <IconPencil width={14} height={14} />
            </span>
            <span>
              Para cambiar una tarjeta confirmada, toca el <strong>lápiz</strong>, haz los cambios y vuelve a
              confirmarla con el check.
            </span>
          </li>
          <li>
            <span className={styles.guideRemove} aria-hidden="true">
              <IconTrash width={14} height={14} />
              Quitar
            </span>
            <span>
              Toca <strong>Quitar</strong> para borrar una tarjeta.
            </span>
          </li>
        </ul>
        <p className={styles.noticeText}>
          No podrás continuar mientras tengas una tarjeta sin confirmar.
        </p>
      </div>
    </div>
  );
}

interface EntryHeaderProps {
  icon: ReactNode;
  title: string;
  /** What the teacher typed so far, to tell the entries apart at a glance. */
  caption: string;
  /** How the buttons name the card, like "el estudio 1". */
  name: string;
  editing: boolean;
  confirmId: string;
  editId: string;
  onConfirm: () => void;
  onEdit: () => void;
  onRemove: () => void;
  disabled?: boolean;
}

// The top band of a study or job card: check while it's open, pencil once
// it's confirmed, and the button to take it out.
function EntryHeader({
  icon,
  title,
  caption,
  name,
  editing,
  confirmId,
  editId,
  onConfirm,
  onEdit,
  onRemove,
  disabled,
}: EntryHeaderProps) {
  return (
    <div className={styles.entryHeader}>
      <span className={styles.entryBadge} aria-hidden="true">
        {icon}
      </span>
      <div className={styles.entryHeading}>
        <span className={styles.entryTitle}>{title}</span>
        <span className={styles.entryCaption}>{caption}</span>
      </div>
      <div className={styles.entryActions}>
        {editing ? (
          <button
            id={confirmId}
            type="button"
            className={`${styles.iconButton} ${styles.confirmButton}`}
            onClick={onConfirm}
            disabled={disabled}
            aria-label={`Confirmar ${name}`}
            title="Confirmar"
          >
            <IconCheck width={18} height={18} />
          </button>
        ) : (
          <button
            id={editId}
            type="button"
            className={styles.iconButton}
            onClick={onEdit}
            disabled={disabled}
            aria-label={`Editar ${name}`}
            title="Editar"
          >
            <IconPencil width={16} height={16} />
          </button>
        )}
        <button
          type="button"
          className={styles.removeButton}
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Quitar ${name}`}
        >
          <IconTrash width={16} height={16} />
          Quitar
        </button>
      </div>
    </div>
  );
}

interface EmptyListProps {
  icon: ReactNode;
  hint: string;
  children: ReactNode;
}

// What shows while a list has nothing yet.
function EmptyList({ icon, hint, children }: EmptyListProps) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon} aria-hidden="true">
        {icon}
      </span>
      <div>
        <p className={styles.emptyTitle}>{children}</p>
        <p className={styles.emptyHint}>{hint}</p>
      </div>
    </div>
  );
}

interface MonthYearProps {
  id: string;
  legend: string;
  month: string;
  year: string;
  onChange: (month: string, year: string) => void;
  error?: string;
  disabled?: boolean;
}

// A month and a year side by side, under one name for screen readers.
function MonthYear({ id, legend, month, year, onChange, error, disabled }: MonthYearProps) {
  const errorId = `${id}-error`;
  return (
    <fieldset
      id={id}
      className={styles.monthYear}
      tabIndex={-1}
      aria-describedby={error ? errorId : undefined}
      aria-invalid={Boolean(error) || undefined}
      disabled={disabled}
    >
      <legend className={fields.label}>
        {legend}
        <span aria-hidden="true"> *</span>
      </legend>
      <div className={styles.monthYearInputs}>
        <select
          aria-label={`${legend}: mes`}
          className={fields.input}
          value={month}
          onChange={(event) => onChange(event.target.value, year)}
        >
          {MONTH_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          aria-label={`${legend}: año`}
          className={fields.input}
          value={year}
          onChange={(event) => onChange(month, onlyYear(event.target.value))}
          inputMode="numeric"
          placeholder="Año"
        />
      </div>
      {error && (
        <p id={errorId} className={fields.error} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
