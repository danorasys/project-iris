import { useState } from "react";
import type { PlayExtra } from "@iris/shared-types";
import { BigChoiceButton } from "@/shared/ui/BigChoiceButton";
import { IconArrowLeft, IconArrowRight, IconBook, IconQuestion } from "@/shared/ui/icons";
import { Mascot } from "@/shared/ui/Mascot";
import { ViewEnter } from "@/shared/ui/ViewEnter";
import styles from "./LessonPlayer.module.css";

// Two colors for the extras, so "Ver más" (sol) and "Regresar" (hoja)
// never look like one of them.
const VARIANTS = ["coral", "teal"] as const;

// With more than three extras they go two at a time, plus "Ver más" and
// "Regresar": never more than four things to look at on one screen.
const EXTRAS_PER_SCREEN = 2;

interface ExtrasStepProps {
  extras: PlayExtra[];
  /** What it says under each one: what it is and how it's going. */
  noteOf: (extra: PlayExtra) => string;
  dwellDurationMs?: number;
  onOpen: (extra: PlayExtra) => void;
  onBack: () => void;
}

/** The extras the teacher left for this kid (HU-64). */
export function ExtrasStep({ extras, noteOf, dwellDurationMs, onOpen, onBack }: ExtrasStepProps) {
  const [screen, setScreen] = useState(0);
  const paged = extras.length > 3;
  const screens = Math.ceil(extras.length / EXTRAS_PER_SCREEN);
  const shown = paged ? extras.slice(screen * EXTRAS_PER_SCREEN, (screen + 1) * EXTRAS_PER_SCREEN) : extras;

  return (
    <main className={styles.centered}>
      <Mascot mood="happy" size="medium">
        Tu profe dejó algo más para ti. ¿Qué quieres hacer?
      </Mascot>
      <ViewEnter view={screen} level={screen} className={styles.choices}>
        {shown.map((extra, index) => (
          <BigChoiceButton
            key={extra.id}
            variant={VARIANTS[index % VARIANTS.length]}
            icon={
              extra.kind === "actividad" ? <IconQuestion width={36} height={36} /> : <IconBook width={36} height={36} />
            }
            note={noteOf(extra)}
            onSelect={() => onOpen(extra)}
            dwellDurationMs={dwellDurationMs}
          >
            {extra.title}
          </BigChoiceButton>
        ))}
        {paged && (
          <BigChoiceButton
            variant="sol"
            icon={<IconArrowRight width={36} height={36} />}
            note={`${screen + 1} de ${screens}`}
            onSelect={() => setScreen((s) => (s + 1) % screens)}
            dwellDurationMs={dwellDurationMs}
          >
            Ver más
          </BigChoiceButton>
        )}
        <BigChoiceButton
          variant="hoja"
          icon={<IconArrowLeft width={36} height={36} />}
          onSelect={onBack}
          dwellDurationMs={dwellDurationMs}
        >
          Regresar a la lección
        </BigChoiceButton>
      </ViewEnter>
    </main>
  );
}
