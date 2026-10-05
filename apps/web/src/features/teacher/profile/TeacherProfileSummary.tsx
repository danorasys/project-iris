import type { TeacherProfile } from "@iris/shared-types";
import { IconBriefcase, IconGraduationCap } from "@/shared/ui/icons";
import { monthLabel, STUDY_LEVEL_LABELS } from "./teacherProfileDraft";
import styles from "./TeacherProfileSummary.module.css";

/** The teacher's profile to read, not to edit: their presentation, studies
 * and jobs, in the order the server keeps them (newest on top). Shown in the
 * last step of the registration so they check it before creating the
 * account. */
export function TeacherProfileSummary({ profile }: { profile: TeacherProfile }) {
  return (
    <section className={styles.summary} aria-label="Tu perfil docente">
      <h3 className={styles.title}>Tu perfil docente</h3>

      <div className={styles.block}>
        <h4 className={styles.blockTitle}>Sobre mí</h4>
        {profile.about ? (
          <p className={styles.about}>{profile.about}</p>
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
    </section>
  );
}
