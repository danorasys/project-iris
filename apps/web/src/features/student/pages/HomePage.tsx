import { useNavigate } from "react-router-dom";
import { BigChoiceButton } from "@/shared/ui/BigChoiceButton";
import { Mascot } from "@/shared/ui/Mascot";
import { IconBook, IconKey } from "@/shared/ui/icons";
import { useAuth } from "@/shared/auth/AuthContext";
import { getDwellDurationMs } from "../lib/dwellPreferences";
import styles from "./HomePage.module.css";

/** `/student/home`, the student's main screen. One target per decision,
 * at most 4 options at once. The two possible paths are joining a new
 * classroom with a code, or going straight to a class they're already
 * accepted into. */
export default function HomePage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const dwellDurationMs = session ? getDwellDurationMs(session.subjectId) : undefined;

  return (
    <main className={styles.container}>
      <Mascot mood="happy" size="large">
        ¡Hola de nuevo! ¿Qué vamos a hacer hoy?
      </Mascot>
      <h1 className={styles.title}>¿Qué quieres hacer?</h1>
      <div className={styles.options}>
        <BigChoiceButton
          variant="coral"
          icon={<IconKey width={36} height={36} />}
          onSelect={() => navigate("/student/enter-code")}
          dwellDurationMs={dwellDurationMs}
        >
          Entrar a aula de clase
        </BigChoiceButton>
        <BigChoiceButton
          variant="teal"
          icon={<IconBook width={36} height={36} />}
          onSelect={() => navigate("/student/classrooms")}
          dwellDurationMs={dwellDurationMs}
        >
          Ir a clase
        </BigChoiceButton>
      </div>
    </main>
  );
}
