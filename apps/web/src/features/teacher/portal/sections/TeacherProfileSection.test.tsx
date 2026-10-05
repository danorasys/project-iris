import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TeacherAccount, TeacherProfile } from "@iris/shared-types";
import { MemoryRouter } from "react-router-dom";
import { TeacherProfileSection } from "./TeacherProfileSection";

const saveProfile = vi.fn();
const updateAccount = vi.fn();
const changePassword = vi.fn();

const saved: TeacherProfile = {
  about: "Docente de primaria hace 8 años.",
  studies: [{ level: "professional", title: "Licenciatura", institution: "UPB", end_month: "2015-11", in_progress: false }],
  experiences: [],
};

const account: TeacherAccount = {
  first_name: "Carlos",
  last_name: "Ruiz",
  date_of_birth: "1988-06-20",
  document_type_id: 1,
  document_number: "80012345",
  document_issued_at: "2006-07-01",
  email: "carlos@example.com",
  phone_country_code: "57",
  phone_number: "3009876543",
  institution: "Colegio Nacional",
};

vi.mock("@/shared/api/hooks/useTeacherProfileApi", () => ({
  useMiPerfilDocente: () => ({ data: saved, isLoading: false, isError: false }),
  useGuardarMiPerfilDocente: () => ({ mutateAsync: saveProfile, isPending: false }),
  useMyTeacherAccount: () => ({ data: account, isLoading: false, isError: false }),
  useUpdateMyTeacherAccount: () => ({ mutateAsync: updateAccount, isPending: false }),
  useChangeMyTeacherPassword: () => ({ mutateAsync: changePassword, isPending: false }),
}));

vi.mock("@/shared/api/hooks/useAuthApi", () => ({
  useDocumentTypes: () => ({ data: [{ id: 1, name: "Cédula de ciudadanía" }] }),
  useCerrarTodasMisSesiones: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/shared/auth/AuthContext", () => ({
  useAuth: () => ({ discardSession: vi.fn() }),
}));

const onDirtyChange = vi.fn();

function renderPage() {
  return render(
    <MemoryRouter>
      <TeacherProfileSection onDirtyChange={onDirtyChange} />
    </MemoryRouter>,
  );
}

async function openEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Editar perfil docente" }));
}

// The floating bar saves everything, with its truthful declaration.
async function declare(user: ReturnType<typeof userEvent.setup>) {
  const bar = screen.getByRole("region", { name: "Cambios sin guardar" });
  await user.click(within(bar).getByRole("checkbox", { name: /Declaro que la información/ }));
}

function saveAllButton(): HTMLButtonElement {
  const bar = screen.getByRole("region", { name: "Cambios sin guardar" });
  return within(bar).getByRole("button", { name: "Guardar cambios" }) as HTMLButtonElement;
}

afterEach(() => {
  cleanup();
  saveProfile.mockReset();
  updateAccount.mockReset();
  changePassword.mockReset();
  onDirtyChange.mockReset();
});

