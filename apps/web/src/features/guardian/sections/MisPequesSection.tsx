import { useCallback, useState, type ReactNode } from "react";
import type { StudentProfile } from "@iris/shared-types";
import { useEstudianteDeTutor, useEstudiantesDeTutor } from "@/shared/api/hooks/useAuthApi";
import { calculateAge } from "@/features/utils/calculateAge";
import { StudentAvatarImage } from "@/shared/ui/StudentAvatarImage";
import {
  IconArrowLeft,
  IconArrowRight,
  IconChild,
  IconInfo,
  IconPlus,
  IconGraduationCap,
  IconUserCircle,
} from "@/shared/ui/icons";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { SusDatosSection } from "./SusDatosSection";
import styles from "./MisPequesSection.module.css";

type StudentOption = "datos" | "clases";

const OPTIONS: { id: StudentOption; title: string; hint: string; Icon: typeof IconGraduationCap }[] = [
  { id: "datos", title: "Sus datos", hint: "Consulta y actualiza su perfil.", Icon: IconUserCircle },
  { id: "clases", title: "Sus clases", hint: "Acompaña a tu peque en sus clases.", Icon: IconGraduationCap },
];

function ageLabel(dateOfBirth: string): string {
  const age = calculateAge(dateOfBirth);
  return age === 1 ? "1 año" : `${age} años`;
}

interface MisPequesSectionProps {
  /** Tells the portal there are unsaved changes in a kid's data, so it can
   * warn before switching section, going back or closing the session. */
  onDirtyChange: (dirty: boolean) => void;
}

/** Shows the guardian's real children (from /guardians/me/students) as
 * cards. Opening one shows a small space for that child with two options:
 * "sus datos" (see SusDatosSection) and "sus clases", which is not built
 * yet and says so instead of pretending to be finished. */
export function MisPequesSection({ onDirtyChange }: MisPequesSectionProps) {
  const students = useEstudiantesDeTutor(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = students.data?.find((s) => s.id === selectedId) ?? null;

  if (students.isLoading) return <p className={styles.status}>Cargando tus peques…</p>;
  if (students.isError) {
    return (
      <p role="alert" className={`${styles.status} ${styles.error}`}>
        No pudimos cargar los perfiles de tus peques. Intenta recargar la página.
      </p>
    );
  }

  if (selected) {
    return <StudentSpace student={selected} onBack={() => setSelectedId(null)} onDirtyChange={onDirtyChange} />;
  }

  const list = students.data ?? [];
  return (
    <div className={styles.section}>
      <Hero
        eyebrow="Mis peques"
        title="Los perfiles de tus peques"
        badge={<IconChild width={34} height={34} />}
        meta={<span className={styles.chip}>{list.length === 1 ? "1 perfil" : `${list.length} perfiles`}</span>}
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

        <ul className={styles.grid}>
          {list.map((student) => (
            <li key={student.id}>
              {/* The label reads the card as one sentence, the pieces alone
                  come out glued together in a screen reader. */}
              <button
                type="button"
                className={styles.studentCard}
                aria-label={`${student.first_name}, ${ageLabel(student.date_of_birth)}. Ver su espacio`}
                onClick={() => setSelectedId(student.id)}
              >
                <span className={styles.avatarRing}>
                  <StudentAvatarImage avatarId={student.avatar_id} size="medium" label="" />
                </span>
                <span className={styles.studentName}>{student.first_name}</span>
                <span className={styles.studentAge}>{ageLabel(student.date_of_birth)}</span>
                <span className={styles.studentAction}>
                  Ver su espacio
                  <IconArrowRight width={16} height={16} />
                </span>
              </button>
            </li>
          ))}
          {/* Adding a kid from here isn't built yet, so the card is only shown.
              aria-disabled tells screen readers it does nothing for now. */}
          <li>
            <button type="button" className={styles.addCard} aria-disabled="true">
              <span className={styles.addIcon} aria-hidden="true">
                <IconPlus width={34} height={34} />
              </span>
              <span className={styles.addTitle}>Agregar estudiante</span>
            </button>
          </li>
        </ul>
      </section>
    </div>
  );
}

interface HeroProps {
  eyebrow: string;
  title: string;
  badge: ReactNode;
  meta: ReactNode;
  /** The badge is the kid's avatar, so it gets a solid white border. */
  avatar?: boolean;
}

/** The blue band at the top, the same look as the one in Mi perfil. */
function Hero({ eyebrow, title, badge, meta, avatar = false }: HeroProps) {
  return (
    <header className={styles.hero}>
      <span className={avatar ? `${styles.heroBadge} ${styles.heroAvatar}` : styles.heroBadge} aria-hidden="true">
        {badge}
      </span>
      <div className={styles.heroText}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1 className={styles.heroTitle}>{title}</h1>
        <p className={styles.heroMeta}>{meta}</p>
      </div>
    </header>
  );
}

interface StudentSpaceProps {
  student: StudentProfile;
  onBack: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

function StudentSpace({ student, onBack, onDirtyChange }: StudentSpaceProps) {
  const [option, setOption] = useState<StudentOption | null>(null);
  const current = OPTIONS.find((o) => o.id === option) ?? null;
  // The full name comes with the kid's data, the list only has the first name.
  const detail = useEstudianteDeTutor(student.id).data;
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

      <Hero
        eyebrow={current ? current.title : "El espacio de tu peque"}
        title={fullName}
        badge={<StudentAvatarImage avatarId={student.avatar_id} size="medium" label="" />}
        meta={<span className={styles.chip}>{ageLabel(student.date_of_birth)}</span>}
        avatar
      />

      {option === "datos" && <SusDatosSection studentId={student.id} onDirtyChange={handleDirtyChange} />}

      {option === "clases" && (
        <div className={styles.comingSoon}>
          <span className={styles.optionIcon} aria-hidden="true">
            <IconInfo width={20} height={20} />
          </span>
          <div>
            <p className={styles.comingSoonTitle}>Estamos construyendo esta sección</p>
            <p className={styles.comingSoonText}>Muy pronto vas a poder ver y gestionar sus clases aquí.</p>
          </div>
        </div>
      )}

      {!current && (
        <div className={styles.options}>
          {OPTIONS.map(({ id, title, hint, Icon }) => (
            <button
              key={id}
              type="button"
              className={styles.optionCard}
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
          ))}
        </div>
      )}

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
