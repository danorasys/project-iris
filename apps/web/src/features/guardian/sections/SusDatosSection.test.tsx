import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ApiError } from "@/shared/api/httpClient";
import { SusDatosSection } from "./SusDatosSection";

const updateStudent = vi.fn();
const changePin = vi.fn();
const checkPin = vi.fn();
const studentQuery = vi.fn();
const onDirtyChange = vi.fn();

const sofia = {
  id: "s1",
  first_name: "Sofía",
  last_name: "Pérez",
  date_of_birth: "2018-05-10",
  avatar_id: 1,
  support_condition_ids: [15],
  support_condition_other: null,
  additional_support_need: null,
};

vi.mock("@/shared/auth/AuthContext", () => ({
  useAuth: () => ({ discardSession: vi.fn() }),
}));

vi.mock("@/shared/api/hooks/useAuthApi", () => ({
  useEstudianteDeTutor: () => studentQuery(),
  useActualizarEstudianteDeTutor: () => ({ mutateAsync: updateStudent, isPending: false }),
  useCambiarPinDeEstudiante: () => ({ mutateAsync: changePin, isPending: false }),
  useComprobarPinDeEstudiante: () => ({ mutateAsync: checkPin, isPending: false }),
  useAvatars: () => ({
    data: [
      { id: 1, name: "Violeta" },
      { id: 2, name: "Coral" },
    ],
  }),
  useSupportConditions: () => ({
    data: [
      { id: 1, name: "Parálisis cerebral" },
      { id: 3, name: "Mielomeningocele" },
      { id: 14, name: "Otra condición (especificar)" },
      { id: 15, name: "Prefiero no especificar" },
    ],
  }),
}));

function renderSection() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<SusDatosSection studentId="s1" onDirtyChange={onDirtyChange} />} />
        <Route path="/guardian/verify-2fa" element={<p>Pantalla del código</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  updateStudent.mockReset();
  changePin.mockReset();
  checkPin.mockReset();
  studentQuery.mockReset();
  onDirtyChange.mockReset();
});

