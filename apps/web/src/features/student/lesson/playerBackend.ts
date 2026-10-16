import type { AttemptResult } from "@iris/shared-types";

/** Where the lesson player keeps the kid's way through a lesson: the page
 * they're on, whether an answer is right and the grade of a whole try. For
 * a kid it's the server (useServerBackend); for the teacher's preview it's
 * the browser, so nothing is saved. */
export interface PlayerBackend {
  reachPage: (extraId: string | null, page: number) => void;
  checkAnswer: (extraId: string | null, questionId: string, optionId: string) => Promise<boolean>;
  submitAttempt: (extraId: string | null, answers: Record<string, string>) => Promise<AttemptResult>;
}

/** The right answers of one activity (the lesson's or an extra's), in the
 * teacher's order, for the preview to grade without the server. */
export interface AnswerKey {
  passThreshold: number;
  /** question id -> its right option id, in the order of the questions. */
  right: [questionId: string, optionId: string][];
}

/** A player that keeps nothing: pages aren't saved, and answers are checked
 * and graded right here with the activity's key ("" is the lesson's own). */
export function localBackend(keys: Record<string, AnswerKey>): PlayerBackend {
  const keyOf = (extraId: string | null) => keys[extraId ?? ""];
  return {
    reachPage: () => undefined,
    checkAnswer: async (extraId, questionId, optionId) =>
      keyOf(extraId)?.right.some(([question, option]) => question === questionId && option === optionId) ?? false,
    submitAttempt: async (extraId, answers) => {
      const key = keyOf(extraId);
      const results = (key?.right ?? []).map(([question, option]) => answers[question] === option);
      const correct = results.filter(Boolean).length;
      return {
        id: "preview",
        correct,
        total: results.length,
        passed: correct >= (key?.passThreshold ?? 1),
        created_at: new Date().toISOString(),
        results,
      };
    },
  };
}
