import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import GuardianRegistrationWizard from "./GuardianRegistrationWizard";

vi.mock("@/shared/auth/useAuth", () => ({
  useAuth: () => ({ setSession: vi.fn() }),
}));

vi.mock("@/shared/api/hooks/useAuthApi", () => ({
  useRegistrarTutor: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDocumentTypes: () => ({
    data: [{ id: 1, name: "Cédula de ciudadanía" }],
    isLoading: false,
    isError: false,
  }),
  useRelationshipTypes: () => ({
    data: [{ id: 1, name: "Madre" }],
    isLoading: false,
    isError: false,
  }),
  useAvatars: () => ({ data: [], isLoading: false, isError: false }),
}));

function renderWizard() {
  return render(
    <MemoryRouter>
      <GuardianRegistrationWizard />
    </MemoryRouter>,
  );
}

// The check or the cross of a field sits on the box around its input.
function statusOf(label: RegExp) {
  return screen.getByLabelText(label).parentElement?.dataset.status;
}

afterEach(cleanup);

// The texts are typed without the pause between keys ({ delay: null }) and
// each test gets more time: every key re-renders the whole wizard, and with
// the whole suite running at once the long texts went over the 5 s limit.
describe("GuardianRegistrationWizard, checking each field when it's left", { timeout: 15000 }, () => {
  it("shows the check once a field is left well written", async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard();

    await user.type(screen.getByLabelText(/^Nombres/), "Prueba");
    expect(statusOf(/^Nombres/)).toBeUndefined();

    await user.tab();
    expect(statusOf(/^Nombres/)).toBe("valid");
  });

  it("stays quiet on an empty field that was only tabbed through", async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard();

    await user.click(screen.getByLabelText(/^Apellidos/));
    await user.tab();

    expect(statusOf(/^Apellidos/)).toBeUndefined();
    expect(screen.queryByText("Ingresa tus apellidos.")).toBeNull();
  });

  it("shows the cross and the error, and the check as soon as it's fixed", async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard();

    const email = screen.getByLabelText(/^Correo electrónico/);
    await user.type(email, "correo-sin-arroba");
    await user.tab();
    expect(statusOf(/^Correo electrónico/)).toBe("invalid");
    expect(screen.getByText("Ingresa un correo electrónico válido.")).toBeTruthy();

    // Fixed without leaving the field: it's checked on every key now.
    await user.clear(email);
    await user.type(email, "prueba@example.test");
    expect(statusOf(/^Correo electrónico/)).toBe("valid");
    expect(screen.queryByText("Ingresa un correo electrónico válido.")).toBeNull();
  });

  it("checks the confirmation again when the password changes", async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard();

    await user.type(screen.getByLabelText(/^Contraseña/), "Clave-Demo-2026!");
    await user.type(screen.getByLabelText(/^Confirmar contraseña/), "Clave-Demo-2026!");
    await user.tab();
    expect(statusOf(/^Confirmar contraseña/)).toBe("valid");

    await user.type(screen.getByLabelText(/^Contraseña/), "x");
    expect(statusOf(/^Confirmar contraseña/)).toBe("invalid");
    expect(screen.getByText("Las contraseñas no coinciden.")).toBeTruthy();
  });

  it("'Siguiente' marks the first field to fix and takes the focus there", async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard();

    await user.type(screen.getByLabelText(/^Nombres/), "Prueba");
    await user.click(screen.getByRole("button", { name: "Siguiente" }));

    expect(statusOf(/^Nombres/)).toBe("valid");
    expect(statusOf(/^Apellidos/)).toBe("invalid");
    expect(screen.getByText("Ingresa tus apellidos.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText(/^Apellidos/));
  });
});
