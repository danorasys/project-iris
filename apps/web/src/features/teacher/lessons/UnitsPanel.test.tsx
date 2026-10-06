import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { UnitWithLessons } from "@iris/shared-types";
import { UnitsPanel } from "./UnitsPanel";

const createUnit = vi.fn();
const reorderUnits = vi.fn();
const deleteUnit = vi.fn();
const createLesson = vi.fn();
const onToast = vi.fn();

const lesson = {
  id: "l1",
  classroom_id: "c1",
  unit_id: "u1",
  teacher_id: "t1",
  title: "Animales terrestres",
  purpose: "Hoy vas a aprender qué animales viven en la tierra.",
  learning_goal: "Identifico dónde viven algunos animales.",
  order_index: 0,
  status: "publicada" as const,
};

let units: UnitWithLessons[] = [];

vi.mock("@/shared/api/hooks/useLessonsApi", () => ({
  useClassroomUnits: () => ({ data: units, isLoading: false, isError: false }),
  useCreateUnit: () => ({ mutateAsync: createUnit, isPending: false }),
  useUpdateUnit: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReorderUnits: () => ({ mutate: reorderUnits, isPending: false }),
  useReorderLessons: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteUnit: () => ({ mutateAsync: deleteUnit, isPending: false }),
  useCreateLesson: () => ({ mutateAsync: createLesson, isPending: false }),
}));

function renderPanel() {
  return render(
    <MemoryRouter initialEntries={["/teacher/portal"]}>
      <Routes>
        <Route path="/teacher/portal" element={<UnitsPanel classroomId="c1" onToast={onToast} />} />
        <Route path="/teacher/classrooms/:classroomId/lessons/:lessonId/edit" element={<p>Editor abierto</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  units = [];
  for (const mock of [createUnit, reorderUnits, deleteUnit, createLesson, onToast]) mock.mockReset();
});

describe("UnitsPanel", { timeout: 20_000 }, () => {
  it("without units invites to create the first one", () => {
    renderPanel();

    expect(screen.getByText("Esta clase aún no tiene unidades")).toBeTruthy();
  });

  it("asks for the title and the guiding question before creating a unit", async () => {
    createUnit.mockResolvedValue({ id: "u9" });
    const user = userEvent.setup({ delay: null });
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Nueva unidad" }));
    await user.click(screen.getByRole("button", { name: "Crear unidad" }));
    expect(screen.getByText("Escribe el título de la unidad.")).toBeTruthy();
    expect(screen.getByText("Escribe la pregunta que guía la unidad.")).toBeTruthy();
    expect(createUnit).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/^Título de la unidad/), "Las plantas");
    await user.type(screen.getByLabelText(/^Pregunta guía/), "¿Qué necesita una planta?");
    await user.click(screen.getByRole("button", { name: "Crear unidad" }));

    expect(createUnit).toHaveBeenCalledWith({ title: "Las plantas", guiding_question: "¿Qué necesita una planta?" });
    expect(onToast).toHaveBeenCalledWith("La unidad se creó.");
  });

  it("shows each unit with its question and lessons, and only an empty unit can be deleted", async () => {
    units = [
      {
        id: "u1",
        classroom_id: "c1",
        title: "Los animales",
        guiding_question: "¿Dónde viven?",
        order_index: 0,
        lessons: [lesson],
      },
      {
        id: "u2",
        classroom_id: "c1",
        title: "Las plantas",
        guiding_question: "¿Qué comen?",
        order_index: 1,
        lessons: [],
      },
    ];
    deleteUnit.mockResolvedValue(undefined);
    const user = userEvent.setup({ delay: null });
    renderPanel();

    expect(screen.getByText("¿Dónde viven?")).toBeTruthy();
    expect(screen.getByText("Publicada")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /No se puede eliminar la unidad Los animales/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: "Eliminar la unidad Las plantas" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Sí, eliminar la unidad" }));

    expect(deleteUnit).toHaveBeenCalledWith("u2");
  });

  it("moves a unit and opens a lesson in the editor", async () => {
    units = [
      { id: "u1", classroom_id: "c1", title: "A", guiding_question: "¿A?", order_index: 0, lessons: [lesson] },
      { id: "u2", classroom_id: "c1", title: "B", guiding_question: "¿B?", order_index: 1, lessons: [] },
    ];
    const user = userEvent.setup({ delay: null });
    renderPanel();

    expect((screen.getByRole("button", { name: "Subir la unidad A" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Subir la unidad B" }));
    expect(reorderUnits).toHaveBeenCalledWith(["u2", "u1"], expect.anything());

    await user.click(screen.getByRole("button", { name: /^Animales terrestres/ }));
    expect(screen.getByText("Editor abierto")).toBeTruthy();
  });

  it("a new lesson needs its title, purpose and learning goal", async () => {
    units = [{ id: "u1", classroom_id: "c1", title: "A", guiding_question: "¿A?", order_index: 0, lessons: [] }];
    createLesson.mockResolvedValue({ ...lesson, id: "l2" });
    const user = userEvent.setup({ delay: null });
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Nueva lección en esta unidad" }));
    await user.click(screen.getByRole("button", { name: "Crear lección" }));
    expect(screen.getByText("Escribe el propósito de la lección.")).toBeTruthy();
    expect(screen.getByText("Escribe el desempeño esperado.")).toBeTruthy();

    await user.type(screen.getByLabelText(/^Título de la lección/), "Animales del agua");
    await user.type(screen.getByLabelText(/^Propósito/), "Hoy vas a aprender qué animales viven en el agua.");
    await user.type(screen.getByLabelText(/^Desempeño esperado/), "Identifico animales acuáticos.");
    await user.click(screen.getByRole("button", { name: "Crear lección" }));

    expect(createLesson).toHaveBeenCalledWith({
      unitId: "u1",
      body: {
        title: "Animales del agua",
        purpose: "Hoy vas a aprender qué animales viven en el agua.",
        learning_goal: "Identifico animales acuáticos.",
      },
    });
    expect(await screen.findByText("Editor abierto")).toBeTruthy();
  });
});