describe("SusDatosSection", () => {
  it("shows the data the guardian registered, without a save bar", () => {
    studentQuery.mockReturnValue({ data: sofia, isLoading: false, isError: false });

    renderSection();

    expect(screen.getByText("Sofía")).toBeTruthy();
    expect(screen.getByText("Pérez")).toBeTruthy();
    expect(screen.getByText("10 de mayo de 2018")).toBeTruthy();
    expect(screen.getByText("Prefiero no especificar")).toBeTruthy();
    expect(screen.getByText("No indicada")).toBeTruthy();
    // The avatar is only its picture, without a visible name.
    expect(screen.getByRole("img", { name: "Violeta" })).toBeTruthy();
    expect(screen.queryByText("Violeta")).toBeNull();
    // The PIN is never shown, only that there is one.
    expect(screen.getByLabelText("PIN oculto")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Cambios sin guardar" })).toBeNull();
  });

  it("saves a change only after the declaration is marked", async () => {
    studentQuery.mockReturnValue({ data: sofia, isLoading: false, isError: false });
    updateStudent.mockResolvedValue({ ...sofia, last_name: "Gómez" });
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: "Editar apellidos" }));
    const input = screen.getByLabelText(/Apellidos/);
    await user.clear(input);
    await user.type(input, "Gómez");
    await user.tab();

    const save = screen.getByRole("button", { name: "Guardar cambios" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    await user.click(screen.getByLabelText(/correcta y veraz/));
    await user.click(save);

    await waitFor(() =>
      expect(updateStudent).toHaveBeenCalledWith({
        first_name: "Sofía",
        last_name: "Gómez",
        date_of_birth: "2018-05-10",
        avatar_id: 1,
        support_condition_ids: [15],
        support_condition_other: null,
        additional_support_need: null,
        truthful_declaration: true,
      }),
    );
    expect(await screen.findByText("Los datos de Sofía se guardaron correctamente.")).toBeTruthy();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("asks which condition when 'Otra condición' is chosen, and sends it", async () => {
    studentQuery.mockReturnValue({ data: sofia, isLoading: false, isError: false });
    updateStudent.mockResolvedValue({ ...sofia, support_condition_ids: [14], support_condition_other: "Baja visión" });
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: "Editar condición" }));
    // Marking another one unmarks "Prefiero no especificar" by itself.
    await user.click(screen.getByRole("checkbox", { name: "Otra condición (especificar)" }));
    expect((screen.getByRole("checkbox", { name: "Prefiero no especificar" }) as HTMLInputElement).checked).toBe(false);
    await user.keyboard("{Enter}");

    // It can't be saved until the condition is written.
    expect(screen.getByText("Especifica la condición.")).toBeTruthy();
    await user.click(screen.getByLabelText(/correcta y veraz/));
    expect((screen.getByRole("button", { name: "Guardar cambios" }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole("button", { name: "Editar cuál condición" }));
    await user.type(screen.getByLabelText(/Cuál condición/), "Baja visión");
    await user.tab();
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(updateStudent).toHaveBeenCalledWith(
        expect.objectContaining({ support_condition_ids: [14], support_condition_other: "Baja visión" }),
      ),
    );
  });

  it("lets a kid have several conditions, and shows them all", async () => {
    studentQuery.mockReturnValue({ data: sofia, isLoading: false, isError: false });
    updateStudent.mockResolvedValue({ ...sofia, support_condition_ids: [1, 3] });
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: "Editar condición" }));
    await user.click(screen.getByRole("checkbox", { name: "Mielomeningocele" }));
    await user.click(screen.getByRole("checkbox", { name: "Parálisis cerebral" }));
    await user.keyboard("{Enter}");

    // Closed, the row lists them in the order of the catalog.
    expect(screen.getByText("Parálisis cerebral, Mielomeningocele")).toBeTruthy();
    expect(screen.getByText("Condiciones")).toBeTruthy();
    await user.click(screen.getByLabelText(/correcta y veraz/));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(updateStudent).toHaveBeenCalledWith(
        expect.objectContaining({ support_condition_ids: [1, 3], support_condition_other: null }),
      ),
    );
  });

  it("'Prefiero no especificar' clears the others, and none at all can't be saved", async () => {
    studentQuery.mockReturnValue({
      data: { ...sofia, support_condition_ids: [1, 3] },
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: "Editar condiciones" }));
    await user.click(screen.getByRole("checkbox", { name: "Prefiero no especificar" }));
    expect((screen.getByRole("checkbox", { name: "Parálisis cerebral" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: "Mielomeningocele" }) as HTMLInputElement).checked).toBe(false);

    await user.click(screen.getByRole("checkbox", { name: "Prefiero no especificar" }));
    expect(screen.getByText("Marca al menos una condición.")).toBeTruthy();
    await user.keyboard("{Enter}");
    await user.click(screen.getByLabelText(/correcta y veraz/));
    expect((screen.getByRole("button", { name: "Guardar cambios" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("discarding puts back the saved values", async () => {
    studentQuery.mockReturnValue({ data: sofia, isLoading: false, isError: false });
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: "Editar nombres" }));
    const input = screen.getByLabelText(/Nombres/);
    await user.clear(input);
    await user.type(input, "Lucía");
    await user.tab();
    await user.click(screen.getByRole("button", { name: "Descartar" }));

    expect(screen.getByText("Sofía")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Cambios sin guardar" })).toBeNull();
    expect(updateStudent).not.toHaveBeenCalled();
  });

  it("changes the avatar with the rest of the data", async () => {
    studentQuery.mockReturnValue({ data: sofia, isLoading: false, isError: false });
    updateStudent.mockResolvedValue({ ...sofia, avatar_id: 2 });
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: "Editar avatar" }));
    expect((screen.getByRole("radio", { name: "Violeta" }) as HTMLElement).getAttribute("aria-checked")).toBe("true");
    await user.click(screen.getByRole("radio", { name: "Coral" }));
    await user.click(screen.getByLabelText(/correcta y veraz/));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(updateStudent).toHaveBeenCalledWith(expect.objectContaining({ avatar_id: 2 })));
    expect(await screen.findByRole("img", { name: "Coral" })).toBeTruthy();
  });

  describe("changing the PIN", () => {
    type User = ReturnType<typeof userEvent.setup>;

    // Types a PIN on the number pad of the dialog and confirms it.
    async function typeOnPad(user: User, digits: string) {
      const dialog = within(screen.getByRole("dialog"));
      for (const digit of digits) await user.click(dialog.getByRole("button", { name: `Dígito ${digit}` }));
      await user.click(dialog.getByRole("button", { name: "Confirmar" }));
    }

    async function typePins(user: User, current = "1234", next = "9876") {
      await user.click(screen.getByRole("button", { name: "Cambiar PIN" }));
      await typeOnPad(user, current);
      await typeOnPad(user, next);
      await typeOnPad(user, next);
    }

    async function typeCode(user: User, code = "123456") {
      await user.type(within(screen.getByRole("dialog")).getByLabelText("Dígito 1 de 6"), code);
    }

    it("asks for the current PIN, the new one twice and then the 2FA code", async () => {
      studentQuery.mockReturnValue({ data: sofia, isLoading: false, isError: false });
      changePin.mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderSection();

      await user.click(screen.getByRole("button", { name: "Cambiar PIN" }));
      expect(screen.getByRole("dialog", { name: "Cambiar el PIN de Sofía" })).toBeTruthy();
      expect(screen.getByText("Escribe el PIN actual")).toBeTruthy();
      await typeOnPad(user, "1234");
      expect(checkPin).toHaveBeenCalledWith({ current_pin: "1234" });
      expect(await screen.findByText("Escribe el nuevo PIN de 4 dígitos")).toBeTruthy();
      await typeOnPad(user, "9876");
      expect(screen.getByText("Vuelve a escribir el nuevo PIN")).toBeTruthy();
      await typeOnPad(user, "9876");

      // Nothing is sent until the 2FA code is typed in its own dialog, which
      // shows the authenticator apps.
      expect(changePin).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog", { name: "Confirma el cambio de PIN" })).toBeTruthy();
      expect(screen.getByText("Google Authenticator")).toBeTruthy();
      await typeCode(user);

      await waitFor(() =>
        expect(changePin).toHaveBeenCalledWith({
          current_pin: "1234",
          code: "123456",
          pin: "9876",
          pin_confirmation: "9876",
        }),
      );
      expect(await screen.findByText("El PIN de Sofía se cambió correctamente.")).toBeTruthy();
      // Everything closes and the profile data wasn't touched.
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(updateStudent).not.toHaveBeenCalled();
      expect(screen.queryByRole("region", { name: "Cambios sin guardar" })).toBeNull();
    });

    it("says at once that the current PIN is wrong, and doesn't move on", async () => {
      studentQuery.mockReturnValue({ data: sofia, isLoading: false, isError: false });
      checkPin.mockRejectedValue(new ApiError(422, "pin_actual_incorrecto", "x"));
      const user = userEvent.setup();
      renderSection();

      await user.click(screen.getByRole("button", { name: "Cambiar PIN" }));
      await typeOnPad(user, "0000");

      expect((await screen.findByRole("alert")).textContent).toBe("El PIN actual no es correcto.");
      expect(screen.getByText("Escribe el PIN actual")).toBeTruthy();
      expect(screen.queryByText("Escribe el nuevo PIN de 4 dígitos")).toBeNull();

      // The pad is empty again, and a right one goes on.
      checkPin.mockResolvedValue(undefined);
      await typeOnPad(user, "1234");
      expect(await screen.findByText("Escribe el nuevo PIN de 4 dígitos")).toBeTruthy();
    });

    it("also takes the PIN from the keyboard", async () => {
      studentQuery.mockReturnValue({ data: sofia, isLoading: false, isError: false });
      const user = userEvent.setup();
      renderSection();

      await user.click(screen.getByRole("button", { name: "Cambiar PIN" }));
      // The 5 is deleted, and the letter does nothing.
      await user.keyboard("1235{Backspace}a4{Enter}");

      expect(await screen.findByText("Escribe el nuevo PIN de 4 dígitos")).toBeTruthy();
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("doesn't take a new PIN equal to the current one", async () => {
      studentQuery.mockReturnValue({ data: sofia, isLoading: false, isError: false });
      const user = userEvent.setup();
      renderSection();

      await user.click(screen.getByRole("button", { name: "Cambiar PIN" }));
      await typeOnPad(user, "1234");
      await typeOnPad(user, "1234");

      expect(screen.getByRole("alert").textContent).toBe("El nuevo PIN no puede ser igual al actual.");
      expect(screen.getByText("Escribe el nuevo PIN de 4 dígitos")).toBeTruthy();
    });

    it("asks for the new PIN again when the two don't match", async () => {
      studentQuery.mockReturnValue({ data: sofia, isLoading: false, isError: false });
      const user = userEvent.setup();
      renderSection();

      await user.click(screen.getByRole("button", { name: "Cambiar PIN" }));
      await typeOnPad(user, "1234");
      await typeOnPad(user, "9876");
      await typeOnPad(user, "9875");

      expect(screen.getByRole("alert").textContent).toBe("Los PIN no coinciden. Vuelve a intentarlo.");
      expect(screen.getByText("Escribe el nuevo PIN de 4 dígitos")).toBeTruthy();
      expect(changePin).not.toHaveBeenCalled();
    });

    it("goes back one step with Atrás", async () => {
      studentQuery.mockReturnValue({ data: sofia, isLoading: false, isError: false });
      const user = userEvent.setup();
      renderSection();

      await user.click(screen.getByRole("button", { name: "Cambiar PIN" }));
      expect(screen.queryByRole("button", { name: "Atrás" })).toBeNull();
      await typeOnPad(user, "1234");
      await user.click(screen.getByRole("button", { name: "Atrás" }));

      expect(screen.getByText("Escribe el PIN actual")).toBeTruthy();
    });

    it("starts again at the pad when the current PIN was wrong", async () => {
      studentQuery.mockReturnValue({ data: sofia, isLoading: false, isError: false });
      changePin.mockRejectedValue(new ApiError(422, "pin_actual_incorrecto", "x"));
      const user = userEvent.setup();
      renderSection();

      await typePins(user, "0000");
      await typeCode(user);

      expect((await screen.findByRole("alert")).textContent).toBe("El PIN actual no es correcto.");
      expect(screen.getByRole("dialog", { name: "Cambiar el PIN de Sofía" })).toBeTruthy();
      expect(screen.getByText("Escribe el PIN actual")).toBeTruthy();
    });

    it("keeps the code dialog open when the code is wrong", async () => {
      studentQuery.mockReturnValue({ data: sofia, isLoading: false, isError: false });
      changePin.mockRejectedValue(new ApiError(401, "codigo_totp_invalido", "x"));
      const user = userEvent.setup();
      renderSection();

      await typePins(user);
      await typeCode(user, "000000");

      await waitFor(() => expect(changePin).toHaveBeenCalled());
      const dialog = screen.getByRole("dialog", { name: "Confirma el cambio de PIN" });
      expect(await within(dialog).findByRole("alert")).toBeTruthy();
    });
  });

  it("discarding puts back every unsaved change at once, even a field still open", async () => {
    studentQuery.mockReturnValue({ data: sofia, isLoading: false, isError: false });
    const user = userEvent.setup();
    renderSection();

    // A name, the conditions and the avatar, and one more field left open.
    await user.click(screen.getByRole("button", { name: "Editar nombres" }));
    await user.clear(screen.getByLabelText(/Nombres/));
    await user.type(screen.getByLabelText(/Nombres/), "Lucía");
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Editar condición" }));
    await user.click(screen.getByRole("checkbox", { name: "Mielomeningocele" }));
    await user.click(screen.getByRole("checkbox", { name: "Parálisis cerebral" }));
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Editar avatar" }));
    await user.click(screen.getByRole("radio", { name: "Coral" }));
    await user.click(screen.getByLabelText(/correcta y veraz/));
    await user.click(screen.getByRole("button", { name: "Editar apellidos" }));
    await user.clear(screen.getByLabelText(/Apellidos/));
    await user.type(screen.getByLabelText(/Apellidos/), "Rojas");

    await user.click(screen.getByRole("button", { name: "Descartar" }));

    expect(screen.getByText("Sofía")).toBeTruthy();
    expect(screen.getByText("Pérez")).toBeTruthy();
    expect(screen.getByText("Prefiero no especificar")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Violeta" })).toBeTruthy();
    expect(screen.queryByText("Lucía")).toBeNull();
    expect(screen.queryByLabelText(/Apellidos/)).toBeNull();
    expect(screen.queryByRole("region", { name: "Cambios sin guardar" })).toBeNull();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(updateStudent).not.toHaveBeenCalled();
  });

  it("goes to the code screen when the portal access ran out", () => {
    studentQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError(403, "acceso_portal_requerido", "x"),
    });

    renderSection();

    expect(screen.getByText("Pantalla del código")).toBeTruthy();
  });

  it("shows an error when the data can't be loaded", () => {
    studentQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error("x") });

    renderSection();

    expect(screen.getByRole("alert").textContent).toContain("No pudimos cargar sus datos");
  });
});
