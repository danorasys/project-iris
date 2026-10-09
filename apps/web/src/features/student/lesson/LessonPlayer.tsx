import { useRef, useState } from "react";
import type {
  AttemptResult,
  ContentBlock,
  PlayActivity,
  PlayExtra,
  PlayLesson,
  PlayQuestion,
} from "@iris/shared-types";
import { BigChoiceButton } from "@/shared/ui/BigChoiceButton";
import { IconArrowLeft, IconBook, IconCheck, IconClose, IconQuestion, IconSparkle, IconUndo } from "@/shared/ui/icons";
import { Mascot } from "@/shared/ui/Mascot";
import { ViewEnter } from "@/shared/ui/ViewEnter";
import { ExtrasStep } from "./ExtrasStep";
import { pagesOf, readPercent, resultMessage, resumePage, shuffled } from "./lessonRules";
import { PagesStep } from "./PagesStep";
import { QuizStep } from "./QuizStep";
import { useReachedPages } from "./useReachedPages";
import styles from "./LessonPlayer.module.css";

// One part of the lesson: the lesson itself (extraId null) or an extra.
interface Part {
  extraId: string | null;
  title: string;
  pages: ContentBlock[][];
  activity: PlayActivity | null;
}

interface Quiz {
  kind: "quiz";
  part: Part;
  /** The questions in the order of this try. */
  order: PlayQuestion[];
  index: number;
  answers: Record<string, string>;
}

type Step =
  | { kind: "intro" }
  | { kind: "hub" }
  | { kind: "pages"; part: Part; page: number }
  | { kind: "invite" }
  | { kind: "briefing"; part: Part }
  | Quiz
  | { kind: "leaving"; quiz: Quiz }
  | { kind: "result"; part: Part; order: PlayQuestion[]; result: AttemptResult }
  | { kind: "changed" }
  | { kind: "extras" };

// The key of a part in the progress records ("" is the lesson itself).
const keyOf = (part: Part) => part.extraId ?? "";

// Where each step goes in the lesson, for the direction of its entrance:
// further on comes from the right, back from the left (ViewEnter). The
// extras go a level deeper than the lesson.
function stepLevel(step: Step): number {
  const part = step.kind === "leaving" ? step.quiz.part : "part" in step ? step.part : null;
  const extra = part?.extraId ? 100 : 0;
  switch (step.kind) {
    case "intro":
      return 0;
    case "hub":
      return 1;
    case "invite":
    case "extras":
      return 2;
    case "pages":
      return extra + 10 + step.page;
    case "briefing":
      return extra + 40;
    case "quiz":
      return extra + 41 + step.index;
    case "leaving":
      return extra + 41 + step.quiz.index;
    case "result":
      return extra + 80;
    case "changed":
      return 90;
  }
}

function stepKey(step: Step): string {
  if (step.kind === "pages") return `pages:${keyOf(step.part)}:${step.page}`;
  if (step.kind === "quiz") return `quiz:${keyOf(step.part)}:${step.index}`;
  if (step.kind === "leaving") return `leaving:${step.quiz.index}`;
  if ("part" in step) return `${step.kind}:${keyOf(step.part)}`;
  return step.kind;
}

const partOf = (extra: PlayExtra): Part => ({
  extraId: extra.id,
  title: extra.title,
  pages: pagesOf(extra.blocks),
  activity: extra.activity,
});

interface LessonPlayerProps {
  lesson: PlayLesson;
  dwellDurationMs?: number;
  onExit: () => void;
  /** The activity changed while the kid did it: load the lesson again. */
  onReload: () => void;
  /** How long right or wrong stays on screen in the activity. */
  feedbackMs?: number;
}

/** A lesson the way a kid goes through it, all of it by gaze (HU-61 to
 * HU-64). The mascot says what it's for, then the lesson's hub: its content
 * (and how much of it they read), its activity once they read it all, and
 * the extras once they did the activity. Every page and every whole try is
 * kept, for them and for their family (HU-46/47). */
