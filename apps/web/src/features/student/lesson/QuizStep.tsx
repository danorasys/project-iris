import { useEffect, useRef, useState } from "react";
import type { AttemptResult, PlayQuestion } from "@iris/shared-types";
import { ApiError } from "@/shared/api/httpClient";
import { useCheckAnswer, useSubmitAttempt } from "@/shared/api/hooks/useLessonsApi";
import { BigChoiceButton } from "@/shared/ui/BigChoiceButton";
import { IconArrowLeft, IconCheck, IconClose, IconUndo } from "@/shared/ui/icons";
import { Mascot } from "@/shared/ui/Mascot";
import styles from "./LessonPlayer.module.css";

const VARIANTS = ["coral", "teal", "sol", "hoja"] as const;

type Phase = "asking" | "checking" | "right" | "wrong" | "grading" | "not_sent";

interface QuizStepProps {
  lessonId: string;
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

/** One question of the activity (HU-63). Choosing an option asks the server
 * if it's right, shows it with a little animation (never which one was the
 * right one), and goes on by itself: there's no way back to change it. After
 * the last one the server grades the whole try and keeps it. */
export function QuizStep({
  lessonId,
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
  const check = useCheckAnswer();
  const submit = useSubmitAttempt();
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
      const result = await submit.mutateAsync({
        lessonId,
        extraId,
        answers: Object.entries(all).map(([question_id, option_id]) => ({ question_id, option_id })),
      });
      onGraded(result);
    } catch (err) {
      if (err instanceof ApiError && err.code === "actividad_cambio") onChanged();
      else setPhase("not_sent");
    }
  }

  async function choose(optionId: string) {
    setFailed(false);
    setPhase("checking");
    try {
      const { correct } = await check.mutateAsync({ lessonId, extraId, questionId: question.id, optionId });
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
      <main className={styles.centered}>
        <Mascot mood="thinking" size="large">
          {phase === "grading"
            ? "Revisando tus respuestas…"
            : "No pudimos guardar tus respuestas. Revisa la conexión e inténtalo otra vez."}
        </Mascot>
        {phase === "not_sent" && (
          <BigChoiceButton
            variant="sol"
            icon={<IconUndo width={36} height={36} />}
            onSelect={() => void send(chosen)}
            dwellDurationMs={dwellDurationMs}
          >
            Enviar otra vez
          </BigChoiceButton>
        )}
      </main>
    );
  }

  const answered = phase === "right" || phase === "wrong";
  return (
    <main className={styles.centered}>
      <p className={styles.counter}>
        Pregunta {index + 1} de {total}
      </p>
      <h1 className={styles.prompt}>{question.prompt}</h1>
      {failed && (
        <p role="alert" className={styles.error}>
          No pudimos revisar tu respuesta. Elige otra vez para intentarlo.
        </p>
      )}
      <div className={styles.options}>
        {question.options.map((option, i) => (
          <BigChoiceButton
            key={option.id}
            variant={VARIANTS[i % VARIANTS.length]}
            onSelect={() => void choose(option.id)}
            disabled={phase !== "asking"}
            dwellDurationMs={dwellDurationMs}
          >
            {option.text}
          </BigChoiceButton>
        ))}
      </div>
      {answered ? (
        <div
          className={`${styles.feedback} ${phase === "right" ? styles.feedbackRight : styles.feedbackWrong}`}
          role="status"
        >
          <span className={styles.feedbackIcon} aria-hidden="true">
            {phase === "right" ? <IconCheck width={44} height={44} /> : <IconClose width={44} height={44} />}
          </span>
          {phase === "right" ? "¡Correcto!" : "Esa no era"}
        </div>
      ) : (
        // Apart from the answers, so it isn't taken for one of them.
        <div className={styles.leave}>
          <BigChoiceButton
            variant="teal"
            icon={<IconArrowLeft width={36} height={36} />}
            onSelect={onLeave}
            disabled={phase !== "asking"}
            dwellDurationMs={dwellDurationMs}
          >
            Salir de la actividad
          </BigChoiceButton>
        </div>
      )}
    </main>
  );
}
