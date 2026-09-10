import { Mascot } from "@/shared/ui/Mascot";
import { BigChoiceButton } from "@/shared/ui/BigChoiceButton";
import styles from "./MascotStepScreen.module.css";

interface MascotStepScreenProps {
  message: string;
  buttonLabel: string;
  onAdvance: () => void;
  progress?: string;
  variant?: "coral" | "teal" | "sol" | "hoja";
}

/** One IRIS-guided step: mascot message plus a single big button to move
 * on. The same interaction pattern used by the tour, the pre-calibration
 * screens and the calibration intro itself. */
export function MascotStepScreen({
  message,
  buttonLabel,
  onAdvance,
  progress,
  variant = "coral",
}: MascotStepScreenProps) {
  return (
    <main className={styles.container}>
      {progress && (
        <p className={styles.progress} aria-live="polite">
          {progress}
        </p>
      )}
      <Mascot mood="cheering" size="large">
        {message}
      </Mascot>
      <BigChoiceButton onSelect={onAdvance} variant={variant}>
        {buttonLabel}
      </BigChoiceButton>
    </main>
  );
}
