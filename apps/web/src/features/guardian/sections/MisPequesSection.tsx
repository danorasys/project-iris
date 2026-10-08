import { useCallback, useState } from "react";
import type { FamilyClassroom, StudentProfile } from "@iris/shared-types";
import { useAvatars, useEstudianteDeTutor, useEstudiantesDeTutor } from "@/shared/api/hooks/useAuthApi";
import { useFamilyClassrooms } from "@/shared/api/hooks/useClassroomsApi";
import { ageLabel } from "@/features/utils/calculateAge";
import { StudentAvatarImage } from "@/shared/ui/StudentAvatarImage";
import { Highlight, PortalBanner } from "@/shared/ui/portal/PortalBanner";
import { ProfileBanner } from "@/shared/ui/profile/ProfileHero";
import profile from "@/shared/ui/profile/ProfileSection.module.css";
import {
  IconArrowLeft,
  IconArrowRight,
  IconChild,
  IconClock,
  IconPlus,
  IconGraduationCap,
  IconUserCircle,
} from "@/shared/ui/icons";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { ViewEnter } from "@/shared/ui/ViewEnter";
import { SusClasesSection } from "./SusClasesSection";
import { SusDatosSection } from "./SusDatosSection";
import styles from "./MisPequesSection.module.css";

export type StudentOption = "datos" | "clases";

const OPTIONS: { id: StudentOption; title: string; hint: string; Icon: typeof IconGraduationCap }[] = [
  { id: "datos", title: "Sus datos", hint: "Consulta y actualiza su perfil.", Icon: IconUserCircle },
  {
    id: "clases",
    title: "Sus clases",
    hint: "Revisa sus clases, quién las enseña y sus lecciones.",
    Icon: IconGraduationCap,
  },
];

// A kid's row: the age, how many classes ("sin clases", "1 clase", "2
// clases") and how many requests wait. Without the classes (still loading,
// or the portal asked for its code) only the age is known.
function kidDetails(student: StudentProfile, classes: FamilyClassroom[] | null) {
  const age = ageLabel(student.date_of_birth);
  if (!classes) return { age, classes: null, line: age, label: age, waiting: 0 };
  const own = classes.filter((c) => c.student_id === student.id);
  const inside = own.filter((c) => c.status === "aceptada").length;
  const classesText = inside === 0 ? "sin clases" : inside === 1 ? "1 clase" : `${inside} clases`;
  return {
    age,
    classes: classesText,
    line: `${age} · ${classesText}`,
    label: `${age}, ${classesText}`,
    waiting: own.length - inside,
  };
}

interface MisPequesSectionProps {
  /** Opens this kid's space right away, like from "Ver su espacio" in Inicio. */
  initialStudentId?: string | null;
  /** And inside it this option, like "clases" from "3 clases" in Inicio. */
  initialOption?: StudentOption | null;
  /** Tells the portal there are unsaved changes in a kid's data, so it can
   * warn before switching section, going back or closing the session. */
  onDirtyChange: (dirty: boolean) => void;
}

/** Shows the guardian's real children (from /guardians/me/students) as
 * cards. Opening one shows a small space for that child with two options:
 * "sus datos" (see SusDatosSection) and "sus clases", which is not built
 * yet and says so instead of pretending to be finished. */
