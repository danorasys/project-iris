import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ApiError } from "@/shared/api/httpClient";
import { clearLoginNotice, peekLoginNotice } from "@/shared/ui/loginNotice";
import { MiPerfilSection } from "./MiPerfilSection";

const updateProfile = vi.fn();
const changePassword = vi.fn();
const onDirtyChange = vi.fn();

const profile = {
  first_name: "Ana María",
  last_name: "Gómez",
  date_of_birth: "1990-04-12",
  document_type_id: 1,
  document_number: "1234567890",
  document_issued_at: "2008-05-20",
  email: "ana@example.com",
  phone_country_code: "57",
  phone_number: "3001234567",
  relationship_type_id: 1,
};

vi.mock("@/shared/auth/AuthContext", () => ({
  useAuth: () => ({ discardSession: vi.fn() }),
}));

vi.mock("@/shared/api/hooks/useAuthApi", () => ({
  useMiPerfilTutor: () => ({ data: profile, isLoading: false, isError: false }),
  useDocumentTypes: () => ({ data: [{ id: 1, name: "Cédula de ciudadanía" }] }),
  useRelationshipTypes: () => ({
    data: [
      { id: 1, name: "Mamá" },
      { id: 2, name: "Papá" },
    ],
  }),
  useActualizarMiPerfilTutor: () => ({ mutateAsync: updateProfile, isPending: false }),
  useCambiarMiPassword: () => ({ mutateAsync: changePassword, isPending: false }),
}));

function renderSection() {
  return render(
    <MemoryRouter>
      <MiPerfilSection onDirtyChange={onDirtyChange} />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  updateProfile.mockReset();
  changePassword.mockReset();
  onDirtyChange.mockReset();
});

