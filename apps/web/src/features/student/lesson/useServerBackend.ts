import { useMemo } from "react";
import { useCheckAnswer, useSubmitAttempt } from "@/shared/api/hooks/useLessonsApi";
import type { PlayerBackend } from "./playerBackend";
import { useReachedPages } from "./useReachedPages";

/** The kid's real way through a lesson: every page and every whole try is
 * kept by the server, which is also the one that says if an answer is right. */
export function useServerBackend(lessonId: string, startedAt: Record<string, number>): PlayerBackend {
  const reachPage = useReachedPages(lessonId, startedAt);
  const check = useCheckAnswer();
  const submit = useSubmitAttempt();
  const { mutateAsync: checkAsync } = check;
  const { mutateAsync: submitAsync } = submit;

  return useMemo(
    () => ({
      reachPage,
      checkAnswer: async (extraId, questionId, optionId) =>
        (await checkAsync({ lessonId, extraId, questionId, optionId })).correct,
      submitAttempt: (extraId, answers) =>
        submitAsync({
          lessonId,
          extraId,
          answers: Object.entries(answers).map(([question_id, option_id]) => ({ question_id, option_id })),
        }),
    }),
    [lessonId, reachPage, checkAsync, submitAsync],
  );
}
