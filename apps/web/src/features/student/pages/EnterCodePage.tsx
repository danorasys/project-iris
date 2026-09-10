import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BigChoiceButton } from "@/shared/ui/BigChoiceButton";
import { Mascot } from "@/shared/ui/Mascot";
import { NumericKeypad } from "@/shared/ui/NumericKeypad";
import { useAuth } from "@/shared/auth/AuthContext";
import { useJoinClassroom } from "@/shared/api/hooks/useClassroomsApi";
import { ApiError } from "@/shared/api/httpClient";
import { getDwellDurationMs } from "../lib/dwellPreferences";
import styles from "./EnterCodePage.module.css";

const CODE_LENGTH = 7;

/** `/student/enter-code`, a giant numeric keypad for the 7-digit entry
 * code. `POST /classrooms/enroll` creates a `pendiente` enrollment. This
 * screen just reports that it was sent, the teacher accepts it from their
 * panel. */
export default function EnterCodePage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const dwellDurationMs = session ? getDwellDurationMs(session.subjectId) : undefined;

  const [code, setCode] = useState("");
  const joinClassroom = useJoinClassroom();

  const confirm = () => {
    if (code.length !== CODE_LENGTH) return;
    joinClassroom.mutate(code);
  };

  const retry = () => {
    setCode("");
    joinClassroom.reset();
  };

  if (joinClassroom.isSuccess) {
    return (
      <main className={styles.container}>
        <Mascot mood="celebrating" size="large">
          ¡Listo! Tu solicitud fue enviada. Espera a que tu profe te acepte.
        </Mascot>
        <BigChoiceButton variant="hoja" onSelect={() => navigate("/student/home")} dwellDurationMs={dwellDurationMs}>
          Volver al inicio
        </BigChoiceButton>
      </main>
    );
  }

  if (joinClassroom.isError) {
    const message =
      joinClassroom.error instanceof ApiError
        ? joinClassroom.error.message
        : "No se pudo enviar la solicitud. Intenta de nuevo.";
    return (
      <main className={styles.container}>
        <Mascot mood="thinking" size="large">
          Uy, algo no salió bien.
        </Mascot>
        <p className={styles.errorMessage} role="alert">
          {message}
        </p>
        <BigChoiceButton variant="coral" onSelect={retry} dwellDurationMs={dwellDurationMs}>
          Intentar de nuevo
        </BigChoiceButton>
      </main>
    );
  }

  return (
    <main className={styles.container}>
      <Mascot mood={joinClassroom.isPending ? "thinking" : "cheering"} size="medium">
        {joinClassroom.isPending
          ? "Enviando tu solicitud…"
          : "Pídele a tu profe el código de 7 números y márcalo aquí."}
      </Mascot>
      <h1 className={styles.title}>Código de ingreso</h1>
      <NumericKeypad value={code} onChange={setCode} onConfirm={confirm} maxLength={CODE_LENGTH} />
    </main>
  );
}
