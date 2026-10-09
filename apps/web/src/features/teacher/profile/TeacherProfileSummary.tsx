import type { TeacherProfile } from "@iris/shared-types";
import { IconBriefcase, IconGraduationCap, IconSchool, IconUserCircle } from "@/shared/ui/icons";
import { monthLabel, STUDY_LEVEL_LABELS } from "./teacherProfileDraft";
import styles from "./TeacherProfileSummary.module.css";

interface TeacherProfileSummaryProps {
  profile: TeacherProfile;
  title?: string;
  /** The school they work for, for the families (HU-97). Left out, the
   * block isn't shown, null says they didn't give one. */
  institution?: string | null;
  /** A small line under everything, like who declared it. */
  note?: string;
}

/** The teacher's profile to read, not to edit: their presentation, studies
 * and jobs, in the order the server keeps them (newest on top). Shown in the
 * last step of the registration so they check it before creating the
 * account, and to families who look at a class (HU-97). */
export function TeacherProfileSummary({
  profile,
  title = "Tu perfil docente",
  institution,
  note,
}: TeacherProfileSummaryProps) {
  return (
    <section className={styles.summary} aria-label={title}>
      <h3 className={styles.title}>{title}</h3>

      {institution !== undefined && (
        <div className={styles.block}>
          <h4 className={styles.blockTitle}>Institución</h4>
          {institution ? (
            <div className={styles.entry}>
              <IconSchool className={styles.entryIcon} aria-hidden="true" />
              <p className={styles.institution}>{institution}</p>
            </div>
          ) : (
            <p className={styles.empty}>No indicó una institución.</p>
          )}
        </div>
      )}

      <div className={styles.block}>
        <h4 className={styles.blockTitle}>Sobre mí</h4>
        {profile.about ? (
          <div className={styles.entry}>
            <IconUserCircle className={styles.entryIcon} aria-hidden="true" />
            <p className={styles.about}>{profile.about}</p>
          </div>
        ) : (
          <p className={styles.empty}>Sin presentación.</p>
        )}
      </div>

      <div className={styles.block}>
        <h4 className={styles.blockTitle}>Estudios</h4>
        {profile.studies.length === 0 ? (
          <p className={styles.empty}>Sin estudios.</p>
        ) : (
          <ul className={styles.entries}>
            {profile.studies.map((study, index) => (
              <li key={index} className={styles.entry}>
                <IconGraduationCap className={styles.entryIcon} aria-hidden="true" />
                <div>
                  <p className={styles.entryTitle}>{study.title}</p>
                  <p className={styles.entryLine}>
                    {study.institution} · {STUDY_LEVEL_LABELS[study.level]}
                  </p>
                  <p className={styles.entryLine}>
                    {study.in_progress || !study.end_month ? "En curso" : `Terminó en ${monthLabel(study.end_month)}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={styles.block}>
        <h4 className={styles.blockTitle}>Experiencia</h4>
        {profile.experiences.length === 0 ? (
          <p className={styles.empty}>Sin experiencia.</p>
        ) : (
          <ul className={styles.entries}>
            {profile.experiences.map((job, index) => (
              <li key={index} className={styles.entry}>
                <IconBriefcase className={styles.entryIcon} aria-hidden="true" />
                <div>
                  <p className={styles.entryTitle}>{job.role}</p>
                  <p className={styles.entryLine}>{job.place}</p>
                  <p className={styles.entryLine}>
                    {monthLabel(job.start_month)} – {job.end_month ? monthLabel(job.end_month) : "actualidad"}
                  </p>
                  {job.description && <p className={styles.description}>{job.description}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {note && <p className={styles.note}>{note}</p>}
    </section>
  );
}
