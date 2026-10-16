import { useEffect, useRef, useState } from "react";
import type { AttemptResult, PlayQuestion } from "@iris/shared-types";
import { ApiError } from "@/shared/api/httpClient";
import { IconCheck, IconClose, IconQuestion } from "@/shared/ui/icons";
import { KidCard, KidCards, KidHeader, KidMessage, KidPage, type KidTone } from "@/shared/ui/kid/KidKit";
import type { PlayerBackend } from "./playerBackend";
import styles from "./LessonPlayer.module.css";

// Each answer its letter and its color, so they're easy to tell apart.
const LETTERS = ["A", "B", "C", "D", "E", "F"];
const TONES: KidTone[] = ["blue", "orange", "mint", "sun", "sky", "navy"];

type Phase = "asking" | "checking" | "right" | "wrong" | "grading" | "not_sent";

interface QuizStepProps {
  /** Checks each answer and grades the whole try (the server, or the
   * browser in the teacher's preview). */
  backend: PlayerBackend;
  extraId: string | null;
  question: PlayQuestion;
  /** From 0, in the order of this try. */
  index: number;
  total: number;
  /** The answers so far (question id -> option id), this one not included. */
  answers: Record<string, string>;
  dwellDurationMs?: number;
  /** How long right or wrong stays on screen before going on. */
  feedbackMs: number;
  onNext: (answers: Record<string, string>) => void;
  onGraded: (result: AttemptResult) => void;
  onChanged: () => void;
  onLeave: () => void;
}

/** One question of the activity (HU-63): the question big on top and each
 * answer as a very big card with its letter. Choosing one asks the backend
 * if it's right, shows it with a little animation (never which one was the
 * right one), and goes on by itself: there's no way back to change it. After
 * the last one the backend grades the whole try (the server keeps it). */
export function QuizStep({
  backend,
  extraId,
  question,
  index,
  total,
  answers,
  dwellDurationMs,
  feedbackMs,
  onNext,
  onGraded,
  onChanged,
  onLeave,
}: QuizStepProps) {
  const [phase, setPhase] = useState<Phase>("asking");
  const [chosen, setChosen] = useState<Record<string, string>>(answers);
  const pause = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [failed, setFailed] = useState(false);
  const isLast = index === total - 1;

  // The whole try, once the last answer is in. Only here it's kept: leaving
  // before this leaves no record.
  async function send(all: Record<string, string>) {
    setPhase("grading");
    try {
      onGraded(await backend.submitAttempt(extraId, all));
    } catch (err) {
      if (err instanceof ApiError && err.code === "actividad_cambio") onChanged();
      else setPhase("not_sent");
    }
  }

  async function choose(optionId: string) {
    setFailed(false);
    setPhase("checking");
    try {
      const correct = await backend.checkAnswer(extraId, question.id, optionId);
      const all = { ...answers, [question.id]: optionId };
      setChosen(all);
      setPhase(correct ? "right" : "wrong");
      // Right or wrong stays a moment, then the next question (or the grade).
      pause.current = setTimeout(() => (isLast ? void send(all) : onNext(all)), feedbackMs);
    } catch (err) {
      if (err instanceof ApiError && err.code === "actividad_cambio") onChanged();
      else {
        setFailed(true);
        setPhase("asking");
      }
    }
  }

  // Leaving the screen ("Salir", or the activity changed) stops the pause.
  useEffect(() => () => clearTimeout(pause.current), []);

  if (phase === "grading" || phase === "not_sent") {
    return (
      <KidPage
        next={phase === "not_sent" ? { label: "Enviar otra vez", onSelect: () => void send(chosen) } : undefined}
        dwellDurationMs={dwellDurationMs}
      >
        <KidHeader eyebrow="Actividad" icon={<IconQuestion aria-hidden="true" />} title="Tus respuestas" />
        <KidMessage mood="thinking">
          {phase === "grading"
            ? "Revisando tus respuestas…"
            : "No pudimos guardar tus respuestas. Revisa la conexión e inténtalo otra vez."}
        </KidMessage>
      </KidPage>
    );
  }

  const answered = phase === "right" || phase === "wrong";
  return (
    <KidPage
      back={{ label: "Salir de la actividad", onSelect: onLeave, disabled: phase !== "asking" }}
      dwellDurationMs={dwellDurationMs}
    >
      <KidHeader
        eyebrow={`Pregunta ${index + 1} de ${total}`}
        icon={<IconQuestion aria-hidden="true" />}
        title={question.prompt}
      />
      {failed && (
        <p role="alert" className={styles.error}>
          No pudimos revisar tu respuesta. Elige otra vez para intentarlo.
        </p>
      )}
      <KidCards className={question.options.length > 3 ? styles.manyOptions : undefined}>
        {question.options.map((option, i) => (
          <KidCard
            key={option.id}
            title={option.text}
            mark={LETTERS[i]}
            tone={TONES[i % TONES.length]}
            compact={question.options.length > 3}
            answer
            order={i}
            onSelect={() => void choose(option.id)}
            disabled={phase !== "asking"}
            dwellDurationMs={dwellDurationMs}
          />
        ))}
      </KidCards>
      {answered && (
        <div className={styles.feedback} data-right={phase === "right"} role="status">
          <span className={styles.feedbackIcon} aria-hidden="true">
            {phase === "right" ? <IconCheck width={44} height={44} /> : <IconClose width={44} height={44} />}
          </span>
          {phase === "right" ? "¡Correcto!" : "Esa no era"}
        </div>
      )}
    </KidPage>
  );
}
