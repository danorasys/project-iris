import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { ClassroomWithStudents, TeacherClassroom } from "@iris/shared-types";
import { ClassroomsSection } from "./ClassroomsSection";

const createClassroom = vi.fn();
const updateClassroom = vi.fn();
const deleteClassroom = vi.fn();
const archiveClassroom = vi.fn();
const restoreClassroom = vi.fn();
const removeStudent = vi.fn();
const resolveRequest = vi.fn();

const math: TeacherClassroom = {
  id: "c1",
  teacher_id: "t1",
  name: "Matemáticas Básicas",
  description: "Sumas y restas",
  logo_file: null,
  color: "green",
  area: "mathematics",
  grade: 2,
  enrollment_code: "1234567",
  created_at: "2026-10-04T10:00:00Z",
  pending_requests: 2,
  student_count: 0,
};

const detail: ClassroomWithStudents = {
  ...math,
  students: [
    {
      enrollment_id: "e1",
      student_id: "s1",
      first_name: "Sofía",
      avatar_id: 1,
      status: "aceptada",
      guardian_name: "Ana Pérez",
      guardian_email: "ana@example.com",
      guardian_phone: "3001234567",
    },
  ],
};

let classrooms: TeacherClassroom[] = [math];
let classroomDetail: ClassroomWithStudents = detail;
const archivedAt = "2026-10-09T15:00:00Z";

vi.mock("@/shared/api/hooks/useClassroomsApi", () => ({
  useTeacherClassrooms: () => ({ data: classrooms, isLoading: false, isError: false }),
  useClassroomDetail: () => ({ data: classroomDetail, isLoading: false, isError: false }),
  useClassroomRequests: () => ({
    data: [
      {
        enrollment_id: "e2",
        student_id: "s2",
        student_first_name: "Tomás",
        student_avatar_id: 2,
        guardian_name: "Luis Gómez",
        guardian_contact: "luis@example.com · 3005556677",
        requested_at: "2026-10-04T10:00:00Z",
      },
    ],
  }),
  useCreateClassroom: () => ({ mutateAsync: createClassroom, isPending: false }),
  useUpdateClassroom: () => ({ mutateAsync: updateClassroom, isPending: false }),
  useUploadClassroomLogo: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveClassroomLogo: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteClassroom: () => ({ mutateAsync: deleteClassroom, isPending: false }),
  useArchiveClassroom: () => ({ mutateAsync: archiveClassroom, isPending: false }),
  useRestoreClassroom: () => ({ mutateAsync: restoreClassroom, isPending: false }),
  useRemoveStudent: () => ({ mutateAsync: removeStudent, isPending: false }),
  useResolveRequest: () => ({ mutateAsync: resolveRequest, isPending: false }),
}));