export function MisPequesSection({
  initialStudentId = null,
  initialOption = null,
  onDirtyChange,
}: MisPequesSectionProps) {
  const students = useEstudiantesDeTutor(true);
  // The classes of the family, for "2 clases · 1 en espera" on each card.
  // Without them (still loading, or the portal asked for its code) the cards
  // just show the age.
  const classes = useFamilyClassrooms().data ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(initialStudentId);
  const selected = students.data?.find((s) => s.id === selectedId) ?? null;

  if (students.isLoading) return <p className={styles.status}>Cargando tus peques…</p>;
  if (students.isError) {
    return (
      <p role="alert" className={`${styles.status} ${styles.error}`}>
        No pudimos cargar los perfiles de tus peques. Intenta recargar la página.
      </p>
    );
  }

  // The list and a kid's space are in the same ViewEnter, so going from one
  // to the other plays the entrance.
  if (selected) {
    return (
      <ViewEnter view={selected.id} level={1}>
        <StudentSpace
          student={selected}
          initialOption={selected.id === initialStudentId ? initialOption : null}
          onBack={() => setSelectedId(null)}
          onDirtyChange={onDirtyChange}
        />
      </ViewEnter>
    );
  }

  const list = students.data ?? [];
  return (
    <ViewEnter view="list">
      <div className={styles.section}>
        <PortalBanner
          label="Mis peques"
          eyebrow="Mis peques"
          title={
            <>
              Los perfiles de tus <Highlight>peques</Highlight>
            </>
          }
          chips={[list.length === 1 ? "1 perfil" : `${list.length} perfiles`]}
          icon={<IconChild width={40} height={40} />}
        />

        {/* The profiles go on their own soft panel, apart from the page. */}
        <section className={styles.profilesPanel} aria-label="Perfiles de tus peques">
          {list.length === 0 && (
            <div className={styles.empty}>
              <span className={styles.emptyIcon} aria-hidden="true">
                <IconChild width={26} height={26} />
              </span>
              <p className={styles.emptyTitle}>Todavía no tienes ningún perfil de estudiante</p>
              <p className={styles.emptyText}>Cuando registres a tu peque, su perfil va a aparecer aquí.</p>
            </div>
          )}

          {/* An organized list, like a table: the headings on top, then one row
            per kid with the age, how many classes and the requests waiting.
            The whole row opens the kid's space. */}
          <ul className={styles.kidList}>
            {/* The headings, and on their right the button to add a kid. Adding
              isn't built yet, aria-disabled tells screen readers so. */}
            <li className={styles.kidHead}>
              <span aria-hidden="true">Peque</span>
              <span aria-hidden="true">Edad</span>
              <span aria-hidden="true">Clases</span>
              <span aria-hidden="true">En espera</span>
              <button type="button" className={styles.addButton} aria-disabled="true">
                <IconPlus width={16} height={16} />
                Agregar estudiante
              </button>
            </li>
            {list.map((student) => {
              const details = kidDetails(student, classes);
              return (
                <li key={student.id}>
                  {/* The label reads the row as one sentence, the pieces alone
                    come out glued together in a screen reader. */}
                  <button
                    type="button"
                    className={styles.kidRow}
                    aria-label={`${student.first_name}, ${details.label}. Ver su espacio`}
                    onClick={() => setSelectedId(student.id)}
                  >
                    <span className={styles.kidName}>
                      <span className={styles.avatarRing}>
                        <StudentAvatarImage avatarId={student.avatar_id} size="small" label="" />
                      </span>
                      <span className={styles.kidNameText}>
                        <span className={styles.studentName}>{student.first_name}</span>
                        {/* On a phone the columns go, so the details go under the name. */}
                        <span className={styles.kidMobileMeta}>{details.line}</span>
                        {details.waiting > 0 && (
                          <span className={`${styles.studentWaiting} ${styles.kidMobileMeta}`}>
                            <IconClock width={13} height={13} aria-hidden="true" />
                            {details.waiting === 1
                              ? "1 solicitud en espera"
                              : `${details.waiting} solicitudes en espera`}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className={styles.kidCell}>{details.age}</span>
                    <span className={styles.kidCell}>{details.classes ?? "—"}</span>
                    <span className={styles.kidCell}>
                      {details.waiting > 0 ? (
                        <span className={styles.studentWaiting}>
                          <IconClock width={14} height={14} aria-hidden="true" />
                          {details.waiting === 1 ? "1 solicitud" : `${details.waiting} solicitudes`}
                        </span>
                      ) : (
                        <span className={styles.kidNone}>—</span>
                      )}
                    </span>
                    <IconArrowRight width={18} height={18} className={styles.studentChevron} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </ViewEnter>
  );
}

interface StudentSpaceProps {
  student: StudentProfile;
  initialOption: StudentOption | null;
  onBack: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

function StudentSpace({ student, initialOption, onBack, onDirtyChange }: StudentSpaceProps) {
  const [option, setOption] = useState<StudentOption | null>(initialOption);
  const current = OPTIONS.find((o) => o.id === option) ?? null;
  // The full name comes with the kid's data, the list only has the first name.
  const detail = useEstudianteDeTutor(student.id).data;
  // Same query as the list, so it comes from the cache.
  const details = kidDetails(student, useFamilyClassrooms().data ?? null);
  // The banner takes the color of the kid's avatar, from the catalog.
  const avatarColor = useAvatars().data?.find((a) => a.id === student.avatar_id)?.accent_color;
  const fullName = detail ? `${detail.first_name} ${detail.last_name}` : student.first_name;

  // Unsaved changes in "sus datos": the portal has to know, and going back
  // from here asks first.
  const [dirty, setDirty] = useState(false);
  const [confirmingBack, setConfirmingBack] = useState(false);
  const handleDirtyChange = useCallback(
    (isDirty: boolean) => {
      setDirty(isDirty);
      onDirtyChange(isDirty);
    },
    [onDirtyChange],
  );

  function goBack() {
    setConfirmingBack(false);
    if (current) setOption(null);
    else onBack();
  }

  return (
    <div className={styles.section}>
      <button type="button" className={styles.backButton} onClick={dirty ? () => setConfirmingBack(true) : goBack}>
        <IconArrowLeft width={18} height={18} />
        {current ? `Regresar al espacio de ${student.first_name}` : "Regresar a mis peques"}
      </button>

      {/* Like the banner of Mi perfil: the avatar hanging from a sky band, the
          full name, and pills with the age, the classes and the requests
          still waiting. */}
      <ProfileBanner
        eyebrow={current ? current.title : "El espacio de tu peque"}
        name={fullName}
        avatar={<StudentAvatarImage avatarId={student.avatar_id} size="medium" label="" />}
        color={avatarColor}
      >
        <span className={profile.chip}>{details.age}</span>
        {details.classes && <span className={profile.chip}>{details.classes}</span>}
        {details.waiting > 0 && (
          <span className={`${profile.chip} ${styles.waitingChip}`}>
            <IconClock width={13} height={13} aria-hidden="true" />
            {details.waiting === 1 ? "1 solicitud en espera" : `${details.waiting} solicitudes en espera`}
          </span>
        )}
      </ProfileBanner>

      {/* Under the banner, the option or the menu of options, with the
          entrance every time one is opened or closed. */}
      <ViewEnter view={option ?? "menu"} level={option ? 1 : 0} className={styles.section}>
        {option === "datos" && <SusDatosSection studentId={student.id} onDirtyChange={handleDirtyChange} />}

        {option === "clases" && <SusClasesSection studentId={student.id} firstName={student.first_name} />}

        {/* The options one under the other on a white panel, split by thin
            lines like the list of Mis peques. */}
        {!current && (
          <nav className={styles.optionsPanel} aria-labelledby="kid-options-title">
            <h2 id="kid-options-title" className={styles.optionsTitle}>
              Opciones
            </h2>
            <ul className={styles.optionList}>
              {OPTIONS.map(({ id, title, hint, Icon }) => (
                <li key={id}>
                  <button
                    type="button"
                    className={styles.optionRow}
                    aria-label={`${title}. ${hint}`}
                    onClick={() => setOption(id)}
                  >
                    <span className={styles.optionIcon} aria-hidden="true">
                      <Icon width={20} height={20} />
                    </span>
                    <span className={styles.optionText}>
                      <span className={styles.optionTitle}>{title}</span>
                      <span className={styles.optionHint}>{hint}</span>
                    </span>
                    <IconArrowRight width={18} height={18} className={styles.optionArrow} />
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </ViewEnter>

      {confirmingBack && (
        <ConfirmDialog
          title="Cambios sin guardar"
          message="Tienes cambios sin guardar. Se perderán si continúas."
          acceptLabel="Continuar sin guardar"
          cancelLabel="Cancelar"
          danger
          onAccept={goBack}
          onCancel={() => setConfirmingBack(false)}
        />
      )}
    </div>
  );
}
