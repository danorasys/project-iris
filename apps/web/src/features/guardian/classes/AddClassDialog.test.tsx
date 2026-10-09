import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ClassroomPreview } from "@iris/shared-types";
import { ApiError } from "@/shared/api/httpClient";
import { AddClassDialog } from "./AddClassDialog";

const lookup = vi.fn();
const request = vi.fn();

vi.mock("@/shared/api/hooks/useClassroomsApi", () => ({
  useClassroomLookup: () => ({ mutateAsync: lookup, isPending: false }),
  useRequestEnrollment: () => ({ mutateAsync: request, isPending: false }),
}));

const preview: ClassroomPreview = {
  classroom_id: "c1",
  name: "Matemáticas",
  description: "Sumas y restas jugando a la tienda.",
  logo_file: null,
  color: "green",
  area: "mathematics",
  area_other: null,
  grade: 2,
  published_lessons: 4,
  published_units: 2,
  teacher: {
    first_name: "Laura",
    last_name: "Gómez",
    institution: "Colegio Nacional",
    about: "Docente de primaria hace 8 años.",
    studies: [
      { level: "professional", title: "Licenciatura", institution: "UPB", end_month: "2015-11", in_progress: false },
    ],
    experiences: [],
  },
};

const onClose = vi.fn();
const onSent = vi.fn();

function renderDialog() {
  return render(<AddClassDialog studentId="s1" firstName="Sofía" onClose={onClose} onSent={onSent} />);
}

const codeBox = () => screen.getByRole("textbox", { name: "Código de la clase" });

afterEach(() => {
  cleanup();
  lookup.mockReset();
  request.mockReset();
  onClose.mockReset();
  onSent.mockReset();
});

describe("AddClassDialog", () => {
  it("keeps 'Buscar' off until the code has 8 characters with letters, numbers and symbols", async () => {
    renderDialog();
    const search = screen.getByRole("button", { name: "Buscar clase" });

    expect(screen.getByRole("dialog", { name: "Agregar una clase para Sofía" })).toBeTruthy();
    expect(screen.queryByText("Símbolos como # $ %")).toBeNull();
    await userEvent.type(codeBox(), "abcd2345");
    expect(search).toHaveProperty("disabled", true);

    await userEvent.clear(codeBox());
    await userEvent.type(codeBox(), "k7#mp2$x");
    expect(search).toHaveProperty("disabled", false);
  });

  it("says when no class has that code", async () => {
    lookup.mockRejectedValue(
      new ApiError(404, "codigo_ingreso_invalido", "Ese código no corresponde a ninguna clase de IRIS."),
    );
    renderDialog();

    await userEvent.type(codeBox(), "ZZ9#ZZ9%");
    await userEvent.click(screen.getByRole("button", { name: "Buscar clase" }));

    expect(lookup).toHaveBeenCalledWith("ZZ9#ZZ9%");
    expect(screen.getByRole("alert").textContent).toBe("Ese código no corresponde a ninguna clase de IRIS.");
  });

  it("shows the class and, on demand, its teacher's profile with who declared it", async () => {
    lookup.mockResolvedValue(preview);
    renderDialog();

    await userEvent.type(codeBox(), " k7#mp2$x");
    await userEvent.click(screen.getByRole("button", { name: "Buscar clase" }));

    expect(lookup).toHaveBeenCalledWith("K7#MP2$X");
    expect(screen.getByText("Matemáticas")).toBeTruthy();
    expect(screen.getByText("Con Laura Gómez")).toBeTruthy();
    expect(screen.getByText("2 unidades · 4 lecciones")).toBeTruthy();
    expect(screen.getByText("Sumas y restas jugando a la tienda.")).toBeTruthy();
    expect(screen.queryByText("Docente de primaria hace 8 años.")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /Ver el perfil del docente/ }));

    expect(screen.getByText("Docente de primaria hace 8 años.")).toBeTruthy();
    expect(screen.getByText("Colegio Nacional")).toBeTruthy();
    expect(screen.getByText("Esta información la escribió el docente en su perfil.")).toBeTruthy();

    // Folding it back (at once here, the tests have no animations).
    await userEvent.click(screen.getByRole("button", { name: /Ocultar el perfil del docente/ }));
    expect(screen.queryByText("Docente de primaria hace 8 años.")).toBeNull();
    expect(screen.getByRole("button", { name: /Ver el perfil del docente/ }).getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  it("sends the request for the kid after the last question", async () => {
    lookup.mockResolvedValue(preview);
    request.mockResolvedValue({ enrollment_id: "e1", classroom_id: "c1", status: "pendiente" });
    renderDialog();

    await userEvent.type(codeBox(), "k7#mp2$x");
    await userEvent.click(screen.getByRole("button", { name: "Buscar clase" }));
    expect(screen.getByText(/se una a esta clase\?/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));

    expect(request).toHaveBeenCalledWith({ studentId: "s1", enrollmentCode: "K7#MP2$X" });
    expect(onSent).toHaveBeenCalledWith("Matemáticas");
  });

  it("doesn't let the same request go twice", async () => {
    lookup.mockResolvedValue(preview);
    request.mockRejectedValue(
      new ApiError(409, "ya_inscrito_o_pendiente", "Ya existe una inscripción pendiente o aceptada para esta aula."),
    );
    renderDialog();

    await userEvent.type(codeBox(), "k7#mp2$x");
    await userEvent.click(screen.getByRole("button", { name: "Buscar clase" }));
    await userEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));

    expect(screen.getByRole("alert").textContent).toContain("Ya existe una inscripción");
    expect(onSent).not.toHaveBeenCalled();
  });

  it("goes back to type another code, and Esc closes it", async () => {
    lookup.mockResolvedValue(preview);
    renderDialog();

    await userEvent.type(codeBox(), "k7#mp2$x");
    await userEvent.click(screen.getByRole("button", { name: "Buscar clase" }));
    await userEvent.click(screen.getByRole("button", { name: "Usar otro código" }));
    expect(codeBox()).toHaveProperty("value", "");

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
