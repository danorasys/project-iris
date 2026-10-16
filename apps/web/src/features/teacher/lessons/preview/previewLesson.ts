import type { Activity, ContentBlockInput, Extra, LessonDetail, PlayActivity, PlayLesson } from "@iris/shared-types";
import { localBackend, type AnswerKey, type PlayerBackend } from "@/features/student/lesson/playerBackend";
import { toActivity, toBlocks, type EditorActivity, type EditorPage } from "../editor/editorModel";

/** What the editor has right now, saved or not yet. */
export interface LessonDraft {
  title: string;
  purpose: string;
  pages: EditorPage[];
  activity: EditorActivity;
}

// The blocks with an id each, like the ones the kid gets.
function withIds(blocks: ContentBlockInput[], prefix: string) {
  return blocks.map((block, index) => ({ ...block, id: `${prefix}-b${index}` }));
}

// An activity as the kid gets it (ids, never which option is right) and its
// key, to grade it in the browser. Without questions there's no activity.
function playable(activity: Activity | null, prefix: string): { play: PlayActivity | null; key: AnswerKey | null } {
  if (!activity || activity.questions.length === 0) return { play: null, key: null };
  const right: AnswerKey["right"] = [];
  const questions = activity.questions.map((question, q) => {
    const id = `${prefix}-q${q}`;
    const options = question.options.map((option, o) => ({ id: `${id}-o${o}`, text: option.text }));
    const correct = question.options.findIndex((option) => option.is_correct);
    // A question without a right answer yet can't be answered right.
    right.push([id, correct >= 0 ? options[correct].id : ""]);
    return { id, prompt: question.prompt, options };
  });
  return {
    play: { pass_threshold: activity.pass_threshold, questions },
    key: { passThreshold: activity.pass_threshold, right },
  };
}

/** The lesson as a kid would play it, from what the teacher is writing:
 * its pages and activity as they are in the editor, and its extras that are
 * already complete (the kids only get those). Everything starts from zero,
 * like a kid opening it for the first time, and nothing is ever saved: the
 * backend grades in the browser. */
export function previewLesson(lesson: LessonDetail, draft: LessonDraft): { lesson: PlayLesson; backend: PlayerBackend } {
  const keys: Record<string, AnswerKey> = {};
  const main = playable(toActivity(draft.activity), "preview");
  if (main.key) keys[""] = main.key;

  const extras = lesson.extras
    .filter((extra: Extra) => extra.missing.length === 0)
    .map((extra) => {
      const { play, key } = playable(extra.activity, `preview-${extra.id}`);
      if (key) keys[extra.id] = key;
      return {
        id: extra.id,
        kind: extra.kind,
        title: extra.title,
        blocks: extra.blocks,
        activity: play,
        pages_seen: 0,
        last_page: 0,
        activity_done: false,
      };
    });

  return {
    lesson: {
      ...lesson,
      title: draft.title.trim() || lesson.title,
      purpose: draft.purpose.trim() || lesson.purpose,
      blocks: withIds(toBlocks(draft.pages), "preview"),
      activity: main.play,
      extras,
      pages_seen: 0,
      last_page: 0,
      activity_done: false,
    },
    backend: localBackend(keys),
  };
}
