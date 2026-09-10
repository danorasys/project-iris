import { useNavigate } from "react-router-dom";
import { BigChoiceButton } from "@/shared/ui/BigChoiceButton";
import { IconChild, IconTeacher } from "@/shared/ui/icons";
import styles from "./RoleSelectorPage.module.css";

/** The "¿Qué eres?" screen, entry point to both auth flows. It's a normal
 * mouse and keyboard screen, there's no camera or calibration yet at this
 * point, so it's not wrapped in a `GazeSourceProvider`. */
export default function RoleSelectorPage() {
  const navigate = useNavigate();

  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>Antes de empezar</p>
      <h1 className={styles.title}>¿Qué eres?</h1>
      <div className={styles.cards}>
        <BigChoiceButton
          variant="coral"
          icon={<IconChild className={styles.icon} />}
          note="Vamos a necesitar la ayuda de tu papá, mamá o quien te cuida para empezar."
          onSelect={() => navigate("/login/student")}
        >
          Estudiante
        </BigChoiceButton>
        <BigChoiceButton
          variant="teal"
          icon={<IconTeacher className={styles.icon} />}
          onSelect={() => navigate("/login/adult")}
        >
          Docente
        </BigChoiceButton>
      </div>
    </main>
  );
}
