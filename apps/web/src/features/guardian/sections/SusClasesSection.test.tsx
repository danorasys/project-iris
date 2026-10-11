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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
    // With a class, the steps to join the first one aren't needed.
    expect(screen.queryByRole("region", { name: /aún no está en ninguna clase/ })).toBeNull();
  });

  it("without classes says how to join the first one, step by step", () => {
    classes = [classOf("Ciencias", { status: "pendiente" })];
    renderClasses();

    const box = screen.getByRole("region", { name: /aún no está en ninguna clase/ });
    expect(
      within(box)
        .getAllByRole("listitem")
        .map((step) => step.textContent),
    ).toEqual([
      "Pídele al docente el código de ingreso de su clase.",
      'Toca "Agregar clase" y escribe el código.',
      "Cuando el docente acepte la solicitud, la clase aparecerá aquí.",
    ]);
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

    const pager = screen.getByRole("navigation", { name: "Páginas de clases" });
    await userEvent.click(within(pager).getByRole("button", { name: "Página 2" }));

    expect(screen.getByRole("button", { name: /^Clase 8,/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Clase 9,/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Agregar clase" })).toBeNull();
  });

  it("fills the last row on wide screens: six columns give twelve tiles", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    const realStyle = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((el) =>
      el.tagName === "UL"
        ? ({ gridTemplateColumns: "150px 150px 150px 150px 150px 150px" } as CSSStyleDeclaration)
        : realStyle(el),
    );
    classes = Array.from({ length: 13 }, (_, i) => classOf(`Clase ${i + 1}`));
    renderClasses();

    expect(screen.getByRole("button", { name: /^Clase 11,/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Clase 12,/ })).toBeNull();
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

  it("pages the requests five at a time", async () => {
    classes = Array.from({ length: 12 }, (_, i) => classOf(`Clase ${i + 1}`));
    renderClasses();

    const requests = screen.getByRole("heading", { name: "Solicitudes enviadas" }).closest("section") as HTMLElement;
    const names = () =>
      within(requests)
        .getAllByText(/^Clase \d+$/)
        .map((n) => n.textContent);
    expect(names()).toEqual(["Clase 1", "Clase 2", "Clase 3", "Clase 4", "Clase 5"]);

    const pager = screen.getByRole("navigation", { name: "Páginas de solicitudes" });
    await userEvent.click(within(pager).getByRole("button", { name: "Página 3" }));
    expect(names()).toEqual(["Clase 11", "Clase 12"]);
  });

  it("filters the requests by state, with how many each one has", async () => {
    classes = [
      classOf("Ciencias", { status: "pendiente", resolved_at: null }),
      classOf("Matemáticas"),
      classOf("Arte"),
      ...Array.from({ length: 6 }, (_, i) => classOf(`Clase ${i + 1}`, { status: "rechazada" })),
    ];
    renderClasses();

    const filters = screen.getByRole("group", { name: "Ver las solicitudes por estado" });
    expect(within(filters).getByRole("button", { name: "Todas 9" }).getAttribute("aria-pressed")).toBe("true");

    await userEvent.click(within(filters).getByRole("button", { name: "Aceptadas 2" }));
    const requests = screen.getByRole("heading", { name: "Solicitudes enviadas" }).closest("section") as HTMLElement;
    expect(within(requests).getAllByRole("button", { name: "Ver clase" })).toHaveLength(2);
    expect(within(requests).queryByText("Ciencias")).toBeNull();

    // Changing the filter goes back to its first page.
    await userEvent.click(within(filters).getByRole("button", { name: "No aceptadas 6" }));
    const pager = screen.getByRole("navigation", { name: "Páginas de solicitudes" });
    await userEvent.click(within(pager).getByRole("button", { name: "Página 2" }));
    await userEvent.click(within(filters).getByRole("button", { name: "Esperando respuesta 1" }));
    expect(within(requests).getByText("Ciencias")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Páginas de solicitudes" })).toBeNull();
  });

  it("can't pick a state with no requests", () => {
    classes = [classOf("Matemáticas")];
    renderClasses();

    const filters = screen.getByRole("group", { name: "Ver las solicitudes por estado" });
    expect((within(filters).getByRole("button", { name: "No aceptadas 0" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("marks a class its teacher archived, in its tile and in its request", () => {
    classes = [classOf("Arte", { archived_at: "2026-10-09T15:00:00Z" }), classOf("Matemáticas")];
    renderClasses();

    expect(screen.getByRole("button", { name: "Arte, con Laura Gómez, archivada. Ver la clase" })).toBeTruthy();
    // Counted apart, like the kid's header that leaves it out.
    expect(screen.getByRole("heading", { name: "1 clase · 1 archivada" })).toBeTruthy();
    const requests = screen.getByRole("heading", { name: "Solicitudes enviadas" }).closest("section") as HTMLElement;
    expect(within(requests).getByText("Clase archivada")).toBeTruthy();
  });

  it("cancels a request still waiting and clears a rejected one, both after confirming", async () => {
    classes = [classOf("Ciencias", { status: "pendiente" }), classOf("Arte", { status: "rechazada" })];
    leave.mockResolvedValue(undefined);
    renderClasses();

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    const dialog = screen.getByRole("dialog", { name: "Cancelar la solicitud" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancelar solicitud" }));

    // Going back from the dialog keeps the rejected one.
    await userEvent.click(screen.getByRole("button", { name: 'Quitar "Arte" de la lista' }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Quitar la solicitud" })).getByRole("button", { name: "Volver" }),
    );
    expect(leave.mock.calls).toEqual([["e-Ciencias"]]);

    await userEvent.click(screen.getByRole("button", { name: 'Quitar "Arte" de la lista' }));
    const remove = screen.getByRole("dialog", { name: "Quitar la solicitud" });
    expect(within(remove).getByText(/El docente no recibirá ningún aviso/)).toBeTruthy();
    await userEvent.click(within(remove).getByRole("button", { name: "Quitar solicitud" }));

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
