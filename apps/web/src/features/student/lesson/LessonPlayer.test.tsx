import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PlayExtra, PlayLesson } from "@iris/shared-types";
import { ApiError } from "@/shared/api/httpClient";
import { LessonPlayer } from "./LessonPlayer";

const reach = vi.fn();
const check = vi.fn();
const submit = vi.fn();

vi.mock("@/shared/api/hooks/useLessonsApi", () => ({
  useReachPage: () => ({ mutateAsync: reach }),
  useCheckAnswer: () => ({ mutateAsync: check }),
  useSubmitAttempt: () => ({ mutateAsync: submit }),
}));

function text(id: string, value: string, page_index: number) {
  return { id, type: "texto" as const, text: value, page_index, order_index: 0 };
}

const TWO_QUESTIONS = {
  pass_threshold: 1,
  questions: [
    {
      id: "q1",
      prompt: "¿Dónde vive el perro?",
      options: [
        { id: "o1", text: "En la tierra" },
        { id: "o2", text: "En el mar" },
      ],
    },
    {
      id: "q2",
      prompt: "¿Dónde vive el pez?",
      options: [
        { id: "o3", text: "En el agua" },
        { id: "o4", text: "En el cielo" },
      ],
    },
  ],
};

const lesson: PlayLesson = {
  id: "l1",
  classroom_id: "c1",
  unit_id: "u1",
  teacher_id: "t1",
  title: "Animales terrestres",
  purpose: "Hoy vas a aprender qué animales viven en la tierra.",
  learning_goal: "Identifico dónde viven algunos animales.",
  order_index: 0,
  status: "publicada",
  // Page numbers can have gaps.
  blocks: [text("b1", "El perro vive en la tierra.", 0), text("b2", "El gato también.", 3)],
  activity: TWO_QUESTIONS,
  extras: [],
  pages_seen: 0,
  last_page: 0,
  activity_done: false,
};

const readAll = { pages_seen: 2, last_page: 2 };

function extra(id: string, kind: "contenido" | "actividad", fields: Partial<PlayExtra> = {}): PlayExtra {
  return {
    id,
    kind,
    title: kind === "contenido" ? "Más animales" : "Juego de animales",
    blocks: kind === "contenido" ? [text(`${id}-b`, "El caballo también vive en la tierra.", 0)] : [],
    activity: kind === "actividad" ? TWO_QUESTIONS : null,
    pages_seen: 0,
    last_page: 0,
    activity_done: false,
    ...fields,
  };
}

const onExit = vi.fn();
const button = (name: string | RegExp) => screen.getByRole("button", { name });

// Right or wrong stays a short moment, enough to see it in the test.
function renderPlayer(changes: Partial<PlayLesson> = {}) {
  render(<LessonPlayer lesson={{ ...lesson, ...changes }} onExit={onExit} onReload={vi.fn()} feedbackMs={200} />);
}

async function toHub(changes: Partial<PlayLesson> = {}) {
  renderPlayer(changes);
  await userEvent.click(button("Continuar"));
}

beforeEach(() => {
  reach.mockResolvedValue({ extra_id: null, pages_seen: 1, last_page: 1 });
  // The questions keep the teacher's order, so the tests know which comes.
  vi.spyOn(Math, "random").mockReturnValue(0.99);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // Also the answers queued for one call that a test didn't use.
  for (const mock of [reach, check, submit, onExit]) mock.mockReset();
});

describe("the lesson hub (HU-61)", () => {
  it("first says what the lesson is for, then shows its options", async () => {
    renderPlayer();
    expect(screen.getByText(lesson.purpose)).toBeTruthy();

    await userEvent.click(button("Continuar"));

    expect(screen.getByText("Llevas 0 %")).toBeTruthy();
    expect(button(/Actividad/)).toHaveProperty("disabled", true);
    expect(screen.getByText("Primero lee todo el contenido")).toBeTruthy();
    // Without extras for this kid there's no Extra.
    expect(screen.queryByRole("button", { name: /Extra/ })).toBeNull();
    await userEvent.click(button(/Volver a las lecciones/));
    expect(onExit).toHaveBeenCalledOnce();
  });

  it("the extra stays closed until the activity is done", async () => {
    await toHub({ ...readAll, extras: [extra("e1", "contenido")] });

    expect(button(/Actividad/)).toHaveProperty("disabled", false);
    expect(button(/Extra/)).toHaveProperty("disabled", true);
    expect(screen.getByText("Primero haz la actividad")).toBeTruthy();
  });
});