// Some tests type a whole entry, so they get more time when the suite runs in parallel.
describe("TeacherProfileSection", { timeout: 20_000 }, () => {
  it("is built like the guardian's: header, personal data, account data apart, teacher profile and security", () => {
    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Carlos Ruiz" })).toBeTruthy();
    // The header has the initials, the role and the email.
    expect(screen.getByText("CR")).toBeTruthy();
    expect(screen.getByText("Docente")).toBeTruthy();
    expect(screen.getAllByText("carlos@example.com")).toHaveLength(2);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Datos personales",
      "Identificación de la cuenta",
      "Perfil docente",
      "Seguridad",
    ]);
    // The data that identifies the account can't be edited here.
    const identity = screen.getByRole("region", { name: "Identificación de la cuenta" });
    expect(within(identity).getByText("Cédula de ciudadanía")).toBeTruthy();
    expect(within(identity).getByText("80012345")).toBeTruthy();
    expect(within(identity).queryByRole("button")).toBeNull();
    // The personal data each have their pencil.
    for (const label of ["nombres", "apellidos", "fecha de nacimiento", "teléfono", "institución (opcional)"]) {
      expect(screen.getByRole("button", { name: `Editar ${label}` })).toBeTruthy();
    }
    expect(screen.getByText("Colegio Nacional")).toBeTruthy();
    // No save bar until something changes.
    expect(screen.queryByRole("region", { name: "Cambios sin guardar" })).toBeNull();
  });

  it("shows the teacher profile to read, like the rest of Mi perfil, until Editar is pressed", () => {
    renderPage();

    const card = screen.getByRole("region", { name: "Perfil docente" });
    expect(within(card).getByText("Docente de primaria hace 8 años.")).toBeTruthy();
    const studies = within(card).getByRole("list", { name: "Tus estudios" });
    expect(within(studies).getByText("Licenciatura")).toBeTruthy();
    expect(within(studies).getByText("UPB · Profesional o licenciatura")).toBeTruthy();
    expect(within(studies).getByText("Terminó en noviembre de 2015")).toBeTruthy();
    expect(within(card).getByText("Aún no has agregado experiencia.")).toBeTruthy();
    // Nothing to type in until the editor opens.
    expect(within(card).queryByRole("textbox")).toBeNull();
    expect(within(card).queryByText("Indicaciones iniciales:")).toBeNull();
  });

  it("the teacher profile is saved with the same floating bar and declaration as the personal data", async () => {
    saveProfile.mockImplementation(async (body: TeacherProfile) => body);
    const user = userEvent.setup({ delay: null });
    renderPage();
    await openEditor(user);

    // Nothing changed yet: no bar, and no save button of its own.
    expect(screen.queryByRole("region", { name: "Cambios sin guardar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Guardar perfil docente" })).toBeNull();

    await user.type(screen.getByLabelText("Preséntate en pocas palabras"), "!");
    expect(saveAllButton().disabled).toBe(true);
    await declare(user);
    expect(saveAllButton().disabled).toBe(false);
    await user.click(saveAllButton());

    expect(saveProfile).toHaveBeenCalledWith({ ...saved, about: "Docente de primaria hace 8 años.!" });
    // Only the teacher profile changed, so the personal data aren't sent.
    expect(updateAccount).not.toHaveBeenCalled();
    expect(await screen.findByText("Tus datos se guardaron correctamente.")).toBeTruthy();
    // Back to reading, with the focus on the button that opened the editor.
    // It moves on the next frame, once the button is drawn again.
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Editar perfil docente" })),
    );
  });

  it("one save sends the personal data and the teacher profile together", async () => {
    saveProfile.mockImplementation(async (body: TeacherProfile) => body);
    updateAccount.mockImplementation(async () => ({ ...account, institution: "Colegio San José" }));
    const user = userEvent.setup({ delay: null });
    renderPage();

    await user.click(screen.getByRole("button", { name: "Editar institución (opcional)" }));
    const institution = screen.getByLabelText(/^Institución \(opcional\)/);
    await user.clear(institution);
    await user.type(institution, "Colegio San José{Enter}");
    await openEditor(user);
    await user.click(screen.getByRole("button", { name: "Quitar el estudio 1" }));
    await declare(user);
    await user.click(saveAllButton());

    expect(updateAccount).toHaveBeenCalledWith(expect.objectContaining({ institution: "Colegio San José" }));
    expect(saveProfile).toHaveBeenCalledWith({ ...saved, studies: [] });
  });

  it("Descartar in the bar also puts back the teacher profile and closes its editor", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();
    await openEditor(user);
    await user.click(screen.getByRole("button", { name: "Quitar el estudio 1" }));

    const bar = screen.getByRole("region", { name: "Cambios sin guardar" });
    await user.click(within(bar).getByRole("button", { name: "Descartar" }));

    expect(saveProfile).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Editar perfil docente" })).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Tus estudios" })).getByText("Licenciatura")).toBeTruthy();
  });

  it("Cancelar with changes asks first, and then goes back to reading without saving", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();
    await openEditor(user);

    await user.type(screen.getByLabelText("Preséntate en pocas palabras"), "!");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await user.click(screen.getByRole("button", { name: "Descartar cambios" }));

    expect(saveProfile).not.toHaveBeenCalled();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    // The focus goes back to the button that opened the editor.
    // It moves on the next frame, once the button is drawn again.
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Editar perfil docente" })),
    );
  });

  it("saves the personal data only after the truthful declaration", async () => {
    updateAccount.mockImplementation(async () => ({ ...account, institution: "Colegio San José" }));
    const user = userEvent.setup({ delay: null });
    renderPage();

    await user.click(screen.getByRole("button", { name: "Editar institución (opcional)" }));
    const input = screen.getByLabelText(/^Institución \(opcional\)/);
    await user.clear(input);
    await user.type(input, "  Colegio San José  {Enter}");

    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    const bar = screen.getByRole("region", { name: "Cambios sin guardar" });
    const save = within(bar).getByRole("button", { name: "Guardar cambios" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await user.click(within(bar).getByRole("checkbox", { name: /Declaro que la información/ }));
    await user.click(save);

    expect(updateAccount).toHaveBeenCalledWith({
      first_name: "Carlos",
      last_name: "Ruiz",
      date_of_birth: "1988-06-20",
      phone_country_code: "57",
      phone_number: "3009876543",
      institution: "Colegio San José",
      truthful_declaration: true,
    });
    expect(await screen.findByText("Tus datos se guardaron correctamente.")).toBeTruthy();
  });

  it("an empty institution is saved as none", async () => {
    updateAccount.mockImplementation(async () => ({ ...account, institution: null }));
    const user = userEvent.setup({ delay: null });
    renderPage();

    await user.click(screen.getByRole("button", { name: "Editar institución (opcional)" }));
    await user.clear(screen.getByLabelText(/^Institución \(opcional\)/));
    await user.keyboard("{Enter}");
    const bar = screen.getByRole("region", { name: "Cambios sin guardar" });
    await user.click(within(bar).getByRole("checkbox", { name: /Declaro que la información/ }));
    await user.click(within(bar).getByRole("button", { name: "Guardar cambios" }));

    expect(updateAccount).toHaveBeenCalledWith(expect.objectContaining({ institution: null }));
  });

  it("changes the password through the teacher's own route", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();

    await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
    await user.type(screen.getByLabelText(/^Contraseña actual/), "Clave-Segura-123");
    await user.type(screen.getByLabelText(/^Nueva contraseña/), "Otra-Clave-456");
    await user.type(screen.getByLabelText(/^Confirmar nueva contraseña/), "Otra-Clave-456");
    await user.click(screen.getByRole("button", { name: "Actualizar contraseña" }));

    // The 2FA code is asked before sending anything.
    expect(changePassword).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Confirma el cambio de contraseña" })).toBeTruthy();
  });

  it("tells the portal there are unsaved changes once something is typed", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();
    await openEditor(user);

    await user.type(screen.getByLabelText("Preséntate en pocas palabras"), "!");

    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it("the editor starts from what the teacher already saved", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();
    await openEditor(user);

    expect((screen.getByLabelText("Preséntate en pocas palabras") as HTMLTextAreaElement).value).toBe(
      "Docente de primaria hace 8 años.",
    );
    expect(screen.queryByText("Áreas que enseño")).toBeNull();
    expect((screen.getByLabelText(/^Título/) as HTMLInputElement).value).toBe("Licenciatura");
    expect((screen.getByLabelText(/^Título/) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Editar el estudio 1" })).toBeTruthy();
    // What the profile is for was already said at registration.
    expect(screen.queryByText("Indicaciones iniciales:")).toBeNull();
    // How to use the cards: add, check, pencil and remove.
    expect(screen.getByText("Indicaciones para tus estudios y tu experiencia:")).toBeTruthy();
    expect(screen.getByText(/No podrás continuar mientras tengas una tarjeta sin confirmar/)).toBeTruthy();
  });

  it("adds a job and saves the whole profile", async () => {
    saveProfile.mockImplementation(async (body: TeacherProfile) => body);
    const user = userEvent.setup({ delay: null });
    renderPage();
    await openEditor(user);

    await user.click(screen.getByRole("button", { name: "Agregar una experiencia" }));
    const job = screen.getByText("Experiencia 1").closest("li") as HTMLElement;
    await user.type(within(job).getByLabelText(/^Cargo/), "Docente de matemáticas");
    await user.type(within(job).getByLabelText(/^Dónde/), "Colegio San José");
    await user.selectOptions(within(job).getByLabelText("Desde: mes"), "2");
    await user.type(within(job).getByLabelText("Desde: año"), "2016");
    await user.click(within(job).getByRole("checkbox", { name: "Trabajo ahí actualmente" }));
    await user.click(within(job).getByRole("button", { name: "Confirmar la experiencia 1" }));
    await declare(user);
    await user.click(saveAllButton());

    expect(saveProfile).toHaveBeenCalledWith({
      ...saved,
      experiences: [
        { role: "Docente de matemáticas", place: "Colegio San José", start_month: "2016-02", end_month: null, description: null },
      ],
    });
    expect(await screen.findByText("Tus datos se guardaron correctamente.")).toBeTruthy();
  });

  it("says right away when the end date is before the start, and lets it go once fixed", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();
    await openEditor(user);

    await user.click(screen.getByRole("button", { name: "Agregar una experiencia" }));
    const job = screen.getByText("Experiencia 1").closest("li") as HTMLElement;
    expect(within(job).getByLabelText(/^Cargo/).getAttribute("placeholder")).toBeNull();
    expect(within(job).getByLabelText(/^Descripción/)).toBeTruthy();
    await user.selectOptions(within(job).getByLabelText("Desde: mes"), "5");
    await user.type(within(job).getByLabelText("Desde: año"), "2020");
    await user.selectOptions(within(job).getByLabelText("Hasta: mes"), "1");
    await user.type(within(job).getByLabelText("Hasta: año"), "2020");

    // Without pressing save.
    expect(within(job).getByText("La fecha de fin no puede ser anterior a la de inicio.")).toBeTruthy();

    // Moving the start back also fixes it.
    await user.clear(within(job).getByLabelText("Desde: año"));
    await user.type(within(job).getByLabelText("Desde: año"), "2019");
    expect(within(job).queryByText("La fecha de fin no puede ser anterior a la de inicio.")).toBeNull();
  });

  it("puts a study in progress first once it's confirmed, and locks it", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();
    await openEditor(user);

    await user.click(screen.getByRole("button", { name: "Agregar un estudio" }));
    const study = screen.getByText("Estudio 1").closest("li") as HTMLElement;
    // A new card opens ready to type in.
    expect(document.activeElement).toBe(within(study).getByLabelText(/^Institución/));
    await user.type(within(study).getByLabelText(/^Institución/), "UIS");
    await user.type(within(study).getByLabelText(/^Título/), "Maestría en Educación");
    await user.selectOptions(within(study).getByLabelText(/^Nivel/), "masters");
    await user.click(within(study).getByRole("checkbox", { name: "Lo estoy cursando actualmente" }));

    // In progress: one box that says so, no month or year.
    expect(within(study).queryByLabelText("Fecha de finalización: mes")).toBeNull();
    expect((within(study).getByLabelText(/^Fecha de finalización/) as HTMLInputElement).value).toBe("En curso");

    // While it's open nothing moves, not even when the focus goes elsewhere.
    await user.click(screen.getByLabelText("Preséntate en pocas palabras"));
    expect((screen.getAllByLabelText(/^Título/)[0] as HTMLInputElement).value).toBe("Licenciatura");

    await user.click(within(study).getByRole("button", { name: "Confirmar el estudio 1" }));

    const titles = screen.getAllByLabelText(/^Título/) as HTMLInputElement[];
    expect(titles.map((input) => input.value)).toEqual(["Maestría en Educación", "Licenciatura"]);
    expect(titles[0].disabled).toBe(true);
    // Counted from the bottom: the newest, on top, has the highest number.
    expect(screen.getAllByText(/^Estudio \d$/).map((title) => title.textContent)).toEqual(["Estudio 2", "Estudio 1"]);
    // The focus follows the card to its new place, on its pencil.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Editar el estudio 2" }));
  });

  it("puts the current job on top once it's confirmed, with the highest number", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();
    await openEditor(user);

    const fill = async (role: string, start: [string, string], end?: [string, string]) => {
      await user.click(screen.getByRole("button", { name: "Agregar una experiencia" }));
      const job = screen.getByText("Experiencia 1").closest("li") as HTMLElement;
      await user.type(within(job).getByLabelText(/^Cargo/), role);
      await user.type(within(job).getByLabelText(/^Dónde/), "Colegio");
      await user.selectOptions(within(job).getByLabelText("Desde: mes"), start[0]);
      await user.type(within(job).getByLabelText("Desde: año"), start[1]);
      if (end) {
        await user.selectOptions(within(job).getByLabelText("Hasta: mes"), end[0]);
        await user.type(within(job).getByLabelText("Hasta: año"), end[1]);
      } else {
        await user.click(within(job).getByRole("checkbox", { name: "Trabajo ahí actualmente" }));
      }
      await user.click(within(job).getByRole("button", { name: "Confirmar la experiencia 1" }));
    };
    await fill("Rector", ["3", "2021"]);
    await fill("Tutor", ["1", "2010"], ["6", "2012"]);

    const roles = screen.getAllByLabelText(/^Cargo/) as HTMLInputElement[];
    expect(roles.map((input) => input.value)).toEqual(["Rector", "Tutor"]);
    expect(screen.getAllByText(/^Experiencia \d$/).map((title) => title.textContent)).toEqual([
      "Experiencia 2",
      "Experiencia 1",
    ]);
  });

  it("keeps a card open when something is wrong on check, and says what", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();
    await openEditor(user);

    await user.click(screen.getByRole("button", { name: "Agregar un estudio" }));
    await user.click(screen.getByRole("button", { name: "Confirmar el estudio 1" }));

    expect(screen.getByText("Escribe dónde lo estudiaste.")).toBeTruthy();
    expect(screen.getByText("Elige el nivel del estudio.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirmar el estudio 1" })).toBeTruthy();
  });

  it("opens a confirmed card again with the pencil", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();
    await openEditor(user);

    await user.click(screen.getByRole("button", { name: "Editar el estudio 1" }));

    const institution = screen.getByLabelText(/^Institución/) as HTMLInputElement;
    expect(institution.disabled).toBe(false);
    expect(document.activeElement).toBe(institution);
    expect(screen.getByRole("button", { name: "Confirmar el estudio 1" })).toBeTruthy();
  });

  it("typing in a study or job card doesn't bring the bar until its check is pressed", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();
    await openEditor(user);

    await user.click(screen.getByRole("button", { name: "Agregar una experiencia" }));
    const job = screen.getByText("Experiencia 1").closest("li") as HTMLElement;
    await user.type(within(job).getByLabelText(/^Cargo/), "Docente de matemáticas");
    await user.type(within(job).getByLabelText(/^Dónde/), "Colegio San José");
    await user.selectOptions(within(job).getByLabelText("Desde: mes"), "2");
    await user.type(within(job).getByLabelText("Desde: año"), "2016");
    await user.click(within(job).getByRole("checkbox", { name: "Trabajo ahí actualmente" }));

    // Still open: nothing to save yet, but leaving would lose it.
    expect(screen.queryByRole("region", { name: "Cambios sin guardar" })).toBeNull();
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    await user.click(within(job).getByRole("button", { name: "Confirmar la experiencia 1" }));
    expect(screen.getByRole("region", { name: "Cambios sin guardar" })).toBeTruthy();
  });

  it("opening a confirmed card again doesn't bring the bar until it's confirmed with a change", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();
    await openEditor(user);

    await user.click(screen.getByRole("button", { name: "Editar el estudio 1" }));
    const title = screen.getByLabelText(/^Título/);
    await user.clear(title);
    await user.type(title, "Licenciatura en Matemáticas");
    expect(screen.queryByRole("region", { name: "Cambios sin guardar" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Confirmar el estudio 1" }));
    expect(screen.getByRole("region", { name: "Cambios sin guardar" })).toBeTruthy();
  });

  it("doesn't save while a card is still open, and says what", async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();
    await openEditor(user);

    // The bar is already there for another change, and then a card is opened.
    await user.type(screen.getByLabelText("Preséntate en pocas palabras"), "!");
    await user.click(screen.getByRole("button", { name: "Agregar un estudio" }));
    await declare(user);
    await user.click(saveAllButton());

    expect(saveProfile).not.toHaveBeenCalled();
    expect(screen.getByText("Confirma o quita el estudio o la experiencia que estás editando.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Confirmar el estudio 1" }));
  });

  it("removes an entry", async () => {
    saveProfile.mockImplementation(async (body: TeacherProfile) => body);
    const user = userEvent.setup({ delay: null });
    renderPage();
    await openEditor(user);

    await user.click(screen.getByRole("button", { name: "Quitar el estudio 1" }));
    await declare(user);
    await user.click(saveAllButton());

    expect(saveProfile).toHaveBeenCalledWith({ ...saved, studies: [] });
  });

  it("shows the server's answer when saving fails", async () => {
    saveProfile.mockRejectedValue(new Error("x"));
    const user = userEvent.setup({ delay: null });
    renderPage();
    await openEditor(user);
    await user.type(screen.getByLabelText("Preséntate en pocas palabras"), "!");

    await declare(user);
    await user.click(saveAllButton());

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Tus datos se guardaron correctamente.")).toBeNull();
  });
});
