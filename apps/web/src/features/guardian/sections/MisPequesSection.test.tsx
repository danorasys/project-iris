import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FamilyClassroom } from "@iris/shared-types";
import { MisPequesSection } from "./MisPequesSection";

// A birth date that many whole years ago, so the age doesn't depend on today.
function bornYearsAgo(years: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const sofia = { id: "s1", first_name: "Sofía", avatar_id: 1, date_of_birth: bornYearsAgo(7) };
const mateo = { id: "s2", first_name: "Mateo", avatar_id: 2, date_of_birth: bornYearsAgo(1) };

const studentsQuery = vi.fn();
const addStudent = vi.fn();
// The family's classes; undefined while they haven't arrived.
let familyClasses: FamilyClassroom[] | undefined;

// "Sus clases" and "Sus datos" have their own tests, here it only matters
// that they open, and that a class and its options can be opened inside.
vi.mock("./SusClasesSection", () => ({
  SusClasesSection: ({
    firstName,
    openId,
    option,
    onOpen,
    onOption,
  }: {
    firstName: string;
    openId: string | null;
    option: string | null;
    onOpen: (id: string) => void;
    onOption: (option: string) => void;
  }) => (
    <div>
      <p>Sus clases de {firstName}</p>
      {openId && <p>clase {openId}</p>}
      {option && <p>opción {option}</p>}
      <button type="button" onClick={() => onOpen("Matemáticas")}>
        abrir la clase
      </button>
      <button type="button" onClick={() => onOption("contacto")}>
        abrir contacto
      </button>
    </div>
  ),
}));
vi.mock("./SusDatosSection", () => ({
  SusDatosSection: ({ studentId }: { studentId: string }) => <p>datos de {studentId}</p>,
}));

vi.mock("@/shared/api/hooks/useClassroomsApi", () => ({
  useFamilyClassrooms: () => ({ data: familyClasses }),
}));

vi.mock("@/shared/api/hooks/useAuthApi", () => ({
  useEstudiantesDeTutor: () => studentsQuery(),
  useEstudianteDeTutor: () => ({ data: { first_name: "Sofía", last_name: "Pérez" } }),
  useAvatars: () => ({
    data: [
      { id: 1, name: "Violeta", accent_color: "#804890" },
      { id: 2, name: "Coral", accent_color: "#c06048" },
    ],
  }),
  useSupportConditions: () => ({ data: [{ id: 7, name: "Prefiero no especificar" }] }),
  useAddStudent: () => ({ mutateAsync: addStudent, isPending: false }),
}));

afterEach(() => {
  cleanup();
  studentsQuery.mockReset();
  addStudent.mockReset();
  familyClasses = undefined;
});

describe("MisPequesSection", () => {
  it("shows one card per kid with their age and how many there are", () => {
    studentsQuery.mockReturnValue({ data: [sofia, mateo], isLoading: false, isError: false });

    render(<MisPequesSection onDirtyChange={vi.fn()} />);

    expect(screen.getByText("2 perfiles")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sofía, 7 años. Ver su espacio" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mateo, 1 año. Ver su espacio" })).toBeTruthy();
  });

  it("adds how many classes each kid has and the requests still waiting", () => {
    studentsQuery.mockReturnValue({ data: [sofia, mateo], isLoading: false, isError: false });
    const classOf = (status: FamilyClassroom["status"], name: string) =>
      ({ student_id: "s1", status, name, enrollment_id: name }) as FamilyClassroom;
    familyClasses = [classOf("aceptada", "Matemáticas"), classOf("aceptada", "Arte"), classOf("pendiente", "Ciencias")];

    render(<MisPequesSection onDirtyChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Sofía, 7 años, 2 clases. Ver su espacio" })).toBeTruthy();
    expect(screen.getByText("7 años · 2 clases")).toBeTruthy();
    expect(screen.getByText("1 solicitud")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mateo, 1 año, sin clases. Ver su espacio" })).toBeTruthy();
  });

  it("doesn't count a rejected request as waiting", () => {
    studentsQuery.mockReturnValue({ data: [sofia], isLoading: false, isError: false });
    familyClasses = [{ student_id: "s1", status: "rechazada", name: "Arte", enrollment_id: "a" } as FamilyClassroom];

    render(<MisPequesSection onDirtyChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Sofía, 7 años, sin clases. Ver su espacio" })).toBeTruthy();
    expect(screen.queryByText("1 solicitud")).toBeNull();
  });

  it("the back button walks out of a class one step at a time", async () => {
    studentsQuery.mockReturnValue({ data: [sofia], isLoading: false, isError: false });
    familyClasses = [
      { student_id: "s1", status: "aceptada", name: "Matemáticas", enrollment_id: "Matemáticas" } as FamilyClassroom,
    ];
    const user = userEvent.setup();
    render(<MisPequesSection onDirtyChange={vi.fn()} initialStudentId="s1" initialOption="clases" />);

    await user.click(screen.getByRole("button", { name: "abrir la clase" }));
    await user.click(screen.getByRole("button", { name: "abrir contacto" }));
    expect(screen.getByText("opción contacto")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Regresar a Matemáticas" }));
    expect(screen.queryByText("opción contacto")).toBeNull();
    expect(screen.getByText("clase Matemáticas")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Regresar a sus clases" }));
    expect(screen.queryByText("clase Matemáticas")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Regresar al espacio de Sofía" }));
    expect(screen.queryByText("Sus clases de Sofía")).toBeNull();
  });

  it("puts the button to add a kid on top, with the headings", () => {
    studentsQuery.mockReturnValue({ data: [sofia], isLoading: false, isError: false });

    render(<MisPequesSection onDirtyChange={vi.fn()} />);

    const rows = screen.getAllByRole("listitem");
    const add = screen.getByRole("button", { name: "Agregar estudiante" });
    // In the first row, the one of the headings.
    expect(rows[0].contains(add)).toBe(true);
    expect(add.getAttribute("aria-disabled")).toBeNull();
  });

  it("adds a kid with only their data and opens their space (HU-50)", async () => {
    studentsQuery.mockReturnValue({ data: [sofia, mateo], isLoading: false, isError: false });
    addStudent.mockResolvedValue(mateo);
    const user = userEvent.setup();
    render(<MisPequesSection onDirtyChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Agregar estudiante" }));
    expect(screen.getByRole("heading", { name: "Agregar un peque" })).toBeTruthy();
    // Nothing of the guardian is asked again.
    expect(screen.queryByLabelText(/correo/i)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Agregar peque" }));
    expect(addStudent).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/^Nombres/), "Mateo");
    await user.type(screen.getByLabelText(/^Apellidos/), "Pérez");
    await user.type(screen.getByLabelText(/Fecha de nacimiento/), "2019-05-04");
    await user.click(screen.getByLabelText("Prefiero no especificar"));
    await user.click(screen.getByRole("radio", { name: "Coral" }));
    await user.type(screen.getByLabelText(/^PIN/), "2468");
    await user.type(screen.getByLabelText(/Escribe el PIN otra vez/), "2468");
    await user.click(screen.getByRole("button", { name: "Agregar peque" }));

    expect(addStudent).toHaveBeenCalledWith({
      first_name: "Mateo",
      last_name: "Pérez",
      date_of_birth: "2019-05-04",
      avatar_id: 2,
      pin: "2468",
      support_condition_ids: [7],
      support_condition_other: null,
      additional_support_need: null,
    });
    expect(screen.queryByRole("heading", { name: "Agregar un peque" })).toBeNull();
  });

  it("opens the kid's space, shows their classes and comes back", async () => {
    studentsQuery.mockReturnValue({ data: [sofia], isLoading: false, isError: false });
    const user = userEvent.setup();
    render(<MisPequesSection onDirtyChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Sofía/ }));
    // The kid's space shows the full name.
    const name = screen.getByRole("heading", { level: 1, name: "Sofía Pérez" });
    // The banner takes the color of her avatar (Violeta).
    const banner = name.closest("header") as HTMLElement;
    expect(banner.style.getPropertyValue("--banner-color")).toBe("#804890");

    await user.click(screen.getByRole("button", { name: /Sus clases/ }));
    expect(screen.getByText("Sus clases de Sofía")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Regresar al espacio de Sofía" }));
    await user.click(screen.getByRole("button", { name: "Regresar a mis peques" }));
    expect(screen.getByText("1 perfil")).toBeTruthy();
  });

  it("opens the kid's data from their space", async () => {
    studentsQuery.mockReturnValue({ data: [sofia], isLoading: false, isError: false });
    const user = userEvent.setup();
    render(<MisPequesSection onDirtyChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Sofía/ }));
    await user.click(screen.getByRole("button", { name: /Sus datos/ }));

    expect(screen.getByText("datos de s1")).toBeTruthy();
  });

  it("says so when there are no kids yet", () => {
    studentsQuery.mockReturnValue({ data: [], isLoading: false, isError: false });

    render(<MisPequesSection onDirtyChange={vi.fn()} />);

    expect(screen.getByText("Todavía no tienes ningún perfil de estudiante")).toBeTruthy();
  });

  it("shows an error when the kids can't be loaded", () => {
    studentsQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    render(<MisPequesSection onDirtyChange={vi.fn()} />);

    expect(screen.getByRole("alert").textContent).toContain("No pudimos cargar");
  });
});
