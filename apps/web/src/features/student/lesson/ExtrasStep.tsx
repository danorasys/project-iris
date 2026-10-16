import type { PlayExtra } from "@iris/shared-types";
import { IconBook, IconQuestion, IconSparkle } from "@/shared/ui/icons";
import { KidCard, KidHeader } from "@/shared/ui/kid/KidKit";
import { PagedChoices } from "../components/PagedChoices";

interface ExtrasStepProps {
  extras: PlayExtra[];
  /** What it says under each one: what it is and how it's going. */
  noteOf: (extra: PlayExtra) => string;
  dwellDurationMs?: number;
  onOpen: (extra: PlayExtra) => void;
  onBack: () => void;
}

/** The extras the teacher left for this kid (HU-64), three at a time as very
 * big cards, with the arrows on the edges when there are more. */
export function ExtrasStep({ extras, noteOf, dwellDurationMs, onOpen, onBack }: ExtrasStepProps) {
  return (
    <PagedChoices
      items={extras}
      getKey={(extra) => extra.id}
      countLabel="Extras"
      dwellDurationMs={dwellDurationMs}
      back={{ label: "Regresar a la lección", onSelect: onBack }}
      top={
        <KidHeader
          eyebrow="Extra"
          icon={<IconSparkle aria-hidden="true" />}
          title="Tu profe dejó algo más para ti"
          subtitle="¿Qué quieres hacer?"
        />
      }
      render={(extra, index) => {
        const note = noteOf(extra);
        return (
          <KidCard
            title={extra.title}
            icon={extra.kind === "actividad" ? <IconQuestion /> : <IconBook />}
            tone={extra.kind === "actividad" ? "orange" : "mint"}
            note={note}
            noteTone={note.includes("· ya") ? "done" : "plain"}
            order={index}
            onSelect={() => onOpen(extra)}
            dwellDurationMs={dwellDurationMs}
          />
        );
      }}
    />
  );
}
