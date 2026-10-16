import { describe, expect, it } from "vitest";
import type { LessonDetail } from "@iris/shared-types";
import { previewLesson } from "./previewLesson";

const lesson: LessonDetail = {
  id: "l1",
  classroom_id: "c1",
  unit_id: "u1",
  teacher_id: "t1",
  title: "Guardado",
  purpose: "Propósito guardado",
  learning_goal: "Contar",
  order_index: 0,
  status: "borrador",
  blocks: [],
  activity: null,
  missing: [],
  extras: [
    {
      id: "e1",
      kind: "actividad",
      title: "Más práctica",
      order_index: 0,
      for_everyone: true,
      student_ids: [],
      blocks: [],
      activity: { pass_threshold: 1, questions: [{ prompt: "¿1 + 1?", options: [{ text: "2", is_correct: true }, { text: "3", is_correct: false }] }] },
      missing: [],
    },
    {
      id: "e2",
      kind: "contenido",
      title: "Sin terminar",
      order_index: 1,
      for_everyone: true,
      student_ids: [],
      blocks: [],
      activity: null,
      missing: ["Agrega al menos un bloque"],
    },
  ],
};

const draft = {
  title: "Contamos",
  purpose: "Vamos a contar",
  pages: [
    { key: "p1", blocks: [{ key: "b1", type: "titulo" as const, text: "Hola", page_index: 0, order_index: 0 }] },
    { key: "p2", blocks: [{ key: "b2", type: "texto" as const, text: "Uno, dos", page_index: 0, order_index: 0 }] },
  ],
  activity: {
    pass_threshold: 2,
    questions: [
      { key: "q1", prompt: "¿Qué sigue a 1?", options: [{ key: "o1", text: "2", is_correct: true }, { key: "o2", text: "5", is_correct: false }] },
      { key: "q2", prompt: "¿Qué sigue a 2?", options: [{ key: "o3", text: "1", is_correct: false }, { key: "o4", text: "3", is_correct: true }] },
    ],
  },
};

describe("the preview of a lesson", () => {
  it("plays the draft from zero, with its pages, its activity and only the complete extras", () => {
    const { lesson: play } = previewLesson(lesson, draft);

    expect(play.title).toBe("Contamos");
    expect(play.purpose).toBe("Vamos a contar");
    expect(play.blocks.map((block) => [block.page_index, block.type])).toEqual([
      [0, "titulo"],
      [1, "texto"],
    ]);
    expect(play.activity?.questions.map((q) => q.prompt)).toEqual(["¿Qué sigue a 1?", "¿Qué sigue a 2?"]);
    // The kid never gets which option is right, and neither does the player.
    expect(JSON.stringify(play.activity)).not.toContain("is_correct");
    expect(play.extras.map((extra) => extra.title)).toEqual(["Más práctica"]);
    expect([play.pages_seen, play.last_page, play.activity_done]).toEqual([0, 0, false]);
  });

  it("checks and grades the answers in the browser", async () => {
    const { lesson: play, backend } = previewLesson(lesson, draft);
    const [first, second] = play.activity!.questions;

    expect(await backend.checkAnswer(null, first.id, first.options[0].id)).toBe(true);
    expect(await backend.checkAnswer(null, first.id, first.options[1].id)).toBe(false);

    const half = await backend.submitAttempt(null, { [first.id]: first.options[0].id, [second.id]: second.options[0].id });
    expect([half.correct, half.total, half.passed, half.results]).toEqual([1, 2, false, [true, false]]);

    const extra = play.extras[0].activity!.questions[0];
    expect(await backend.checkAnswer("e1", extra.id, extra.options[0].id)).toBe(true);
  });
});
