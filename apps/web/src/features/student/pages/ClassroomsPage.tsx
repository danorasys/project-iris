import { useNavigate } from "react-router-dom";
import { BigChoiceButton } from "@/shared/ui/BigChoiceButton";
import { Mascot } from "@/shared/ui/Mascot";
import { IconKey } from "@/shared/ui/icons";
import { useAuth } from "@/shared/auth/AuthContext";
import { useStudentClassrooms } from "@/shared/api/hooks/useClassroomsApi";
import { getDwellDurationMs } from "../lib/dwellPreferences";
import styles from "./ClassroomsPage.module.css";

const VARIANTS = ["coral", "teal", "sol", "hoja"] as const;

/** `/student/classrooms`, classrooms where the student already has an
 * accepted enrollment ("Ir a clase" from the home screen). */
export default function ClassroomsPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const dwellDurationMs = session ? getDwellDurationMs(session.subjectId) : undefined;
  const classroomsQuery = useStudentClassrooms();

  if (classroomsQuery.isLoading) {
    return (
      <main className={styles.container}>
        <Mascot mood="thinking" size="medium">
          Buscando tus aulas…
        </Mascot>
      </main>
    );
  }

  if (classroomsQuery.isError) {
    return (
      <main className={styles.container}>
        <Mascot mood="thinking" size="medium">
          No pudimos cargar tus aulas. Inténtalo de nuevo en un momento.
        </Mascot>
        <BigChoiceButton variant="teal" onSelect={() => navigate("/student/home")} dwellDurationMs={dwellDurationMs}>
          Volver al inicio
        </BigChoiceButton>
      </main>
    );
  }

  const classrooms = classroomsQuery.data ?? [];

  if (classrooms.length === 0) {
    return (
      <main className={styles.container}>
        <Mascot mood="happy" size="large">
          Todavía no estás en ninguna aula. ¡Entra con el código que te dio tu profe!
        </Mascot>
        <BigChoiceButton
          variant="coral"
          icon={<IconKey width={36} height={36} />}
          onSelect={() => navigate("/student/enter-code")}
          dwellDurationMs={dwellDurationMs}
        >
          Entrar con un código
        </BigChoiceButton>
      </main>
    );
  }

  return (
    <main className={styles.container}>
      <Mascot mood="happy" size="medium">
        ¿A cuál clase quieres ir?
      </Mascot>
      <h1 className={styles.title}>Mis aulas</h1>
      <div className={styles.grid}>
        {classrooms.map((classroom, index) => (
          <BigChoiceButton
            key={classroom.id}
            variant={VARIANTS[index % VARIANTS.length]}
            onSelect={() => navigate(`/student/classrooms/${classroom.id}/lessons`)}
            dwellDurationMs={dwellDurationMs}
          >
            {classroom.name}
          </BigChoiceButton>
        ))}
      </div>
    </main>
  );
}