export function LessonPlayer({ lesson, dwellDurationMs, onExit, onReload, feedbackMs = 1600 }: LessonPlayerProps) {
  const main: Part = { extraId: null, title: lesson.title, pages: pagesOf(lesson.blocks), activity: lesson.activity };
  const [step, setStep] = useState<Step>({ kind: "intro" });

  // How it's going in each part, starting from what the server had.
  const [seen, setSeen] = useState<Record<string, number>>(() =>
    Object.fromEntries([["", lesson.pages_seen], ...lesson.extras.map((e) => [e.id, e.pages_seen])]),
  );
  const [last, setLast] = useState<Record<string, number>>(() =>
    Object.fromEntries([["", lesson.last_page], ...lesson.extras.map((e) => [e.id, e.last_page])]),
  );
  const [done, setDone] = useState<Record<string, boolean>>(() =>
    Object.fromEntries([["", lesson.activity_done], ...lesson.extras.map((e) => [e.id, e.activity_done])]),
  );
  const reachPage = useReachedPages(lesson.id, last);
  // The invitation to the activity, only the first time the reading gets to
  // 100 % (HU-62): if it already was, there's none.
  const invitePending = useRef(readPercent(lesson.pages_seen, main.pages.length) < 100);

  const readOf = (part: Part) => readPercent(seen[keyOf(part)] ?? 0, part.pages.length);
  const backFrom = (part: Part): Step => (part.extraId === null ? { kind: "hub" } : { kind: "extras" });

  // Every page shown is where they'll come back to, and maybe further on.
  function showPage(part: Part, page: number) {
    const key = keyOf(part);
    setStep({ kind: "pages", part, page });
    setLast((l) => ({ ...l, [key]: page + 1 }));
    setSeen((s) => ({ ...s, [key]: Math.max(s[key] ?? 0, page + 1) }));
    reachPage(part.extraId, page + 1);
  }

  // A part opens on its pages, where they left them. An extra that's only
  // an activity goes straight to it.
  function open(part: Part) {
    if (part.pages.length > 0) showPage(part, resumePage(last[keyOf(part)] ?? 0, part.pages.length));
    else if (part.activity) setStep({ kind: "briefing", part });
  }

  function afterPages(part: Part) {
    if (part.extraId === null && invitePending.current) {
      invitePending.current = false;
      setStep({ kind: "invite" });
    } else setStep(backFrom(part));
  }

  function startQuiz(part: Part) {
    if (part.activity) setStep({ kind: "quiz", part, order: shuffled(part.activity.questions), index: 0, answers: {} });
  }

  function graded(quiz: Quiz, result: AttemptResult) {
    setDone((d) => ({ ...d, [keyOf(quiz.part)]: true }));
    setStep({ kind: "result", part: quiz.part, order: quiz.order, result });
  }

  // The notes of the hub and of the extras: how far, and what's still closed.
  const mainRead = readOf(main);
  const activityOpen = mainRead === 100;
  const extrasOpen = main.activity ? Boolean(done[""]) : activityOpen;

  function extraNote(extra: PlayExtra): string {
    if (extra.kind === "actividad") return done[extra.id] ? "Actividad · ya la hiciste" : "Actividad";
    const read = readOf(partOf(extra));
    if (read === 100) return "Para leer · ya lo leíste";
    return read > 0 ? `Para leer · llevas ${read} %` : "Para leer";
  }

  return (
    <ViewEnter view={stepKey(step)} level={stepLevel(step)} onMount className={styles.stage}>
      {step.kind === "intro" && (
        <main className={styles.centered}>
          <Mascot mood="cheering" size="large">
            {lesson.purpose}
          </Mascot>
          <h1 className={styles.title}>{lesson.title}</h1>
          <BigChoiceButton variant="hoja" onSelect={() => setStep({ kind: "hub" })} dwellDurationMs={dwellDurationMs}>
            Continuar
          </BigChoiceButton>
        </main>
      )}

      {step.kind === "hub" && (
        <main className={styles.centered}>
          <Mascot mood="happy" size="medium">
            ¿Qué quieres hacer en esta lección?
          </Mascot>
          <h1 className={styles.title}>{lesson.title}</h1>
          <div className={styles.choices}>
            <BigChoiceButton
              variant="coral"
              icon={<IconBook width={36} height={36} />}
              note={mainRead === 100 ? "Ya leíste todo" : `Llevas ${mainRead} %`}
              onSelect={() => open(main)}
              dwellDurationMs={dwellDurationMs}
            >
              Contenido
            </BigChoiceButton>
            {main.activity && (
              <BigChoiceButton
                variant="sol"
                icon={<IconQuestion width={36} height={36} />}
                note={
                  !activityOpen
                    ? "Primero lee todo el contenido"
                    : done[""]
                      ? "Ya la hiciste. ¡Puedes repetirla!"
                      : "¡Ya puedes hacerla!"
                }
                disabled={!activityOpen}
                onSelect={() => setStep({ kind: "briefing", part: main })}
                dwellDurationMs={dwellDurationMs}
              >
                Actividad
              </BigChoiceButton>
            )}
            {lesson.extras.length > 0 && (
              <BigChoiceButton
                variant="hoja"
                icon={<IconSparkle width={36} height={36} />}
                note={extrasOpen ? "Algo más para ti" : "Primero haz la actividad"}
                disabled={!extrasOpen}
                onSelect={() => setStep({ kind: "extras" })}
                dwellDurationMs={dwellDurationMs}
              >
                Extra
              </BigChoiceButton>
            )}
            <BigChoiceButton
              variant="teal"
              icon={<IconArrowLeft width={36} height={36} />}
              onSelect={onExit}
              dwellDurationMs={dwellDurationMs}
            >
              Volver a las lecciones
            </BigChoiceButton>
          </div>
        </main>
      )}

      {step.kind === "pages" && (
        <PagesStep
          lessonId={lesson.id}
          title={step.part.title}
          pages={step.part.pages}
          page={step.page}
          dwellDurationMs={dwellDurationMs}
          onPage={(page) => showPage(step.part, page)}
          onBefore={() => setStep(backFrom(step.part))}
          backLabel={step.part.extraId === null ? "Volver a la lección" : "Volver a los extras"}
          onDone={() => afterPages(step.part)}
        />
      )}

      {step.kind === "invite" && (
        <main className={styles.centered}>
          <Mascot mood="celebrating" size="large">
            ¡Terminaste de leer todo! Ahora ya puedes hacer la actividad de esta lección.
          </Mascot>
          <BigChoiceButton
            variant="hoja"
            icon={<IconCheck width={36} height={36} />}
            onSelect={() => setStep({ kind: "hub" })}
            dwellDurationMs={dwellDurationMs}
          >
            Ir a la lección
          </BigChoiceButton>
        </main>
      )}

      {step.kind === "briefing" && step.part.activity && (
        <main className={styles.centered}>
          <Mascot mood="cheering" size="large">
            {`Vas a responder ${step.part.activity.questions.length} preguntas, una por una. Elige la respuesta que creas correcta y te diré si acertaste. ¡Puedes intentarlo las veces que quieras!`}
          </Mascot>
          <div className={styles.choices}>
            <BigChoiceButton
              variant="hoja"
              icon={<IconQuestion width={36} height={36} />}
              onSelect={() => startQuiz(step.part)}
              dwellDurationMs={dwellDurationMs}
            >
              Empezar
            </BigChoiceButton>
            <BigChoiceButton
              variant="teal"
              icon={<IconArrowLeft width={36} height={36} />}
              onSelect={() => setStep(backFrom(step.part))}
              dwellDurationMs={dwellDurationMs}
            >
              Regresar
            </BigChoiceButton>
          </div>
        </main>
      )}

      {step.kind === "quiz" && (
        <QuizStep
          // A new question starts fresh.
          key={step.index}
          lessonId={lesson.id}
          extraId={step.part.extraId}
          question={step.order[step.index]}
          index={step.index}
          total={step.order.length}
          answers={step.answers}
          dwellDurationMs={dwellDurationMs}
          feedbackMs={feedbackMs}
          onNext={(answers) => setStep({ ...step, index: step.index + 1, answers })}
          onGraded={(result) => graded(step, result)}
          onChanged={() => setStep({ kind: "changed" })}
          onLeave={() => setStep({ kind: "leaving", quiz: step })}
        />
      )}

      {step.kind === "leaving" && (
        <main className={styles.centered}>
          <Mascot mood="thinking" size="large">
            Si sales ahora, este intento no se guarda. ¿Quieres salir de la actividad?
          </Mascot>
          <div className={styles.choices}>
            <BigChoiceButton variant="hoja" onSelect={() => setStep(step.quiz)} dwellDurationMs={dwellDurationMs}>
              Seguir respondiendo
            </BigChoiceButton>
            <BigChoiceButton
              variant="coral"
              icon={<IconArrowLeft width={36} height={36} />}
              onSelect={() => setStep(backFrom(step.quiz.part))}
              dwellDurationMs={dwellDurationMs}
            >
              Sí, salir
            </BigChoiceButton>
          </div>
        </main>
      )}

      {step.kind === "result" && (
        <ResultStep
          part={step.part}
          order={step.order}
          result={step.result}
          dwellDurationMs={dwellDurationMs}
          onAgain={() => startQuiz(step.part)}
          onBack={() => setStep(backFrom(step.part))}
        />
      )}

      {step.kind === "changed" && (
        <main className={styles.centered}>
          <Mascot mood="thinking" size="large">
            Tu profe cambió esta actividad mientras la hacías. Vamos a abrirla de nuevo.
          </Mascot>
          <BigChoiceButton variant="teal" onSelect={onReload} dwellDurationMs={dwellDurationMs}>
            Abrir de nuevo
          </BigChoiceButton>
        </main>
      )}

      {step.kind === "extras" && (
        <ExtrasStep
          extras={lesson.extras}
          noteOf={extraNote}
          dwellDurationMs={dwellDurationMs}
          onOpen={(extra) => open(partOf(extra))}
          onBack={() => setStep({ kind: "hub" })}
        />
      )}
    </ViewEnter>
  );
}

