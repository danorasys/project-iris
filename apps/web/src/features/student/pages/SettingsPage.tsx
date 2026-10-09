import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/shared/auth/useAuth";
import { getInputMode, switchInputMode, type InputMode } from "@/shared/gaze/inputMode";
import { BigChoiceButton } from "@/shared/ui/BigChoiceButton";
import { IconArrowLeft, IconEye, IconHome, IconKey, IconMouse, IconSliders, IconSparkle } from "@/shared/ui/icons";
import { Mascot } from "@/shared/ui/Mascot";
import { ViewEnter } from "@/shared/ui/ViewEnter";
import { getDwellDurationMs } from "../lib/dwellPreferences";
import styles from "./SettingsPage.module.css";

const MODE_NAME: Record<InputMode, string> = { gaze: "la mirada", mouse: "el mouse", keyboard: "el teclado" };

/** `/student/settings`, the kid's Ajustes: see the tour again (HU-89) and
 * change how they move around IRIS on this device (HU-88). Never more than
 * four things to choose on one screen. */
export default function SettingsPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const dwellDurationMs = session ? getDwellDurationMs(session.subjectId) : undefined;
  const [choosingMode, setChoosingMode] = useState(false);
  const mode = getInputMode();

  // Going back to the gaze needs a calibration; the others start right away.
  function choose(next: InputMode) {
    if (next === mode) {
      setChoosingMode(false);
      return;
    }
    switchInputMode(next, next === "gaze" ? "/student/calibration" : "/student/home");
  }

  return (
    <ViewEnter view={choosingMode ? "mode" : "menu"} level={choosingMode ? 1 : 0}>
      {choosingMode ? (
        <main className={styles.page}>
          <Mascot mood="thinking" size="medium">
            Ahora te mueves con {MODE_NAME[mode]}. ¿Cómo quieres moverte por IRIS?
          </Mascot>
          <div className={styles.choices}>
            <BigChoiceButton
              variant="teal"
              icon={<IconEye width={36} height={36} />}
              note={mode === "gaze" ? "Así te mueves ahora" : "Vamos a calibrar de nuevo"}
              onSelect={() => choose("gaze")}
              dwellDurationMs={dwellDurationMs}
            >
              Con la mirada
            </BigChoiceButton>
            <BigChoiceButton
              variant="coral"
              icon={<IconMouse width={36} height={36} />}
              note={mode === "mouse" ? "Así te mueves ahora" : undefined}
              onSelect={() => choose("mouse")}
              dwellDurationMs={dwellDurationMs}
            >
              Con el mouse
            </BigChoiceButton>
            <BigChoiceButton
              variant="sol"
              icon={<IconKey width={36} height={36} />}
              note={mode === "keyboard" ? "Así te mueves ahora" : "Tab para moverte, Enter para elegir"}
              onSelect={() => choose("keyboard")}
              dwellDurationMs={dwellDurationMs}
            >
              Con el teclado
            </BigChoiceButton>
            <BigChoiceButton
              variant="hoja"
              icon={<IconArrowLeft width={36} height={36} />}
              onSelect={() => setChoosingMode(false)}
              dwellDurationMs={dwellDurationMs}
            >
              Volver
            </BigChoiceButton>
          </div>
        </main>
      ) : (
        <main className={styles.page}>
          <Mascot mood="happy" size="medium">
            Estos son tus ajustes. ¿Qué quieres hacer?
          </Mascot>
          <h1 className={styles.title}>Ajustes</h1>
          <div className={styles.choices}>
            <BigChoiceButton
              variant="coral"
              icon={<IconSparkle width={36} height={36} />}
              onSelect={() => navigate("/student/tour", { state: { from: "settings" } })}
              dwellDurationMs={dwellDurationMs}
            >
              Ver el recorrido otra vez
            </BigChoiceButton>
            <BigChoiceButton
              variant="sol"
              icon={<IconSliders width={36} height={36} />}
              note={`Ahora con ${MODE_NAME[mode]}`}
              onSelect={() => setChoosingMode(true)}
              dwellDurationMs={dwellDurationMs}
            >
              Cómo me muevo
            </BigChoiceButton>
            <BigChoiceButton
              variant="teal"
              icon={<IconHome width={36} height={36} />}
              onSelect={() => navigate("/student/home")}
              dwellDurationMs={dwellDurationMs}
            >
              Volver al inicio
            </BigChoiceButton>
          </div>
        </main>
      )}
    </ViewEnter>
  );
}
