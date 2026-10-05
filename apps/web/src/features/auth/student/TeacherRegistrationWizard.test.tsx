import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TeacherRegistrationWizard from "./TeacherRegistrationWizard";

const register = vi.fn();
const setSession = vi.fn();

vi.mock("@/shared/auth/AuthContext", () => ({
  useAuth: () => ({ setSession }),
}));

vi.mock("@/shared/api/hooks/useAuthApi", () => ({
  useDocumentTypes: () => ({
    data: [{ id: 1, name: "Cédula de ciudadanía" }],
    isLoading: false,
    isError: false,
  }),
  useRegistrarDocente: () => ({ mutateAsync: register, isPending: false }),
}));

// The 2FA screens have their own tests, here they only stand in for the steps.
vi.mock("./TotpSetupScreen", () => ({
  TotpSetupScreen: ({ account, onVerified }: { account: string; onVerified: (tokens: object) => void }) => (
    <button type="button" onClick={() => onVerified({ access_token: "verificado", token_type: "bearer" })}>
      Configurar 2FA de {account}
    </button>
  ),
}));

vi.mock("./TotpSuccessScreen", () => ({
  TotpSuccessScreen: ({ onContinue }: { onContinue: () => void }) => (
    <button type="button" onClick={onContinue}>
      2FA activado
    </button>
  ),
}));

function renderWizard() {
  return render(
    <MemoryRouter initialEntries={["/login/teacher/new"]}>
      <Routes>
        <Route path="/login/teacher/new" element={<TeacherRegistrationWizard />} />
        <Route path="/teacher/portal" element={<p>Panel docente</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

// Step 1, the personal data, all of them valid.
async function fillPersonalData(user: UserEvent) {
  await user.type(screen.getByLabelText(/^Nombres/), "Carlos");
  await user.type(screen.getByLabelText(/^Apellidos/), "Ruiz");
  await user.type(screen.getByLabelText(/^Fecha de nacimiento/), "1988-06-20");
  await user.type(screen.getByLabelText(/^Número de documento/), "80012345");
  await user.type(screen.getByLabelText(/^Fecha de expedición del documento/), "2006-07-01");
  await user.type(screen.getByLabelText(/^Correo electrónico/), "carlos@example.com");
  await user.type(screen.getByLabelText(/^Teléfono/), "3009876543");
  await user.type(screen.getByLabelText(/^Contraseña/), "Clave-Segura-123");
  await user.type(screen.getByLabelText(/^Confirmar contraseña/), "Clave-Segura-123");
  await user.type(screen.getByLabelText(/^Institución/), "Colegio Nacional");
  await user.click(screen.getByRole("button", { name: "Siguiente" }));
}

// Step 2 ends with the data treatment consent.
async function acceptAndGoOn(user: UserEvent) {
  await user.click(screen.getByRole("checkbox", { name: /Acepto el tratamiento de mis datos personales/ }));
  await user.click(screen.getByRole("button", { name: "Siguiente" }));
}

// jsdom has no scrolling, and the wizard scrolls to the top on every step.
beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  register.mockReset();
  setSession.mockReset();
});

// Each test fills the whole first step, so they get more time than the
// default when the suite runs in parallel.
describe("TeacherRegistrationWizard, the teacher's profile step", { timeout: 20_000 }, () => {
  it("comes after the personal data and can go on empty", async () => {
    register.mockResolvedValue({ access_token: "t", token_type: "bearer" });
    const user = userEvent.setup({ delay: null });
    renderWizard();

    await fillPersonalData(user);
    expect(screen.getByRole("heading", { name: "Crear cuenta: Tu perfil docente" })).toBeTruthy();
    expect(screen.getByText("Paso 2 de 3 — Tu perfil docente.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Completar después" })).toBeNull();
    expect(screen.queryByText("Áreas que enseño")).toBeNull();
    await acceptAndGoOn(user);

    expect(screen.getByText("Lo completarás después desde tu panel")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Confirmar y crear cuenta" }));

    expect(register).toHaveBeenCalledWith(expect.objectContaining({
        email: "carlos@example.com",
        phone_country_code: "57",
        phone_number: "3009876543",
        document_issued_at: "2006-07-01",
        consent: { policy_version: "1.2", accepts_data_processing: true },
        profile: null,
      }));
    // Like the guardian: first the celebration screen, then the 2FA.
    expect(await screen.findByText(/Tu cuenta de docente ya quedó creada dentro de IRIS/)).toBeTruthy();
    expect(screen.getByText(/puedes completar tu perfil docente desde tu panel/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.click(await screen.findByRole("button", { name: "Configurar 2FA de teacher" }));
    expect(setSession).toHaveBeenLastCalledWith({ access_token: "verificado", token_type: "bearer" });
    await user.click(screen.getByRole("button", { name: "2FA activado" }));
    expect(await screen.findByText("Panel docente")).toBeTruthy();
  });

  it("tells about the 2FA in the account security notice", () => {
    renderWizard();

    expect(screen.getByText(/IRIS usa autenticación de dos factores \(2FA\)/)).toBeTruthy();
    expect(screen.getByText(/Google\s+Authenticator, Microsoft Authenticator o\s+Authy/)).toBeTruthy();
  });

  it("sends the profile with the account when it's filled in", async () => {
    register.mockResolvedValue({ access_token: "t", token_type: "bearer" });
    const user = userEvent.setup({ delay: null });
    renderWizard();

    await fillPersonalData(user);
    await user.type(screen.getByLabelText("Preséntate en pocas palabras"), "Docente de primaria.");
    await acceptAndGoOn(user);

    // The confirmation shows the profile itself, not just how many entries it has.
    const summary = screen.getByRole("region", { name: "Tu perfil docente" });
    expect(within(summary).getByText("Docente de primaria.")).toBeTruthy();
    expect(within(summary).getByText("Sin estudios.")).toBeTruthy();
    expect(within(summary).getByText("Sin experiencia.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Confirmar y crear cuenta" }));

    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: {
          about: "Docente de primaria.",
          studies: [],
          experiences: [],
        },
      }),
    );
    expect(await screen.findByText(/Tu cuenta y tu perfil docente ya quedaron creados/)).toBeTruthy();
  });

  it("doesn't move forward or back while a card is still open", async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard();

    await fillPersonalData(user);
    await user.click(screen.getByRole("button", { name: "Agregar un estudio" }));
    await user.click(screen.getByRole("button", { name: "Siguiente" }));

    expect(screen.getByText("Confirma o quita el estudio o la experiencia que estás editando.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Crear cuenta: Tu perfil docente" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Atrás" }));
    await user.click(screen.getByRole("button", { name: "Ir al paso 1: datos del docente" }));
    expect(screen.getByRole("heading", { name: "Crear cuenta: Tu perfil docente" })).toBeTruthy();

    // Taking the card out lets the teacher go on.
    await user.click(screen.getByRole("button", { name: "Quitar el estudio 1" }));
    await user.click(screen.getByRole("button", { name: "Atrás" }));
    expect(screen.getByRole("heading", { name: "Crear cuenta: Docente" })).toBeTruthy();
  });

  it("goes back to the personal data keeping them", async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard();

    await fillPersonalData(user);
    await user.click(screen.getByRole("button", { name: "Atrás" }));

    expect((screen.getByLabelText(/^Nombres/) as HTMLInputElement).value).toBe("Carlos");
  });
});

