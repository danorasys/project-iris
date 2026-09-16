import { useNavigate } from "react-router-dom";
import { BigChoiceButton } from "@/shared/ui/BigChoiceButton";
import { Mascot } from "@/shared/ui/Mascot";
import { IconSparkle, IconUndo } from "@/shared/ui/icons";
import styles from "./StudentAuthIndex.module.css";

/** Index of `/login/student`. "Soy nuevo" registers the tutor and
 * creates the first profile, "Ya soy Mirador" leads to the profile picker
 * plus PIN. */
export default function StudentAuthIndex() {
  const navigate = useNavigate();

  return (
    <main className={styles.page}>
      <Mascot mood="happy">¡Hola! Para entrar, pidamos ayuda a un adulto.</Mascot>
      <h1 className={styles.title}>Entrar como estudiante</h1>
      <div className={styles.options}>
        <BigChoiceButton
          variant="coral"
          icon={<IconSparkle className={styles.icon} />}
          onSelect={() => navigate("/login/guardian/new")}
        >
          Soy nuevo
        </BigChoiceButton>
        <BigChoiceButton
          variant="teal"
          icon={<IconUndo className={styles.icon} />}
          onSelect={() => navigate("/login/student/profile")}
        >
          Ya soy Mirador
        </BigChoiceButton>
      </div>
    </main>
  );
}
