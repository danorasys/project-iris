import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { ClassroomWithStudents, TeacherClassroom } from "@iris/shared-types";
import { ClassroomsSection } from "./ClassroomsSection";

const createClassroom = vi.fn();
const updateClassroom = vi.fn();
const deleteClassroom = vi.fn();
const removeStudent = vi.fn();
const resolveRequest = vi.fn();

const math: TeacherClassroom = {
  id: "c1",
  teacher_id: "t1",
  name: "Matemáticas Básicas",
  description: "Sumas y restas",
  logo_file: null,
  color: "green",
  enrollment_code: "1234567",
  created_at: "2026-10-04T10:00:00Z",
  pending_requests: 2,
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

vi.mock("@/shared/api/hooks/useClassroomsApi", () => ({
  useTeacherClassrooms: () => ({ data: classrooms, isLoading: false, isError: false }),
  useClassroomDetail: () => ({ data: detail, isLoading: false, isError: false }),
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
  useRemoveStudent: () => ({ mutateAsync: removeStudent, isPending: false }),
  useResolveRequest: () => ({ mutateAsync: resolveRequest, isPending: false }),
}));

vi.mock("@/shared/api/hooks/useLessonsApi", () => ({
  useClassroomLessons: () => ({ data: [], isLoading: false, isError: false }),
}));

// The kids' avatars come from a catalog, not needed here.
vi.mock("@/shared/ui/StudentAvatarImage", () => ({ StudentAvatarImage: () => null }));

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
  for (const mock of [createClassroom, updateClassroom, deleteClassroom, removeStudent, resolveRequest]) mock.mockReset();
});

describe("Mis clases", { timeout: 20_000 }, () => {
  it("shows each classroom with its initials and its pending requests", () => {
    renderSection();

    const card = screen.getByRole("button", { name: /Matemáticas Básicas/ });
    expect(within(card).getByText("MB")).toBeTruthy();
    expect(within(card).getByText("2")).toBeTruthy();
    expect(screen.getByText("2 solicitudes pendientes")).toBeTruthy();
  });

  it("asks for the name and description before creating a classroom", async () => {
    const user = userEvent.setup({ delay: null });
    renderSection();

    await user.click(screen.getByRole("button", { name: "Nueva clase" }));
    await user.click(screen.getByRole("button", { name: "Crear clase" }));

    expect(screen.getByText("Escribe el nombre de la clase.")).toBeTruthy();
    expect(screen.getByText("Escribe una descripción de la clase.")).toBeTruthy();
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
    await user.click(screen.getByRole("radio", { name: "Amarillo" }));
    await user.click(screen.getByRole("button", { name: "Crear clase" }));

    expect(createClassroom).toHaveBeenCalledWith({ name: "Ciencias", description: "Plantas y animales", color: "gold" });
    expect(await screen.findByText("La clase se creó.")).toBeTruthy();
    // It opens the new classroom's space.
    expect(screen.getByRole("button", { name: "Regresar a mis clases" })).toBeTruthy();
  });

  it("opens a classroom with its options and goes back", async () => {
    const user = userEvent.setup({ delay: null });
    renderSection();

    await user.click(screen.getByRole("button", { name: /Matemáticas Básicas/ }));

    for (const option of ["Miembros", "Lecciones", "Mensajes", "Estadísticas"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${option}`) })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: "Regresar Volver a mis clases" })).toBeTruthy();
    expect(screen.getByText("Código de ingreso: 1234567")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Regresar a mis clases" }));
    expect(screen.getByRole("button", { name: "Nueva clase" })).toBeTruthy();
  });

  it("deletes a classroom only after confirming, warning about its lessons", async () => {
    deleteClassroom.mockResolvedValue(undefined);
    const user = userEvent.setup({ delay: null });
    renderSection();

    await user.click(screen.getByRole("button", { name: /Matemáticas Básicas/ }));
    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/También se eliminarán sus lecciones y las inscripciones/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(deleteClassroom).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    await user.click(screen.getByRole("button", { name: "Sí, eliminar la clase" }));

    expect(deleteClassroom).toHaveBeenCalledWith("c1");
    expect(await screen.findByText('La clase "Matemáticas Básicas" se eliminó.')).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nueva clase" })).toBeTruthy();
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
      body: { name: "Matemáticas 1", description: "Sumas y restas", color: "green" },
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

  it("says plainly when there are no classrooms yet", () => {
    classrooms = [];
    renderSection();

    expect(screen.getByText("Todavía no tienes clases")).toBeTruthy();
  });
});
