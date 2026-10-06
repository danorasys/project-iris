import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { LessonDetail } from "@iris/shared-types";
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
      { id: "u1", classroom_id: "c1", title: "Los animales", guiding_question: "¿Dónde?", order_index: 0, lessons: [] },
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
}));

vi.mock("@/shared/api/hooks/useClassroomsApi", () => ({
  useClassroomDetail: () => ({ data: { students: [] } }),
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
  for (const mock of [updateLesson, setActivity, publish, uploadImage]) mock.mockReset();
});

describe("LessonEditorPage", { timeout: 20_000 }, () => {
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
    await user.upload(screen.getByLabelText("Agregar una imagen a la página 1"), heavy);

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
    await user.clear(screen.getByLabelText(/^Título, página 1/));

    expect(
      await screen.findByText("Contenido, página 1: completa o quita los bloques vacíos.", undefined, {
        timeout: 3000,
      }),
    ).toBeTruthy();
    expect(screen.getByText("La lección ya está publicada: completa esto antes de guardar.")).toBeTruthy();
  });
});