vi.mock("@/shared/api/hooks/useLessonsApi", () => ({
  useContentSummary: () => ({
    data: [{ classroom_id: "c1", units: 1, published_lessons: 3, draft_lessons: 1 }],
    isLoading: false,
  }),
  useClassroomUnits: () => ({ data: [], isLoading: false, isError: false }),
  useReorderUnits: () => ({ mutate: vi.fn(), isPending: false }),
  useReorderLessons: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteUnit: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// The kids' avatars come from a catalog, not needed here.
vi.mock("@/shared/ui/StudentAvatarImage", () => ({ StudentAvatarImage: () => null }));
vi.mock("@/shared/api/hooks/useNotifications", () => ({
  useClassMessages: () => ({ data: { items: [], total: 0 }, isLoading: false, isError: false }),
  useMarkNotificationRead: () => ({ mutate: vi.fn() }),
}));

function renderSection() {
  return render(
    <MemoryRouter>
      <ClassroomsSection />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  classrooms = [math];
  classroomDetail = detail;
  for (const mock of [
    createClassroom,
    updateClassroom,
    deleteClassroom,
    archiveClassroom,
    restoreClassroom,
    removeStudent,
    resolveRequest,
  ])
    mock.mockReset();
});

describe("Mis clases", { timeout: 20_000 }, () => {
  it("shows each classroom as a tile, like a kid's classes, with its students and requests", () => {
    renderSection();

    const panel = within(screen.getByRole("region", { name: "1 clase" }));
    const tiles = panel.getAllByRole("listitem");
    // "Nueva clase" goes first, then the classes.
    expect(within(tiles[0]).getByRole("button", { name: "Nueva clase" })).toBeTruthy();
    const tile = panel.getByRole("button", { name: "Matemáticas Básicas: Sin estudiantes, 2 en espera. Ver la clase" });
    expect(within(tile).getByText("MB")).toBeTruthy();
    expect(within(tile).getByText("Matemáticas · 2.°")).toBeTruthy();
    expect(within(tile).getByText("2 en espera")).toBeTruthy();
    expect(screen.getByText("2 solicitudes pendientes")).toBeTruthy();
  });

  it("finds a classroom by its name, with or without accents", async () => {
    classrooms = [math, { ...math, id: "c5", name: "Ciencias", pending_requests: 0 }];
    const user = userEvent.setup({ delay: null });
    renderSection();

    await user.type(screen.getByRole("searchbox", { name: "Buscar una de tus clases por su nombre" }), "matematicas");
    expect(screen.getByRole("button", { name: /^Matemáticas Básicas/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Ciencias/ })).toBeNull();

    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "historia");
    expect(screen.getByText("Ninguna de tus clases se llama así.")).toBeTruthy();
  });

  it("asks for the name and description before creating a classroom", async () => {
    const user = userEvent.setup({ delay: null });
    renderSection();

    await user.click(screen.getByRole("button", { name: "Nueva clase" }));
    await user.click(screen.getByRole("button", { name: "Crear clase" }));

    expect(screen.getByText("Escribe el nombre de la clase.")).toBeTruthy();
    expect(screen.getByText("Escribe una descripción de la clase.")).toBeTruthy();
    expect(screen.getByText("Elige el área de la clase.")).toBeTruthy();
    expect(screen.getByText("Elige el grado de la clase.")).toBeTruthy();
    expect(createClassroom).not.toHaveBeenCalled();
  });

  it("creates a classroom with the color picked and opens it", async () => {
    createClassroom.mockResolvedValue({ ...math, id: "c2", name: "Ciencias", color: "gold" });
    const user = userEvent.setup({ delay: null });
    renderSection();

    await user.click(screen.getByRole("button", { name: "Nueva clase" }));
    expect(document.activeElement).toBe(screen.getByLabelText(/^Nombre de la clase/));
    await user.type(screen.getByLabelText(/^Nombre de la clase/), "  Ciencias  ");
    await user.type(screen.getByLabelText(/^Descripción/), "Plantas y animales");
    await user.click(screen.getByRole("combobox", { name: /^Área/ }));
    await user.click(screen.getByRole("option", { name: "Ciencias naturales y educación ambiental" }));
    await user.click(screen.getByRole("radio", { name: "3.°" }));
    await user.click(screen.getByRole("radio", { name: "Amarillo" }));
    await user.click(screen.getByRole("button", { name: "Crear clase" }));

    expect(createClassroom).toHaveBeenCalledWith({
      name: "Ciencias",
      description: "Plantas y animales",
      color: "gold",
      area: "natural_sciences",
      area_other: null,
      grade: 3,
    });
    expect(await screen.findByText("La clase se creó.")).toBeTruthy();
    // It opens the new classroom's space.
    expect(screen.getByRole("button", { name: "Regresar a mis clases" })).toBeTruthy();
  });

  it("keeps the color of the class apart from the avatar, also with an own image", async () => {
    const user = userEvent.setup({ delay: null });
    renderSection();

    await user.click(screen.getByRole("button", { name: "Nueva clase" }));
    const colors = screen.getByRole("radiogroup", { name: "Color de la clase" });
    await user.click(screen.getByRole("radio", { name: "Imagen propia" }));

    // The band of the card still takes the color, so it can still be picked.
    expect(within(colors).getByRole("radio", { name: "Verde" })).toBeTruthy();
    await user.click(within(colors).getByRole("radio", { name: "Verde" }));
    expect(within(colors).getByRole("radio", { name: "Verde" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Pinta la franja de arriba de la tarjeta de la clase.")).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Avatar" })).toBeTruthy();
  });

  it("shows the card of the new class while it's filled in, and the X closes it", async () => {
    const user = userEvent.setup({ delay: null });
    renderSection();

    await user.click(screen.getByRole("button", { name: "Nueva clase" }));
    const preview = screen.getByRole("complementary", { name: "Vista previa" });
    expect(within(preview).getByText("Nombre de la clase")).toBeTruthy();

    await user.type(screen.getByLabelText(/^Nombre de la clase/), "Ciencias Naturales");
    expect(within(preview).getByText("Ciencias Naturales")).toBeTruthy();
    expect(within(preview).getByText("CN")).toBeTruthy();
    expect(screen.getByText("18/120")).toBeTruthy();

    await user.click(screen.getByRole("radio", { name: "Verde" }));
    expect(screen.getByText("Verde", { selector: "p" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(createClassroom).not.toHaveBeenCalled();
  });

  it("with Otra as area asks which area it is", async () => {
    createClassroom.mockResolvedValue({ ...math, id: "c3", area: "other", area_other: "Música" });
    const user = userEvent.setup({ delay: null });
    renderSection();

    await user.click(screen.getByRole("button", { name: "Nueva clase" }));
    await user.type(screen.getByLabelText(/^Nombre de la clase/), "Coro");
    await user.type(screen.getByLabelText(/^Descripción/), "Canciones");
    await user.click(screen.getByRole("combobox", { name: /^Área/ }));
    await user.click(screen.getByRole("option", { name: "Otra" }));
    await user.click(screen.getByRole("radio", { name: "2.°" }));
    await user.click(screen.getByRole("button", { name: "Crear clase" }));

    expect(screen.getByText("Escribe cuál es el área de la clase.")).toBeTruthy();
    expect(createClassroom).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/^¿Cuál área\?/), "Música");
    const preview = screen.getByRole("complementary", { name: "Vista previa" });
    expect(within(preview).getByText("Música · 2.°")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Crear clase" }));

    expect(createClassroom).toHaveBeenCalledWith(
      expect.objectContaining({ area: "other", area_other: "Música", grade: 2 }),
    );
  });

  it("opens a classroom with its options, like a kid's space, and goes back", async () => {
    const user = userEvent.setup({ delay: null });
    renderSection();

    await user.click(screen.getByRole("button", { name: /Matemáticas Básicas/ }));

    for (const option of ["Miembros", "Unidades y lecciones", "Mensajes", "Estadísticas"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${option}`) })).toBeTruthy();
    }
    expect(screen.getByText("Código de ingreso: 1234567")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /^Mensajes/ }));
    expect(screen.getByText("Mensajes de la clase")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Regresar a la clase" }));
    await user.click(screen.getByRole("button", { name: "Regresar a mis clases" }));
    expect(screen.getByRole("button", { name: "Nueva clase" })).toBeTruthy();
  });

  it("archives an active classroom after confirming, instead of deleting it", async () => {
    archiveClassroom.mockResolvedValue({ ...math, archived_at: archivedAt });
    const user = userEvent.setup({ delay: null });
    renderSection();

    await user.click(screen.getByRole("button", { name: /Matemáticas Básicas/ }));
    expect(screen.queryByRole("button", { name: "Eliminar" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Archivar" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/se cerrarán las 2 solicitudes que esperan respuesta/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(archiveClassroom).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Archivar" }));
    await user.click(screen.getByRole("button", { name: "Sí, archivar la clase" }));

    expect(archiveClassroom).toHaveBeenCalledWith("c1");
    expect(await screen.findByText('La clase "Matemáticas Básicas" se archivó.')).toBeTruthy();
  });

  it("shows an archived classroom only for reading, to restore or delete it", async () => {
    classroomDetail = { ...detail, archived_at: archivedAt };
    deleteClassroom.mockResolvedValue(undefined);
    restoreClassroom.mockResolvedValue({ ...math, archived_at: null });
    const user = userEvent.setup({ delay: null });
    renderSection();

    await user.click(screen.getByRole("button", { name: /Matemáticas Básicas/ }));
    expect(screen.getByText(/Archivaste esta clase el/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Mensajes/ })).toBeNull();
    expect(screen.queryByText(/Código de ingreso/)).toBeNull();

    // Its members are only listed.
    await user.click(screen.getByRole("button", { name: /^Miembros/ }));
    expect(screen.getByText("Sofía")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retirar a Sofía de la clase" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Regresar a la clase" }));

    await user.click(screen.getByRole("button", { name: "Restaurar" }));
    expect(restoreClassroom).toHaveBeenCalledWith("c1");
    expect(await screen.findByText('La clase "Matemáticas Básicas" volvió a tus clases.')).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/su estudiante perderá su progreso/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Sí, eliminar la clase" }));

    expect(deleteClassroom).toHaveBeenCalledWith("c1");
    expect(await screen.findByText('La clase "Matemáticas Básicas" se eliminó.')).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nueva clase" })).toBeTruthy();
  });

  it("puts the archived classrooms after the active ones, faded and tagged", () => {
    classrooms = [
      { ...math, id: "c9", name: "Arte 2023", pending_requests: 0, archived_at: archivedAt },
      math,
    ];
    renderSection();

    const panel = within(screen.getByRole("region", { name: "1 clase · 1 archivada" }));
    const names = panel.getAllByRole("button").map((tile) => tile.getAttribute("aria-label") ?? tile.textContent);
    expect(names[0]).toBe("Nueva clase");
    expect(names[1]).toMatch(/^Matemáticas Básicas/);
    expect(names[2]).toMatch(/^Arte 2023, archivada/);
    const archived = panel.getByRole("button", { name: /^Arte 2023/ });
    expect(within(archived).getByText("Archivada")).toBeTruthy();
  });

  it("edits a classroom from its space", async () => {
    updateClassroom.mockResolvedValue({ ...math, name: "Matemáticas 1" });
    const user = userEvent.setup({ delay: null });
    renderSection();

    await user.click(screen.getByRole("button", { name: /Matemáticas Básicas/ }));
    await user.click(screen.getByRole("button", { name: "Editar" }));
    const name = screen.getByLabelText(/^Nombre de la clase/);
    await user.clear(name);
    await user.type(name, "Matemáticas 1");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(updateClassroom).toHaveBeenCalledWith({
      classroomId: "c1",
      // The area and grade it already had stay as they were.
      body: {
        name: "Matemáticas 1",
        description: "Sumas y restas",
        color: "green",
        area: "mathematics",
        area_other: null,
        grade: 2,
      },
    });
    expect(await screen.findByText("Los cambios de la clase se guardaron.")).toBeTruthy();
  });

  it("shows the members with their guardian and takes one out after confirming", async () => {
    removeStudent.mockResolvedValue(undefined);
    const user = userEvent.setup({ delay: null });
    renderSection();

    await user.click(screen.getByRole("button", { name: /Matemáticas Básicas/ }));
    await user.click(screen.getByRole("button", { name: /^Miembros/ }));

    expect(screen.getByText("Ana Pérez")).toBeTruthy();
    expect(screen.getByText(/ana@example.com/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Retirar a Sofía de la clase" }));
    expect(screen.getByText(/Su tutor recibirá una notificación/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Sí, retirar" }));

    expect(removeStudent).toHaveBeenCalledWith({ classroomId: "c1", enrollmentId: "e1" });
    expect(await screen.findByText("Sofía salió de la clase. Le avisamos a su familia.")).toBeTruthy();
  });

  it("accepts a waiting request from the members", async () => {
    resolveRequest.mockResolvedValue({ enrollment_id: "e2", status: "aceptada" });
    const user = userEvent.setup({ delay: null });
    renderSection();

    await user.click(screen.getByRole("button", { name: /Matemáticas Básicas/ }));
    await user.click(screen.getByRole("button", { name: /^Miembros/ }));
    await user.click(screen.getByRole("button", { name: "Aceptar" }));

    expect(resolveRequest).toHaveBeenCalledWith({ classroomId: "c1", enrollmentId: "e2", decision: "aceptar" });
    expect(await screen.findByText("Tomás ya es parte de la clase.")).toBeTruthy();
  });

  it("without classrooms shows the steps to start, like a kid without classes", () => {
    classrooms = [];
    renderSection();

    const steps = within(screen.getByRole("region", { name: "Todavía no tienes clases" }));
    expect(steps.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Nueva clase" })).toBeTruthy();
  });
});