describe("TeacherRegistrationWizard, same behavior as the guardian's", { timeout: 20_000 }, () => {
  it("moves between steps with the dots, checking the data before going forward", async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard();

    const toStep2 = screen.getByRole("button", { name: "Ir al paso 2: perfil docente" });
    expect(screen.getByRole("button", { name: "Ir al paso 1: datos del docente" }).getAttribute("aria-current")).toBe(
      "step",
    );
    await user.click(toStep2);
    expect(screen.getByRole("heading", { name: "Crear cuenta: Docente" })).toBeTruthy();

    await fillPersonalData(user);
    await user.click(screen.getByRole("button", { name: "Ir al paso 1: datos del docente" }));
    expect(screen.getByRole("heading", { name: "Crear cuenta: Docente" })).toBeTruthy();
  });

  it("shows one problem at a time, the first one from the top", async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard();

    await user.click(screen.getByRole("button", { name: "Siguiente" }));

    expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual(["Ingresa tus nombres."]);
  });

  it("checks the document number while it's typed", async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard();

    await user.type(screen.getByLabelText(/^Número de documento/), "12");

    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("checks the document issue date against the birth date while it's typed", async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard();

    await user.type(screen.getByLabelText(/^Fecha de nacimiento/), "1988-06-20");
    await user.type(screen.getByLabelText(/^Fecha de expedición del documento/), "1980-01-01");

    expect(screen.getByText(/no puede ser anterior a tu fecha de nacimiento/)).toBeTruthy();
  });

  it("asks to accept the data treatment at the end of step 2, not in step 1", async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard();

    expect(screen.queryByRole("checkbox", { name: /Acepto el tratamiento de mis datos personales/ })).toBeNull();
    await fillPersonalData(user);
    await user.click(screen.getByRole("button", { name: "Siguiente" }));

    expect(screen.getByText("El consentimiento de tratamiento de datos es obligatorio.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Crear cuenta: Tu perfil docente" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Política de Privacidad" }).getAttribute("href")).toBe("/privacy-policy");
  });

  it("lets the institution empty, it's optional", async () => {
    register.mockResolvedValue({ access_token: "t", token_type: "bearer" });
    const user = userEvent.setup({ delay: null });
    renderWizard();

    await fillPersonalData(user);
    await user.click(screen.getByRole("button", { name: "Atrás" }));
    const institution = screen.getByLabelText("Institución (opcional)");
    expect((institution as HTMLInputElement).required).toBe(false);
    await user.clear(institution);
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    await acceptAndGoOn(user);

    expect(screen.getByText("Sin indicar")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Confirmar y crear cuenta" }));
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ institution: null }));
  });
});
