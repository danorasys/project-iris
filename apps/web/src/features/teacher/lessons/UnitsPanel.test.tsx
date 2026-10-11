import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ClassroomArea, Dba, UnitWithLessons } from "@iris/shared-types";
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

const updateUnit = vi.fn();
// The class's area, one without DBA unless a test says otherwise.
let area: ClassroomArea = "arts";
const CATALOG: Dba[] = [
  {
    id: "natural_sciences-1-3",
    subject: "natural_sciences",
    grade: 1,
    number: 3,
    name: "Seres vivos y objetos sin vida",
    evidences: [{ id: "natural_sciences-1-3-3", text: "Nombra las partes de una planta." }],
  },
  { id: "language-1-1", subject: "language", grade: 1, number: 1, name: "Los medios de comunicación", evidences: [] },
  {
    id: "english-1-1",
    subject: "english",
    grade: 1,
    number: 1,
    name: "Seguir instrucciones sencillas de clase",
    evidences: [],
  },
];

function subjectsOf(classArea: ClassroomArea): string[] {
  return classArea === "humanities" ? ["language", "english"] : [classArea];
}

vi.mock("@/shared/api/hooks/useLessonsApi", () => ({
  useClassroomUnits: () => ({ data: units, isLoading: false, isError: false }),
  useCreateUnit: () => ({ mutateAsync: createUnit, isPending: false }),
  useUpdateUnit: () => ({ mutateAsync: updateUnit, isPending: false }),
  // A piece of the real catalog, for the class's area and grade.
  useClassroomDba: () => ({
    data: CATALOG.filter((dba) => subjectsOf(area).includes(dba.subject)),
    isLoading: false,
    isError: false,
  }),
  useReorderUnits: () => ({ mutate: reorderUnits, isPending: false }),
  useReorderLessons: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteUnit: () => ({ mutateAsync: deleteUnit, isPending: false }),
  useCreateLesson: () => ({ mutateAsync: createLesson, isPending: false }),
}));

