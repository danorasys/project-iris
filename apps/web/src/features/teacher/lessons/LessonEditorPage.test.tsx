import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { LessonDetail, UnitDba } from "@iris/shared-types";
import { ApiError } from "@/shared/api/httpClient";
import LessonEditorPage from "./LessonEditorPage";

const updateLesson = vi.fn();
const setActivity = vi.fn();
const publish = vi.fn();
const uploadImage = vi.fn();

const draft: LessonDetail = {
  id: "l1",
  classroom_id: "c1",
  unit_id: "u1",
  teacher_id: "t1",
  title: "Animales terrestres",
  purpose: "Hoy vas a aprender qué animales viven en la tierra.",
  learning_goal: "Identifico dónde viven algunos animales.",
  order_index: 0,
  status: "borrador",
  blocks: [{ id: "b1", type: "titulo", text: "Los animales", page_index: 0, order_index: 0 }],
  activity: null,
  extras: [],
  missing: ["Actividad: agrega al menos una pregunta."],
};

let lesson: LessonDetail = draft;

vi.mock("@/shared/api/hooks/useLessonsApi", () => ({
  useLessonDetail: () => ({ data: lesson, isLoading: false, isError: false }),
  useClassroomUnits: () => ({
    data: [
      {
        id: "u1",
        classroom_id: "c1",
        title: "Los animales",
        guiding_question: "¿Dónde?",
        learning_goal: "Explico dónde viven.",
        dba: unitDba,
        order_index: 0,
        lessons: [],
      },
    ],
    isLoading: false,
    isError: false,
  }),
  useUpdateLesson: () => ({ mutateAsync: updateLesson, isPending: false }),
  useSetActivity: () => ({ mutateAsync: setActivity, isPending: false }),
  usePublishLesson: () => ({ mutateAsync: publish, isPending: false }),
  useDeleteLesson: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUploadLessonImage: () => ({ mutateAsync: uploadImage, isPending: false }),
  useAddExtra: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateExtra: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetExtraActivity: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteExtra: () => ({ mutateAsync: vi.fn(), isPending: false }),
  // The kid's player asks for these; the preview must never use them.
  useReachPage: () => ({ mutateAsync: serverCall }),
  useCheckAnswer: () => ({ mutateAsync: serverCall }),
  useSubmitAttempt: () => ({ mutateAsync: serverCall }),
}));

const serverCall = vi.fn();

const LIVING_THINGS: UnitDba = {
  own: false,
  id: "natural_sciences-1-3",
  subject: "natural_sciences",
  grade: 1,
  number: 3,
  name: "Seres vivos y objetos sin vida",
  points: [
    { evidence_id: "natural_sciences-1-3-3", text: "Nombra las partes de una planta y de los animales que conoce." },
    { evidence_id: null, text: "Reconoce animales de su región." },
  ],
};
// The DBA of the lesson's unit, none unless a test says otherwise.
let unitDba: UnitDba | null = null;

// The class, with an area without DBA unless a test says otherwise.
let classroom: { students: never[]; area: string; grade: number } = { students: [], area: "arts", grade: 1 };

// The Portal Docente around the editor: its account, bell and session.
vi.mock("@/shared/auth/useAuth", () => ({ useAuth: () => ({ closeSession: vi.fn() }) }));
vi.mock("@/shared/api/hooks/useNotifications", () => ({ useUnreadNotifications: () => ({ data: 2 }) }));
vi.mock("@/shared/api/hooks/useTeacherProfileApi", () => ({
  useMyTeacherAccount: () => ({ data: { first_name: "Carlos", last_name: "Ruiz", email: "carlos@example.com" } }),
}));

vi.mock("@/shared/api/hooks/useClassroomsApi", () => ({
  useClassroomDetail: () => ({ data: classroom }),
}));

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={["/teacher/classrooms/c1/lessons/l1/edit"]}>
      <Routes>
        <Route path="/teacher/classrooms/:classroomId/lessons/:lessonId/edit" element={<LessonEditorPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  lesson = draft;
  classroom = { students: [], area: "arts", grade: 1 };
  unitDba = null;
  for (const mock of [updateLesson, setActivity, publish, uploadImage, serverCall]) mock.mockReset();
});

