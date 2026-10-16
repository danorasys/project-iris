import type { ReactNode } from "react";
import { KidHeader, KidMessage, KidPage } from "@/shared/ui/kid/KidKit";

interface MascotStepScreenProps {
  message: string;
  buttonLabel: string;
  onAdvance: () => void;
  /** Where this step is, like "Paso 2 de 4". */
  progress?: string;
  /** The small label on top and the title of the step. */
  eyebrow?: string;
  eyebrowIcon?: ReactNode;
  title?: string;
}

/** One IRIS-guided step: IRIS says something in its bubble, and the way on
 * is the long blue bar on the bottom edge. The tour and the screens before
 * the calibration go like this. */
export function MascotStepScreen({
  message,
  buttonLabel,
  onAdvance,
  progress,
  eyebrow,
  eyebrowIcon,
  title,
}: MascotStepScreenProps) {
  return (
    <KidPage next={{ label: buttonLabel, onSelect: onAdvance }}>
      {title && <KidHeader eyebrow={eyebrow ?? progress} icon={eyebrowIcon} title={title} subtitle={eyebrow && progress} />}
      <KidMessage mood="cheering">{message}</KidMessage>
    </KidPage>
  );
}
