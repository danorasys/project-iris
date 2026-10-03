import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

// "Sus datos" has its own tests, here it only matters that it opens.
vi.mock("./SusDatosSection", () => ({
  SusDatosSection: ({ studentId }: { studentId: string }) => <p>datos de {studentId}</p>,
}));

vi.mock("@/shared/api/hooks/useAuthApi", () => ({
  useEstudiantesDeTutor: () => studentsQuery(),
  useEstudianteDeTutor: () => ({ data: { first_name: "Sofía", last_name: "Pérez" } }),
  useAvatars: () => ({
    data: [
      { id: 1, name: "Violeta" },
      { id: 2, name: "Coral" },
    ],
  }),
}));

afterEach(() => {
  cleanup();
  studentsQuery.mockReset();
});

describe("MisPequesSection", () => {
  it("shows one card per kid with their age and how many there are", () => {
    studentsQuery.mockReturnValue({ data: [sofia, mateo], isLoading: false, isError: false });

    render(<MisPequesSection onDirtyChange={vi.fn()} />);

    expect(screen.getByText("2 perfiles")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sofía, 7 años. Ver su espacio" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mateo, 1 año. Ver su espacio" })).toBeTruthy();
  });

  it("ends the list with the card to add a kid, which does nothing yet", () => {
    studentsQuery.mockReturnValue({ data: [sofia], isLoading: false, isError: false });

    render(<MisPequesSection onDirtyChange={vi.fn()} />);

    const cards = screen.getAllByRole("listitem");
    const add = screen.getByRole("button", { name: "Agregar estudiante" });
    expect(cards[cards.length - 1].contains(add)).toBe(true);
    expect(add.getAttribute("aria-disabled")).toBe("true");
  });

  it("opens the kid's space, shows an option as not ready yet and comes back", async () => {
    studentsQuery.mockReturnValue({ data: [sofia], isLoading: false, isError: false });
    const user = userEvent.setup();
    render(<MisPequesSection onDirtyChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Sofía/ }));
    // The kid's space shows the full name.
    expect(screen.getByRole("heading", { level: 1, name: "Sofía Pérez" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Sus clases/ }));
    expect(screen.getByText("Muy pronto vas a poder ver y gestionar sus clases aquí.")).toBeTruthy();

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