function renderPanel(readOnly = false) {
  return render(
    <MemoryRouter initialEntries={["/teacher/portal"]}>
      <Routes>
        <Route
          path="/teacher/portal"
          element={<UnitsPanel classroomId="c1" area={area} onToast={onToast} readOnly={readOnly} />}
        />
        <Route path="/teacher/classrooms/:classroomId/lessons/:lessonId/edit" element={<p>Editor abierto</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  units = [];
  area = "arts";
  for (const mock of [createUnit, updateUnit, reorderUnits, deleteUnit, createLesson, onToast]) mock.mockReset();
});

describe("UnitsPanel", { timeout: 20_000 }, () => {
  it("in an area with DBA a new unit needs its DBA, of the catalog, and its points", async () => {
    area = "natural_sciences";
    createUnit.mockResolvedValue({ id: "u9" });
    const user = userEvent.setup({ delay: null });
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Nueva unidad" }));
    await user.type(screen.getByLabelText(/^Título de la unidad/), "Los animales");
    await user.type(screen.getByLabelText(/^Pregunta guía/), "¿Dónde viven?");
    await user.click(screen.getByRole("button", { name: "Crear unidad" }));
    expect(screen.getByText("Elige el DBA de la unidad o escribe uno propio.")).toBeTruthy();
    expect(createUnit).not.toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText(/^DBA/), "natural_sciences-1-3");
    expect(screen.getByRole("link", { name: /Ver el texto oficial de los DBA de Ciencias naturales/ })).toBeTruthy();
    // Without an evidence, it doesn't save either.
    await user.click(screen.getByRole("button", { name: "Crear unidad" }));
    expect(screen.getByText("Marca al menos una evidencia de aprendizaje o escribe una propia.")).toBeTruthy();
    expect(createUnit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("checkbox", { name: "Nombra las partes de una planta." }));
    await user.click(screen.getByRole("button", { name: "Agregar una evidencia propia" }));
    await user.type(screen.getByLabelText(/^Evidencia propia 1/), "  Reconoce animales de su región.  ");
    // An empty own evidence doesn't go.
    await user.click(screen.getByRole("button", { name: "Agregar una evidencia propia" }));
    await user.click(screen.getByRole("button", { name: "Crear unidad" }));

    expect(createUnit).toHaveBeenCalledWith(
      expect.objectContaining({
        dba: {
          dba_id: "natural_sciences-1-3",
          evidence_ids: ["natural_sciences-1-3-3"],
          own_points: ["Reconoce animales de su región."],
        },
      }),
    );
  });

  it("a unit can have its own DBA instead", async () => {
    area = "natural_sciences";
    units = [
      {
        id: "u1",
        classroom_id: "c1",
        title: "A",
        guiding_question: "¿A?",
        order_index: 0,
        lessons: [],
      },
    ];
    updateUnit.mockResolvedValue({ id: "u1" });
    const user = userEvent.setup({ delay: null });
    renderPanel();

    // Without its DBA it says so, and the button opens its form.
    expect(screen.getByText(/Falta el DBA de la unidad/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Elegirlo" }));
    await user.selectOptions(screen.getByLabelText(/^DBA/), "own");
    await user.type(screen.getByLabelText(/^Tu DBA propio/), "Cuido los animales de mi casa.");
    // An own DBA has no evidences to tick: only the teacher's own.
    expect(screen.queryByRole("checkbox")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Agregar una evidencia propia" }));
    await user.type(screen.getByLabelText(/^Evidencia propia 1/), "Sabe qué come su mascota.");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(updateUnit).toHaveBeenCalledWith({
      unitId: "u1",
      body: expect.objectContaining({
        dba: {
          own_name: "Cuido los animales de mi casa.",
          evidence_ids: [],
          own_points: ["Sabe qué come su mascota."],
        },
      }),
    });
  });

  it("shows each unit's DBA with its points, and in humanities offers those of Lenguaje and Inglés", async () => {
    area = "humanities";
    units = [
      {
        id: "u1",
        classroom_id: "c1",
        title: "Los medios",
        guiding_question: "¿Cómo nos informamos?",
        dba: {
          own: false,
          id: "language-1-1",
          subject: "language",
          grade: 1,
          number: 1,
          name: "Los medios de comunicación",
          points: [{ evidence_id: null, text: "Compara la radio y la televisión." }],
        },
        order_index: 0,
        lessons: [],
      },
    ];
    const user = userEvent.setup({ delay: null });
    renderPanel();

    expect(screen.getByText("DBA 1 · Lenguaje · 1.°: Los medios de comunicación")).toBeTruthy();
    const points = screen.getByRole("list", { name: "Evidencias de Aprendizaje de la unidad Los medios" });
    expect(within(points).getByText("Compara la radio y la televisión.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Nueva unidad" }));
    const select = screen.getByLabelText(/^DBA/);
    expect(within(select).getByRole("option", { name: "Lenguaje · DBA 1: Los medios de comunicación" })).toBeTruthy();
    expect(
      within(select).getByRole("option", { name: "Inglés · DBA 1: Seguir instrucciones sencillas de clase" }),
    ).toBeTruthy();
  });

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
    // The unit has no goal of its own: its DBA says it.
    expect(screen.queryByLabelText(/^Desempeño esperado/)).toBeNull();
    expect(createUnit).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/^Título de la unidad/), "Las plantas");
    await user.type(screen.getByLabelText(/^Pregunta guía/), "¿Qué necesita una planta?");
    await user.click(screen.getByRole("button", { name: "Crear unidad" }));

    expect(createUnit).toHaveBeenCalledWith({
      title: "Las plantas",
      guiding_question: "¿Qué necesita una planta?",
    });
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

  it("the pencil opens the unit's form with what it has", async () => {
    units = [
      {
        id: "u1",
        classroom_id: "c1",
        title: "Los animales",
        guiding_question: "¿Dónde viven?",
        order_index: 0,
        lessons: [],
      },
    ];
    const user = userEvent.setup({ delay: null });
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Editar la unidad Los animales" }));

    expect(screen.getByRole("dialog", { name: /Editar unidad/ })).toBeTruthy();
    expect((screen.getByLabelText(/^Título de la unidad/) as HTMLInputElement).value).toBe("Los animales");
  });

  it("moves a unit and opens a lesson in the editor", async () => {
    units = [
      {
        id: "u1",
        classroom_id: "c1",
        title: "A",
        guiding_question: "¿A?",
        order_index: 0,
        lessons: [lesson],
      },
      {
        id: "u2",
        classroom_id: "c1",
        title: "B",
        guiding_question: "¿B?",
        order_index: 1,
        lessons: [],
      },
    ];
    const user = userEvent.setup({ delay: null });
    renderPanel();

    expect((screen.getByRole("button", { name: "Subir la unidad A" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Subir la unidad B" }));
    expect(reorderUnits).toHaveBeenCalledWith(["u2", "u1"], expect.anything());

    await user.click(screen.getByRole("button", { name: /^Animales terrestres/ }));
    expect(screen.getByText("Editor abierto")).toBeTruthy();
  });

  it("in an archived class only lists the units and lessons", () => {
    units = [
      {
        id: "u1",
        classroom_id: "c1",
        title: "Los animales",
        guiding_question: "¿Dónde viven?",
        order_index: 0,
        lessons: [lesson],
      },
    ];
    renderPanel(true);

    expect(screen.getByText("Animales terrestres")).toBeTruthy();
    expect(screen.getByText(/La clase está archivada/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("a new lesson needs its title, purpose and learning goal", async () => {
    units = [
      {
        id: "u1",
        classroom_id: "c1",
        title: "A",
        guiding_question: "¿A?",
        order_index: 0,
        lessons: [],
      },
    ];
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