describe("MiPerfilSection", () => {
  it("shows the saved data, with the account data apart and read only", () => {
    renderSection();

    expect(screen.getByRole("heading", { level: 1, name: "Ana María Gómez" })).toBeTruthy();
    const account = screen.getByRole("region", { name: "Identificación de la cuenta" });
    expect(within(account).getByText("Cédula de ciudadanía")).toBeTruthy();
    expect(within(account).getByText("1234567890")).toBeTruthy();
    expect(within(account).queryByRole("button")).toBeNull();
    // How to ask for a change: a mail link with only the subject, no personal data.
    const mail = within(account).getByRole("link", { name: "soporte@iris.bucaramanga.upb.edu.co" });
    expect(mail.getAttribute("href")).toBe(
      "mailto:soporte@iris.bucaramanga.upb.edu.co?subject=Solicitud%20de%20cambio%20de%20datos%20de%20mi%20cuenta",
    );
    // No save bar until something changes.
    expect(screen.queryByRole("region", { name: "Cambios sin guardar" })).toBeNull();
  });

  it("discarding puts back the saved values", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: "Editar nombres" }));
    const input = screen.getByLabelText(/Nombres/);
    await user.clear(input);
    await user.type(input, "Lucía");
    await user.tab();

    expect(screen.getByRole("region", { name: "Cambios sin guardar" })).toBeTruthy();
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    await user.click(screen.getByRole("button", { name: "Descartar" }));

    expect(screen.queryByRole("region", { name: "Cambios sin guardar" })).toBeNull();
    expect(screen.getByText("Ana María")).toBeTruthy();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("discarding puts back every unsaved change at once, even a field still open", async () => {
    const user = userEvent.setup();
    renderSection();

    // Three changes in different fields, the last one left open.
    await user.click(screen.getByRole("button", { name: "Editar nombres" }));
    await user.clear(screen.getByLabelText(/Nombres/));
    await user.type(screen.getByLabelText(/Nombres/), "Lucía");
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Editar relación con el estudiante" }));
    await user.selectOptions(screen.getByRole("combobox"), "2");
    await user.keyboard("{Enter}");
    await user.click(screen.getByLabelText(/correcta y veraz/));
    await user.click(screen.getByRole("button", { name: "Editar apellidos" }));
    await user.clear(screen.getByLabelText(/Apellidos/));
    await user.type(screen.getByLabelText(/Apellidos/), "Rojas");

    await user.click(screen.getByRole("button", { name: "Descartar" }));

    expect(screen.getByText("Ana María")).toBeTruthy();
    expect(screen.getByText("Gómez")).toBeTruthy();
    expect(screen.getAllByText("Mamá").length).toBeGreaterThan(0);
    expect(screen.queryByText("Papá")).toBeNull();
    expect(screen.queryByText("Lucía")).toBeNull();
    // The open field is closed, without what was being typed.
    expect(screen.queryByLabelText(/Apellidos/)).toBeNull();
    expect(screen.queryByRole("region", { name: "Cambios sin guardar" })).toBeNull();
    expect(updateProfile).not.toHaveBeenCalled();

    // A new change starts clean: the declaration has to be marked again.
    await user.click(screen.getByRole("button", { name: "Editar nombres" }));
    await user.type(screen.getByLabelText(/Nombres/), " Sofía");
    await user.keyboard("{Enter}");
    expect((screen.getByLabelText(/correcta y veraz/) as HTMLInputElement).checked).toBe(false);
  });

  it("one press on Descartar is enough with a field open, where the browser animates the fields", async () => {
    // A browser with View Transitions runs the change a moment later, like
    // the real ones do. Closing the field for a button can't wait for that.
    const startViewTransition = vi.fn((update: () => void) => {
      setTimeout(update, 0);
      return {};
    });
    Object.defineProperty(document, "startViewTransition", { value: startViewTransition, configurable: true });
    try {
      const user = userEvent.setup();
      renderSection();

      await user.click(screen.getByRole("button", { name: "Editar nombres" }));
      const input = await screen.findByLabelText(/Nombres/);
      await user.clear(input);
      await user.type(input, "Lucía");
      const animationsBefore = startViewTransition.mock.calls.length;

      await user.click(screen.getByRole("button", { name: "Descartar" }));

      // The field closed at once, with no animation in the way of the click.
      expect(startViewTransition.mock.calls.length).toBe(animationsBefore);
      expect(screen.getByText("Ana María")).toBeTruthy();
      expect(screen.queryByLabelText(/Nombres/)).toBeNull();
      expect(screen.queryByRole("region", { name: "Cambios sin guardar" })).toBeNull();
    } finally {
      Reflect.deleteProperty(document, "startViewTransition");
    }
  });

  it("lets the save bar slide out before removing it", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: "Editar nombres" }));
    const input = screen.getByLabelText(/Nombres/);
    await user.clear(input);
    await user.type(input, "Lucía");
    await user.tab();
    await user.click(screen.getByRole("button", { name: "Descartar" }));

    // Still on screen while it slides out, but it can't be used anymore.
    const leaving = screen.getByText("Tienes cambios sin guardar").closest("[aria-hidden]") as HTMLElement;
    expect(leaving.getAttribute("aria-hidden")).toBe("true");
    expect(leaving.hasAttribute("inert")).toBe(true);
    await waitFor(() => expect(screen.queryByText("Tienes cambios sin guardar")).toBeNull());
  });

  it("saves only after the guardian confirms the data is true, with trimmed names", async () => {
    updateProfile.mockResolvedValue({ ...profile, last_name: "Rojas" });
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: "Editar apellidos" }));
    const input = screen.getByLabelText(/Apellidos/);
    await user.clear(input);
    await user.type(input, "  Rojas  ");
    await user.tab();

    const save = screen.getByRole("button", { name: "Guardar cambios" });
    expect((save as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByLabelText(/correcta y veraz/));
    await user.click(save);

    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({
        first_name: "Ana María",
        last_name: "Rojas",
        date_of_birth: "1990-04-12",
        phone_country_code: "57",
        phone_number: "3001234567",
        relationship_type_id: 1,
        truthful_declaration: true,
      }),
    );
    expect(await screen.findByText("Tus datos se guardaron correctamente.")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Ana María Rojas" })).toBeTruthy();
  });

  it("Cancelar puts back only that field and leaves no pending changes", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: "Editar nombres" }));
    const input = screen.getByLabelText(/Nombres/);
    await user.clear(input);
    await user.type(input, "Lucía");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.getByText("Ana María")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Cambios sin guardar" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Editar nombres" })));
  });

  it("Esc closes the relationship without changing it", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: "Editar relación con el estudiante" }));
    await user.selectOptions(screen.getByLabelText(/Relación con el estudiante/), "2");
    await user.keyboard("{Escape}");

    expect(screen.queryByLabelText(/Relación con el estudiante/)).toBeNull();
    expect(screen.queryByRole("region", { name: "Cambios sin guardar" })).toBeNull();
  });

  it("Enter keeps the change without sending the form", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: "Editar apellidos" }));
    const input = screen.getByLabelText(/Apellidos/);
    await user.clear(input);
    await user.type(input, "Rojas{Enter}");

    expect(screen.queryByLabelText(/Apellidos/)).toBeNull();
    expect(screen.getByText("Rojas")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Cambios sin guardar" })).toBeTruthy();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("clicking outside the field keeps the change and closes it", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: "Editar nombres" }));
    const input = screen.getByLabelText(/Nombres/);
    await user.clear(input);
    await user.type(input, "Lucía");
    await user.click(screen.getByRole("heading", { level: 1 }));

    expect(screen.queryByLabelText(/Nombres/)).toBeNull();
    expect(screen.getByText("Lucía")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Cambios sin guardar" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Listo" })).toBeNull();
  });

  it("shows the error under the field and locks saving while a name has numbers", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: "Editar nombres" }));
    const input = screen.getByLabelText(/Nombres/);
    await user.clear(input);
    await user.type(input, "Ana123");
    await user.click(screen.getByRole("heading", { level: 1 }));

    expect(screen.getByText("Usa solo letras, espacios, guion, apóstrofo o punto.")).toBeTruthy();
    await user.click(screen.getByLabelText(/correcta y veraz/));
    expect((screen.getByRole("button", { name: "Guardar cambios" }) as HTMLButtonElement).disabled).toBe(true);
    const notice = screen.getByText(/para poder guardar/).closest("p");
    expect(notice?.textContent).toBe("Corrige los datos marcados en rojo para poder guardar.");
  });

  it("does not let the birth date come after the document issue date", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: "Editar fecha de nacimiento" }));
    const input = screen.getByLabelText(/Fecha de nacimiento/) as HTMLInputElement;
    // The calendar itself stops at the issue date (2008-05-20)...
    expect(input.max <= "2008-05-20").toBe(true);
    // ...and typing a later date by hand is caught too.
    await user.clear(input);
    await user.type(input, "2008-06-01");
    await user.click(screen.getByRole("heading", { level: 1 }));

    expect(screen.getByText(/posterior a la fecha de expedición/)).toBeTruthy();
  });

  it("Cancelar goes back to the saved value even after the field was cleared and closed", async () => {
    const user = userEvent.setup();
    renderSection();

    // Clear the name and click outside, the empty value stays for now...
    await user.click(screen.getByRole("button", { name: "Editar nombres" }));
    await user.clear(screen.getByLabelText(/Nombres/));
    await user.click(screen.getByRole("heading", { level: 1 }));
    expect(screen.getByText("Ingresa tus nombres.")).toBeTruthy();

    // ...but opening it again and pressing Cancelar brings back the saved one.
    await user.click(screen.getByRole("button", { name: "Editar nombres" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.getByText("Ana María")).toBeTruthy();
    expect(screen.queryByText("Ingresa tus nombres.")).toBeNull();
    expect(screen.queryByRole("region", { name: "Cambios sin guardar" })).toBeNull();
  });

  describe("changing the password", () => {
    async function openForm(user: ReturnType<typeof userEvent.setup>) {
      renderSection();
      await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
    }

    it("asks for the current one and does not accept the same as the new one", async () => {
      const user = userEvent.setup();
      await openForm(user);
      const submit = () => screen.getByRole("button", { name: "Actualizar contraseña" }) as HTMLButtonElement;

      await user.type(screen.getByLabelText(/Nueva contraseña/), "Otra-Clave-456");
      await user.type(screen.getByLabelText(/Confirmar nueva contraseña/), "Otra-Clave-456");
      // Without the current one it can't be sent.
      expect(submit().disabled).toBe(true);

      await user.type(screen.getByLabelText(/Contraseña actual/), "Otra-Clave-456");
      expect(
        screen.getByText("La nueva contraseña no puede ser igual a la que escribiste en \"Contraseña actual\"."),
      ).toBeTruthy();
      expect(submit().disabled).toBe(true);
    });

    it("after a good change leaves the success notice and goes to the login", async () => {
      changePassword.mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={["/guardian/portal"]}>
          <Routes>
            <Route path="/guardian/portal" element={<MiPerfilSection onDirtyChange={onDirtyChange} />} />
            <Route path="/login/adult" element={<p>Login</p>} />
          </Routes>
        </MemoryRouter>,
      );

      await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
      await user.type(screen.getByLabelText(/Contraseña actual/), "Clave-Segura-123");
      await user.type(screen.getByLabelText(/Nueva contraseña/), "Otra-Clave-456");
      await user.type(screen.getByLabelText(/Confirmar nueva contraseña/), "Otra-Clave-456");
      await user.click(screen.getByRole("button", { name: "Actualizar contraseña" }));
      // Nothing is sent until the 2FA code is typed in the dialog.
      expect(changePassword).not.toHaveBeenCalled();
      await user.type(within(screen.getByRole("dialog")).getByLabelText("Dígito 1 de 6"), "123456");

      expect(await screen.findByText("Login")).toBeTruthy();
      expect(changePassword).toHaveBeenCalledWith({
        current_password: "Clave-Segura-123",
        code: "123456",
        password: "Otra-Clave-456",
        password_confirmation: "Otra-Clave-456",
      });
      expect(peekLoginNotice()?.title).toBe("Contraseña actualizada");
      clearLoginNotice();
    });

    it("shows a wrong current password under its own field and clears it", async () => {
      changePassword.mockRejectedValue(new ApiError(422, "contrasena_actual_incorrecta", "x"));
      const user = userEvent.setup();
      await openForm(user);

      await user.type(screen.getByLabelText(/Contraseña actual/), "No-Es-La-Mia-1");
      await user.type(screen.getByLabelText(/Nueva contraseña/), "Otra-Clave-456");
      await user.type(screen.getByLabelText(/Confirmar nueva contraseña/), "Otra-Clave-456");
      await user.click(screen.getByRole("button", { name: "Actualizar contraseña" }));
      await user.type(within(screen.getByRole("dialog")).getByLabelText("Dígito 1 de 6"), "123456");

      // The dialog closes and the error goes under the field it is about.
      expect(await screen.findByText("La contraseña actual no es correcta.")).toBeTruthy();
      expect(screen.queryByRole("dialog")).toBeNull();
      expect((screen.getByLabelText(/Contraseña actual/) as HTMLInputElement).value).toBe("");
    });

    it("shows a new password equal to the current one under the new password field", async () => {
      changePassword.mockRejectedValue(new ApiError(422, "contrasena_igual_a_la_actual", "x"));
      const user = userEvent.setup();
      await openForm(user);

      await user.type(screen.getByLabelText(/Contraseña actual/), "Clave-Segura-123");
      await user.type(screen.getByLabelText(/Nueva contraseña/), "Otra-Clave-456");
      await user.type(screen.getByLabelText(/Confirmar nueva contraseña/), "Otra-Clave-456");
      await user.click(screen.getByRole("button", { name: "Actualizar contraseña" }));
      await user.type(within(screen.getByRole("dialog")).getByLabelText("Dígito 1 de 6"), "123456");

      // The current password was right, so only the new ones are cleared.
      expect(await screen.findByText("La nueva contraseña debe ser diferente a la actual.")).toBeTruthy();
      expect(screen.queryByRole("dialog")).toBeNull();
      expect((screen.getByLabelText(/Contraseña actual/) as HTMLInputElement).value).toBe("Clave-Segura-123");
      expect((screen.getByLabelText(/Nueva contraseña/) as HTMLInputElement).value).toBe("");
    });

    it("keeps the dialog open when the code is wrong", async () => {
      changePassword.mockRejectedValue(new ApiError(401, "codigo_totp_invalido", "x"));
      const user = userEvent.setup();
      await openForm(user);

      await user.type(screen.getByLabelText(/Contraseña actual/), "Clave-Segura-123");
      await user.type(screen.getByLabelText(/Nueva contraseña/), "Otra-Clave-456");
      await user.type(screen.getByLabelText(/Confirmar nueva contraseña/), "Otra-Clave-456");
      await user.click(screen.getByRole("button", { name: "Actualizar contraseña" }));
      const dialog = screen.getByRole("dialog");
      await user.type(within(dialog).getByLabelText("Dígito 1 de 6"), "000000");

      expect((await within(dialog).findByRole("alert")).textContent).toContain("no es correcto o ya expiró");
      expect(screen.getByRole("dialog")).toBeTruthy();
      // The form keeps what was typed.
      expect((screen.getByLabelText(/Contraseña actual/) as HTMLInputElement).value).toBe("Clave-Segura-123");
    });

    it("closes the dialog without sending anything when cancelled", async () => {
      const user = userEvent.setup();
      await openForm(user);

      await user.type(screen.getByLabelText(/Contraseña actual/), "Clave-Segura-123");
      await user.type(screen.getByLabelText(/Nueva contraseña/), "Otra-Clave-456");
      await user.type(screen.getByLabelText(/Confirmar nueva contraseña/), "Otra-Clave-456");
      await user.click(screen.getByRole("button", { name: "Actualizar contraseña" }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(changePassword).not.toHaveBeenCalled();
    });
  });
});
