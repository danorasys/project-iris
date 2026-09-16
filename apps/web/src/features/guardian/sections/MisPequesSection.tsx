import { useState } from "react";
import { useEstudiantesDeTutor } from "@/shared/api/hooks/useAuthApi";
import { StudentAvatarImage } from "@/shared/ui/StudentAvatarImage";
import { IconArrowLeft } from "@/shared/ui/icons";
import styles from "./MisPequesSection.module.css";

/** Shows the guardian's real children (from /guardians/me/students) as
 * square icons. Tapping one opens a small space for that child with two
 * options, "sus datos" and "sus clases". Those two screens are not built
 * out yet, so they show a clear "coming soon" message instead of pretending
 * to be finished or hiding the option completely. */
export function MisPequesSection() {
  const students = useEstudiantesDeTutor(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = students.data?.find((s) => s.id === selectedId) ?? null;

  if (students.isLoading) return <p>Cargando tus peques…</p>;
  if (students.isError) {
    return (
      <p role="alert" className={styles.error}>
        No pudimos cargar los perfiles de tus hijos e hijas.
      </p>
    );
  }
  if (!students.data || students.data.length === 0) {
    return <p>Todavía no tienes ningún perfil de estudiante registrado.</p>;
  }

  if (selected) {
    return <StudentSpace studentName={selected.first_name} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div className={styles.grid}>
      {students.data.map((student) => (
        <button
          key={student.id}
          type="button"
          className={styles.studentTile}
          onClick={() => setSelectedId(student.id)}
        >
          <StudentAvatarImage avatarId={student.avatar_id} size="medium" label={student.first_name} />
          <span className={styles.studentName}>{student.first_name}</span>
        </button>
      ))}
    </div>
  );
}

function StudentSpace({ studentName, onBack }: { studentName: string; onBack: () => void }) {
  const [option, setOption] = useState<"datos" | "clases" | null>(null);

  return (
    <div className={styles.studentSpace}>
      <button type="button" className={styles.backButton} onClick={option ? () => setOption(null) : onBack}>
        <IconArrowLeft width={18} height={18} />
        {option ? "Regresar" : "Regresar a mis peques"}
      </button>
      <h2 className={styles.studentSpaceTitle}>{studentName}</h2>

      {!option && (
        <div className={styles.optionsRow}>
          <button type="button" className={styles.optionTile} onClick={() => setOption("datos")}>
            Sus datos
          </button>
          <button type="button" className={styles.optionTile} onClick={() => setOption("clases")}>
            Sus clases
          </button>
        </div>
      )}

      {option && (
        <p className={styles.comingSoon}>
          Estamos construyendo esta sección. Muy pronto vas a poder{" "}
          {option === "datos" ? "ver y editar los datos de tu hijo o hija aquí" : "ver y gestionar sus clases aquí"}.
        </p>
      )}
    </div>
  );
}