describe("the content (HU-62)", () => {
  it("saves each page and invites to the activity the first time it's all read", async () => {
    await toHub();

    await userEvent.click(button(/Contenido/));
    expect(screen.getByText("Animales terrestres · Página 1 de 2")).toBeTruthy();
    await userEvent.click(button("Página siguiente"));
    expect(screen.getByText("El gato también.")).toBeTruthy();
    await userEvent.click(button("Terminar la lectura"));

    expect(reach.mock.calls.map(([v]) => v.page)).toEqual([1, 2]);
    expect(screen.getByText(/Terminaste de leer todo/)).toBeTruthy();
    await userEvent.click(button(/Ir a la lección/));
    expect(screen.getByText("Ya leíste todo")).toBeTruthy();
    expect(button(/Actividad/)).toHaveProperty("disabled", false);
  });

  it("opens where the kid left, and going back saves that page too", async () => {
    await toHub({ pages_seen: 2, last_page: 2 });

    await userEvent.click(button(/Contenido/));
    expect(screen.getByText("El gato también.")).toBeTruthy();
    await userEvent.click(button("Página anterior"));

    // The page where they already were isn't sent again; the one before is.
    expect(reach.mock.calls.map(([v]) => v.page)).toEqual([1]);
  });

  it("already read before: no invitation, straight back to the hub", async () => {
    await toHub(readAll);

    await userEvent.click(button(/Contenido/));
    await userEvent.click(button("Terminar la lectura"));

    expect(screen.queryByText(/Terminaste de leer todo/)).toBeNull();
    expect(screen.getByText("¿Qué quieres hacer en esta lección?")).toBeTruthy();
  });
});

describe("the activity (HU-63)", () => {
  async function startActivity(changes: Partial<PlayLesson> = readAll) {
    await toHub(changes);
    await userEvent.click(button(/Actividad/));
    expect(screen.getByText(/Vas a responder 2 preguntas/)).toBeTruthy();
    await userEvent.click(button(/Empezar/));
  }

  it("says right or wrong after each answer and the server grades the whole try", async () => {
    check.mockResolvedValueOnce({ correct: true }).mockResolvedValueOnce({ correct: false });
    submit.mockResolvedValue({
      id: "a1",
      correct: 1,
      total: 2,
      passed: true,
      created_at: "2026-10-08T10:00:00Z",
      results: [true, false],
    });
    await startActivity();

    await userEvent.click(button("En la tierra"));
    expect(await screen.findByText("¡Correcto!")).toBeTruthy();
    await userEvent.click(await screen.findByRole("button", { name: "En el cielo" }));
    expect(await screen.findByText("Esa no era")).toBeTruthy();
    expect(await screen.findByText(/aprobaste/)).toBeTruthy();

    expect(check).toHaveBeenNthCalledWith(1, { lessonId: "l1", extraId: null, questionId: "q1", optionId: "o1" });
    expect(submit).toHaveBeenCalledWith({
      lessonId: "l1",
      extraId: null,
      answers: [
        { question_id: "q1", option_id: "o1" },
        { question_id: "q2", option_id: "o4" },
      ],
    });
    // Never which option was the right one.
    expect(screen.queryByText("En el agua")).toBeNull();
    await userEvent.click(button(/Volver a la lección/));
    expect(screen.getByText("Ya la hiciste. ¡Puedes repetirla!")).toBeTruthy();
  });

  it("each try mixes the questions", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    await startActivity();

    expect(screen.getByText("¿Dónde vive el pez?")).toBeTruthy();
  });

  it("leaving halfway asks first, and that try isn't sent", async () => {
    await startActivity();

    await userEvent.click(button(/Salir de la actividad/));
    expect(screen.getByText(/este intento no se guarda/)).toBeTruthy();
    await userEvent.click(button("Seguir respondiendo"));
    expect(screen.getByText("¿Dónde vive el perro?")).toBeTruthy();
    await userEvent.click(button(/Salir de la actividad/));
    await userEvent.click(button(/Sí, salir/));

    expect(screen.getByText("¿Qué quieres hacer en esta lección?")).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  it("if the teacher changed the activity, it opens again", async () => {
    check.mockRejectedValue(new ApiError(409, "actividad_cambio", "La actividad cambió"));
    await startActivity();

    await userEvent.click(button("En la tierra"));

    expect(await screen.findByText(/Tu profe cambió esta actividad/)).toBeTruthy();
  });
});

describe("the extras (HU-64)", () => {
  it("open once the activity is done: content to read, or an activity straight away", async () => {
    await toHub({ ...readAll, activity_done: true, extras: [extra("e1", "contenido"), extra("e2", "actividad")] });

    await userEvent.click(button(/Extra/));
    expect(screen.getByText("Para leer")).toBeTruthy();
    await userEvent.click(button(/Más animales/));
    expect(screen.getByText("El caballo también vive en la tierra.")).toBeTruthy();
    await userEvent.click(button("Terminar la lectura"));
    expect(screen.getByText("Para leer · ya lo leíste")).toBeTruthy();

    await userEvent.click(button(/Juego de animales/));
    expect(screen.getByText(/Vas a responder 2 preguntas/)).toBeTruthy();
    expect(reach).toHaveBeenCalledWith({ lessonId: "l1", page: 1, extraId: "e1" });
  });
});