describe("LessonEditorPage", { timeout: 20_000 }, () => {
  it("shows its unit's DBA with its points, only to read", () => {
    classroom = { students: [], area: "natural_sciences", grade: 1 };
    unitDba = LIVING_THINGS;
    renderEditor();

    const box = screen.getByRole("region", { name: "DBA de la unidad" });
    expect(within(box).getByText("DBA 3 · Ciencias naturales · 1.°: Seres vivos y objetos sin vida")).toBeTruthy();
    expect(within(box).getByText("Nombra las partes de una planta y de los animales que conoce.")).toBeTruthy();
    expect(within(box).getByText("Reconoce animales de su región.")).toBeTruthy();
    expect(
      within(box).getByRole("link", { name: /Ver el texto oficial de los DBA de Ciencias naturales/ }),
    ).toBeTruthy();
    // They're chosen in the unit: nothing to tick or write here.
    expect(within(box).queryByRole("checkbox")).toBeNull();
    expect(within(box).queryByRole("textbox")).toBeNull();
  });

  it("with an own DBA in its unit has no link to the MEN", () => {
    classroom = { students: [], area: "natural_sciences", grade: 1 };
    unitDba = {
      own: true,
      id: null,
      subject: null,
      grade: null,
      number: null,
      name: "Cuido los animales de mi casa.",
      points: [],
    };
    renderEditor();

    const box = screen.getByRole("region", { name: "DBA de la unidad" });
    expect(within(box).getByText("DBA propio de la unidad: Cuido los animales de mi casa.")).toBeTruthy();
    expect(within(box).queryByRole("link")).toBeNull();
    expect(within(box).getByText(/La unidad todavía no tiene Evidencias de Aprendizaje/)).toBeTruthy();
  });

  it("says to choose the DBA in the unit when it has none yet", () => {
    classroom = { students: [], area: "natural_sciences", grade: 1 };
    renderEditor();

    expect(screen.getByText(/La unidad de esta lección todavía no tiene DBA/)).toBeTruthy();
  });

  it("in an area without DBA doesn't show it", () => {
    renderEditor();

    expect(screen.queryByRole("region", { name: "DBA de la unidad" })).toBeNull();
  });

  it("says what's missing and doesn't let publish until it's complete", () => {
    renderEditor();

    expect(screen.getByText("Para publicarla te falta:")).toBeTruthy();
    expect(screen.getByText("Actividad: agrega al menos una pregunta.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Publicar lección" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("saves a change by itself a moment after typing", async () => {
    updateLesson.mockResolvedValue({ ...draft, title: "Animales de la tierra" });
    const user = userEvent.setup({ delay: null });
    renderEditor();

    const title = screen.getByLabelText(/^Título de la lección/);
    await user.clear(title);
    await user.type(title, "Animales de la tierra");

    await waitFor(() => expect(updateLesson).toHaveBeenCalled(), { timeout: 3000 });
    expect(updateLesson).toHaveBeenLastCalledWith({
      lessonId: "l1",
      body: expect.objectContaining({ title: "Animales de la tierra", unit_id: "u1" }),
    });
    expect(await screen.findByText("Cambios guardados")).toBeTruthy();
  });

  it("an empty required field isn't saved", async () => {
    const user = userEvent.setup({ delay: null });
    renderEditor();

    await user.clear(screen.getByLabelText(/^Propósito/));

    expect(screen.getByText("Escribe el propósito de la lección.")).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(updateLesson).not.toHaveBeenCalled();
  });

  it("doesn't upload a picture heavier than 5 MB", async () => {
    const user = userEvent.setup({ delay: null });
    renderEditor();

    await user.click(screen.getByRole("tab", { name: /Contenido/ }));
    const heavy = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "grande.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Agregar una imagen a la diapositiva 1"), heavy);

    expect(await screen.findByText("La imagen no puede superar 5 MB.")).toBeTruthy();
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("publishes a complete lesson", async () => {
    lesson = { ...draft, missing: [] };
    publish.mockResolvedValue({ ...draft, status: "publicada", missing: [] });
    const user = userEvent.setup({ delay: null });
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Publicar lección" }));

    expect(publish).toHaveBeenCalledWith("l1");
    expect(await screen.findByText("La lección se publicó. Tus estudiantes ya la ven.")).toBeTruthy();
  });

  it("a published lesson that would be left incomplete says what's missing", async () => {
    lesson = { ...draft, status: "publicada", missing: [] };
    updateLesson.mockRejectedValue(
      new ApiError(422, "leccion_incompleta", "La lección ya está publicada: completa esto antes de guardar.", {
        missing: ["Contenido, página 1: completa o quita los bloques vacíos."],
      }),
    );
    const user = userEvent.setup({ delay: null });
    renderEditor();

    await user.click(screen.getByRole("tab", { name: /Contenido/ }));
    await user.clear(screen.getByLabelText(/^Título, diapositiva 1/));

    expect(
      await screen.findByText("Contenido, página 1: completa o quita los bloques vacíos.", undefined, {
        timeout: 3000,
      }),
    ).toBeTruthy();
    expect(screen.getByText("La lección ya está publicada: completa esto antes de guardar.")).toBeTruthy();
  });

  it("opens inside the Portal Docente, with its menu on Mis clases", () => {
    renderEditor();

    const menu = screen.getByRole("navigation", { name: "Opciones del portal docente" });
    expect(within(menu).getByRole("button", { name: /Mis clases/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: /Regresar a unidades y lecciones/ })).toBeTruthy();
  });

  it("writes the content as slides, one at a time, like the kid sees them", async () => {
    updateLesson.mockResolvedValue(draft);
    const user = userEvent.setup({ delay: null });
    renderEditor();

    await user.click(screen.getByRole("tab", { name: /Contenido/ }));
    expect(screen.getByText(/Animales terrestres · Página 1 de 1/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Nueva diapositiva/ }));
    expect(screen.getByText(/Página 2 de 2/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Diapositiva 2" }).getAttribute("aria-current")).toBe("true");

    // Back to the first one with its thumbnail; taking it out asks first.
    await user.click(screen.getByRole("button", { name: "Diapositiva 1" }));
    expect((screen.getByLabelText(/^Título, diapositiva 1/) as HTMLInputElement).value).toBe("Los animales");
    await user.click(screen.getByRole("button", { name: "Eliminar la diapositiva 1" }));
    expect(screen.getByText(/Se quita todo lo que tiene/)).toBeTruthy();
  });

  it("previews the lesson like a kid, answering it without saving anything", async () => {
    lesson = {
      ...draft,
      activity: {
        pass_threshold: 1,
        questions: [
          {
            prompt: "¿Dónde vive el perro?",
            options: [
              { text: "En la tierra", is_correct: true },
              { text: "En el mar", is_correct: false },
            ],
          },
        ],
      },
    };
    const user = userEvent.setup({ delay: null });
    renderEditor();

    await user.click(screen.getByRole("button", { name: /Vista previa/ }));
    const preview = screen.getByRole("dialog", { name: /Vista previa · así la verá tu estudiante/ });
    expect(within(preview).getByText(draft.purpose)).toBeTruthy();

    await user.click(within(preview).getByRole("button", { name: "Continuar" }));
    await user.click(within(preview).getByRole("button", { name: /Contenido/ }));
    expect(within(preview).getByRole("heading", { name: "Los animales" })).toBeTruthy();
    await user.click(within(preview).getByRole("button", { name: /Terminar la lectura/ }));
    await user.click(within(preview).getByRole("button", { name: /Ir a la lección/ }));
    await user.click(within(preview).getByRole("button", { name: /Actividad/ }));
    await user.click(within(preview).getByRole("button", { name: "Empezar" }));
    await user.click(within(preview).getByRole("button", { name: "En la tierra" }));

    expect(await within(preview).findByText("¡Correcto!")).toBeTruthy();
    expect(serverCall).not.toHaveBeenCalled();
  });
});
