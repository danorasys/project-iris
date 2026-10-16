import { useRef, useState } from "react";
import type {
  AttemptResult,
  ContentBlock,
  PlayActivity,
  PlayExtra,
  PlayLesson,
  PlayQuestion,
} from "@iris/shared-types";
import { IconBook, IconCheck, IconClose, IconQuestion, IconSparkle } from "@/shared/ui/icons";
import { KidCard, KidCards, KidHeader, KidMessage, KidPage } from "@/shared/ui/kid/KidKit";
import { ViewEnter } from "@/shared/ui/ViewEnter";
import { ExtrasStep } from "./ExtrasStep";
import { pagesOf, readPercent, resultMessage, resumePage, shuffled } from "./lessonRules";
import { PagesStep } from "./PagesStep";
import type { PlayerBackend } from "./playerBackend";
import { QuizStep } from "./QuizStep";
import { useServerBackend } from "./useServerBackend";
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
  /** Where the way through is kept. The server unless said otherwise; the
   * teacher's preview keeps it in the browser. */
  backend?: PlayerBackend;
}

/** A lesson the way a kid goes through it, all by gaze (HU-61 to HU-64):
 * its purpose, then three big cards for the content, the activity (once
 * it's all read) and the extras (once the activity is done). Pages and
 * tries are saved for the kid and the family (HU-46/47). */
export function LessonPlayer({
  lesson,
  dwellDurationMs,
  onExit,
  onReload,
  feedbackMs = 1600,
  backend,
}: LessonPlayerProps) {
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
  const server = useServerBackend(lesson.id, last);
  const api = backend ?? server;
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
    api.reachPage(part.extraId, page + 1);
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

  const lessonHeader = (subtitle?: string) => (
    <KidHeader eyebrow="Lección" icon={<IconBook aria-hidden="true" />} title={lesson.title} subtitle={subtitle} />
  );

  return (
    <div data-theme="portal" className={styles.stage}>
      <ViewEnter view={stepKey(step)} level={stepLevel(step)} onMount className={styles.step}>
        {step.kind === "intro" && (
          <KidPage next={{ label: "Continuar", onSelect: () => setStep({ kind: "hub" }) }} dwellDurationMs={dwellDurationMs}>
            {lessonHeader()}
            <KidMessage mood="cheering">{lesson.purpose}</KidMessage>
          </KidPage>
        )}

        {step.kind === "hub" && (
          <KidPage back={{ label: "Volver a las lecciones", onSelect: onExit }} dwellDurationMs={dwellDurationMs}>
            {lessonHeader("¿Qué quieres hacer en esta lección?")}
            <KidCards>
              <KidCard
                title="Contenido"
                icon={<IconBook />}
                tone="blue"
                note={mainRead === 100 ? "Ya leíste todo" : `Llevas ${mainRead} %`}
                noteTone={mainRead === 100 ? "done" : "plain"}
                onSelect={() => open(main)}
                dwellDurationMs={dwellDurationMs}
              />
              {main.activity && (
                <KidCard
                  title="Actividad"
                  icon={<IconQuestion />}
                  tone="orange"
                  order={1}
                  note={
                    !activityOpen
                      ? "Primero lee todo el contenido"
                      : done[""]
                        ? "Ya la hiciste. ¡Puedes repetirla!"
                        : "¡Ya puedes hacerla!"
                  }
                  noteTone={!activityOpen ? "locked" : done[""] ? "done" : "plain"}
                  disabled={!activityOpen}
                  onSelect={() => setStep({ kind: "briefing", part: main })}
                  dwellDurationMs={dwellDurationMs}
                />
              )}
              {lesson.extras.length > 0 && (
                <KidCard
                  title="Extra"
                  icon={<IconSparkle />}
                  tone="mint"
                  order={2}
                  note={extrasOpen ? "Algo más para ti" : "Primero haz la actividad"}
                  noteTone={extrasOpen ? "plain" : "locked"}
                  disabled={!extrasOpen}
                  onSelect={() => setStep({ kind: "extras" })}
                  dwellDurationMs={dwellDurationMs}
                />
              )}
            </KidCards>
          </KidPage>
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
          <KidPage
            next={{ label: "Ir a la lección", onSelect: () => setStep({ kind: "hub" }) }}
            dwellDurationMs={dwellDurationMs}
          >
            {lessonHeader()}
            <KidMessage mood="celebrating">
              ¡Terminaste de leer todo! Ahora ya puedes hacer la actividad de esta lección.
            </KidMessage>
          </KidPage>
        )}

        {step.kind === "briefing" && step.part.activity && (
          <KidPage
            back={{ label: "Regresar", onSelect: () => setStep(backFrom(step.part)) }}
            next={{ label: "Empezar", onSelect: () => startQuiz(step.part) }}
            dwellDurationMs={dwellDurationMs}
          >
            <KidHeader eyebrow="Actividad" icon={<IconQuestion aria-hidden="true" />} title={step.part.title} />
            <KidMessage mood="cheering">
              {`Vas a responder ${step.part.activity.questions.length} preguntas, una por una. Elige la respuesta que creas correcta y te diré si acertaste. ¡Puedes intentarlo las veces que quieras!`}
            </KidMessage>
          </KidPage>
        )}

        {step.kind === "quiz" && (
          <QuizStep
            // A new question starts fresh.
            key={step.index}
            backend={api}
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
          <KidPage
            back={{ label: "Sí, salir", onSelect: () => setStep(backFrom(step.quiz.part)) }}
            next={{ label: "Seguir respondiendo", onSelect: () => setStep(step.quiz) }}
            dwellDurationMs={dwellDurationMs}
          >
            <KidHeader eyebrow="Actividad" icon={<IconQuestion aria-hidden="true" />} title="¿Quieres salir?" />
            <KidMessage mood="thinking">
              Si sales ahora, este intento no se guarda. ¿Quieres salir de la actividad?
            </KidMessage>
          </KidPage>
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
          <KidPage next={{ label: "Abrir de nuevo", onSelect: onReload }} dwellDurationMs={dwellDurationMs}>
            {lessonHeader()}
            <KidMessage mood="thinking">
              Tu profe cambió esta actividad mientras la hacías. Vamos a abrirla de nuevo.
            </KidMessage>
          </KidPage>
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
    </div>
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
    <KidPage
      back={{ label: part.extraId === null ? "Volver a la lección" : "Volver a los extras", onSelect: onBack }}
      next={{ label: perfect ? "Hacerla otra vez" : "Intentar de nuevo", onSelect: onAgain }}
      dwellDurationMs={dwellDurationMs}
    >
      <KidHeader
        eyebrow="Actividad"
        icon={<IconQuestion aria-hidden="true" />}
        title={`${result.correct} de ${result.total} bien`}
      />
      <KidMessage mood={result.passed ? "celebrating" : "cheering"}>
        {resultMessage(result.correct, result.total, result.passed)}
      </KidMessage>
      <ol className={styles.results} aria-label="Tus respuestas">
        {rightInKidOrder.map((right, index) => (
          <li key={index} className={styles.result} data-right={right}>
            <span className={styles.resultIcon} aria-hidden="true">
              {right ? <IconCheck width={22} height={22} /> : <IconClose width={22} height={22} />}
            </span>
            <span>
              Pregunta {index + 1}: {right ? "bien" : "para repasar"}
            </span>
          </li>
        ))}
      </ol>
    </KidPage>
  );
}