interface ResultStepProps {
  part: Part;
  order: PlayQuestion[];
  result: AttemptResult;
  dwellDurationMs?: number;
  onAgain: () => void;
  onBack: () => void;
}

// The grade of the whole try, with a message that always cheers them on,
// and right or wrong per question in the order they answered them.
function ResultStep({ part, order, result, dwellDurationMs, onAgain, onBack }: ResultStepProps) {
  // The server answers in the teacher's order; the kid saw them mixed.
  const teacherOrder = part.activity?.questions.map((q) => q.id) ?? [];
  const rightInKidOrder = order.map((q) => result.results[teacherOrder.indexOf(q.id)] ?? false);
  const perfect = result.correct === result.total;

  return (
    <main className={styles.centered}>
      <Mascot mood={result.passed ? "celebrating" : "cheering"} size="large">
        {resultMessage(result.correct, result.total, result.passed)}
      </Mascot>
      <ol className={styles.results} aria-label="Tus respuestas">
        {rightInKidOrder.map((right, index) => (
          <li key={index} className={right ? styles.right : styles.wrong}>
            {right ? (
              <IconCheck width={22} height={22} aria-hidden="true" />
            ) : (
              <IconClose width={22} height={22} aria-hidden="true" />
            )}
            <span>
              Pregunta {index + 1}: {right ? "bien" : "para repasar"}
            </span>
          </li>
        ))}
      </ol>
      <div className={styles.choices}>
        <BigChoiceButton
          variant="sol"
          icon={<IconUndo width={36} height={36} />}
          onSelect={onAgain}
          dwellDurationMs={dwellDurationMs}
        >
          {perfect ? "Hacerla otra vez" : "Intentar de nuevo"}
        </BigChoiceButton>
        <BigChoiceButton
          variant="hoja"
          icon={<IconArrowLeft width={36} height={36} />}
          onSelect={onBack}
          dwellDurationMs={dwellDurationMs}
        >
          {part.extraId === null ? "Volver a la lección" : "Volver a los extras"}
        </BigChoiceButton>
      </div>
    </main>
  );
}
