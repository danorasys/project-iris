import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { FamilyClassroom } from "@iris/shared-types";
import { ApiError } from "@/shared/api/httpClient";
import { SusClasesSection } from "./SusClasesSection";

function classOf(name: string, extra: Partial<FamilyClassroom> = {}): FamilyClassroom {
  return {
    enrollment_id: `e-${name}`,
    student_id: "s1",
    student_first_name: "Sofía",
    status: "aceptada",
    requested_at: "2026-10-04T10:00:00Z",
    resolved_at: "2026-10-04T12:00:00Z",
    classroom_id: `c-${name}`,
    name,
    description: "d",
    logo_file: null,
    color: "green",
    area: "mathematics",
    grade: 2,
    area_other: null,
    teacher_name: "Laura Gómez",
    published_lessons: 3,
    published_units: 1,
    ...extra,
  };
}

let classes: FamilyClassroom[] = [];
let familyError: unknown = null;
const leave = vi.fn();

vi.mock("@/shared/api/hooks/useClassroomsApi", () => ({
  useFamilyClassrooms: () => ({ data: classes, isLoading: false, isError: Boolean(familyError), error: familyError }),
  useLeaveClassroom: () => ({ mutateAsync: leave, isPending: false }),
}));
// The window and the space of a class have their own tests.
vi.mock("../classes/AddClassDialog", () => ({
  AddClassDialog: ({ firstName }: { firstName: string }) => <p>Ventana para agregar una clase a {firstName}</p>,
}));
vi.mock("../classes/ClassSpace", () => ({
  ClassSpace: ({ enrollmentId }: { enrollmentId: string }) => <p>Espacio de {enrollmentId}</p>,
}));

const onOpen = vi.fn();

function renderClasses(openId: string | null = null) {
  return render(
    <MemoryRouter initialEntries={["/guardian/portal"]}>
      <Routes>
        <Route
          path="/guardian/portal"
          element={
            <SusClasesSection
              studentId="s1"
              firstName="Sofía"
              openId={openId}
              option={null}
              onOpen={onOpen}
              onOption={vi.fn()}
            />
          }
        />
        <Route path="/guardian/verify-2fa" element={<p>Pantalla del código</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

// The tiles in order, by the name a screen reader says.
function tileNames() {
  const grid = screen.getByRole("heading", { name: /clases?$/ }).closest("section") as HTMLElement;
  const tiles = within(grid).getAllByRole("list")[0];
  return within(tiles)
    .getAllByRole("button")
    .map((b) => b.getAttribute("aria-label") ?? b.textContent);
}

afterEach(() => {
  cleanup();
  classes = [];
  familyError = null;
  leave.mockReset();
  onOpen.mockReset();
});

describe("SusClasesSection", () => {
  it("shows the classes as tiles with 'Agregar clase' first, only the ones the kid is in", () => {
    classes = [
      classOf("Matemáticas"),
      classOf("Ciencias", { status: "pendiente" }),
      classOf("Arte", { status: "rechazada" }),
      classOf("Lenguaje", { student_id: "s2" }),
    ];
    renderClasses();

    expect(tileNames()).toEqual(["Agregar clase", "Matemáticas, con Laura Gómez. Ver la clase"]);
    expect(screen.getByRole("heading", { name: "1 clase" })).toBeTruthy();
  });

  it("opens the window to add a class, and a class's space", async () => {
    classes = [classOf("Matemáticas")];
    renderClasses();

    await userEvent.click(screen.getByRole("button", { name: "Agregar clase" }));
    await userEvent.click(screen.getByRole("button", { name: "Matemáticas, con Laura Gómez. Ver la clase" }));

    expect(screen.getByText("Ventana para agregar una clase a Sofía")).toBeTruthy();
    expect(onOpen).toHaveBeenCalledWith("e-Matemáticas");
  });

  it("filters the tiles by name while typing, with or without accents", async () => {
    classes = [classOf("Matemáticas"), classOf("Ciencias naturales"), classOf("Arte")];
    renderClasses();

    await userEvent.type(screen.getByRole("searchbox", { name: "Buscar una clase por su nombre" }), "matematicas");

    expect(screen.getByRole("button", { name: /^Matemáticas/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Arte/ })).toBeNull();
    // Adding stays first, even while searching.
    expect(screen.getByRole("button", { name: "Agregar clase" })).toBeTruthy();

    await userEvent.type(screen.getByRole("searchbox", { name: "Buscar una clase por su nombre" }), "zzz");
    expect(screen.getByText("Ninguna clase de Sofía se llama así.")).toBeTruthy();
  });

  it("pages the tiles eight at a time", async () => {
    classes = Array.from({ length: 9 }, (_, i) => classOf(`Clase ${i + 1}`));
    renderClasses();

    expect(screen.getByRole("button", { name: /^Clase 7,/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Clase 8,/ })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Página 2" }));

    expect(screen.getByRole("button", { name: /^Clase 8,/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Clase 9,/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Agregar clase" })).toBeNull();
  });

  it("lists every request with how it went", () => {
    classes = [
      classOf("Ciencias", { status: "pendiente", resolved_at: null }),
      classOf("Matemáticas"),
      classOf("Arte", { status: "rechazada" }),
    ];
    renderClasses();

    const requests = screen.getByRole("heading", { name: "Solicitudes enviadas" }).closest("section") as HTMLElement;
    const rows = within(requests).getAllByRole("listitem");
    expect(rows.map((row) => within(row).getByText(/Esperando respuesta|Aceptada|No aceptada/).textContent)).toEqual([
      "Esperando respuesta",
      "Aceptada",
      "No aceptada",
    ]);
  });

  it("cancels a request still waiting after confirming, and clears a rejected one", async () => {
    classes = [classOf("Ciencias", { status: "pendiente" }), classOf("Arte", { status: "rechazada" })];
    leave.mockResolvedValue(undefined);
    renderClasses();

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    const dialog = screen.getByRole("dialog", { name: "Cancelar la solicitud" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancelar solicitud" }));
    await userEvent.click(screen.getByRole("button", { name: 'Quitar "Arte" de la lista' }));

    expect(leave.mock.calls).toEqual([["e-Ciencias"], ["e-Arte"]]);
  });

  it("shows the class's space when one is open", () => {
    classes = [classOf("Matemáticas")];
    renderClasses("e-Matemáticas");

    expect(screen.getByText("Espacio de e-Matemáticas")).toBeTruthy();
  });

  it("goes to the code screen when the portal asks for it", () => {
    familyError = new ApiError(403, "acceso_portal_requerido", "Confirma tu código");
    renderClasses();

    expect(screen.getByText("Pantalla del código")).toBeTruthy();
  });
});
