import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { StudentProfile } from "@iris/shared-types";
import ProfileSelectorAuth from "./ProfileSelectorAuth";

let kids: StudentProfile[] = [];
const login = vi.fn();
const navigate = vi.fn();

vi.mock("@/shared/api/hooks/useAuthApi", () => ({
  useEstudiantesDeTutor: () => ({ data: kids, isLoading: false, isError: false }),
  useLoginPerfilEstudiante: () => ({ mutateAsync: login }),
  useAvatars: () => ({ data: [] }),
}));
vi.mock("@/shared/auth/useAuth", () => ({
  useAuth: () => ({ closeSession: vi.fn(), setSession: vi.fn() }),
}));
vi.mock("react-router-dom", async (original) => ({
  ...(await original<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}));

const names = ["Sofía", "Tomás", "Valentina", "Mateo", "Lucía", "Samuel", "Isabella"];

function family(count: number): StudentProfile[] {
  return names.slice(0, count).map((first_name, i) => ({
    id: `k${i}`,
    first_name,
    avatar_id: 1,
    date_of_birth: "2018-01-01",
  }));
}

async function openKidsPortal() {
  render(
    <MemoryRouter>
      <ProfileSelectorAuth />
    </MemoryRouter>,
  );
  await userEvent.click(screen.getByRole("button", { name: /Portal Peques/ }));
}

const shownProfiles = () =>
  names.filter((name) => screen.queryByRole("button", { name: new RegExp(`^${name}`) }) !== null);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

describe("profile selector (HU-30)", () => {
  it("with three or fewer profiles shows them all, without arrows", async () => {
    kids = family(3);
    await openKidsPortal();

    expect(shownProfiles()).toEqual(["Sofía", "Tomás", "Valentina"]);
    expect(screen.queryByRole("button", { name: "Ver los perfiles siguientes" })).toBeNull();
  });

  it("with more, shows three at a time and the arrows stop at the ends", async () => {
    kids = family(7);
    await openKidsPortal();
    const previous = screen.getByRole("button", { name: "Ver los perfiles anteriores" });
    const next = screen.getByRole("button", { name: "Ver los perfiles siguientes" });

    expect(shownProfiles()).toEqual(["Sofía", "Tomás", "Valentina"]);
    expect(previous).toHaveProperty("disabled", true);

    await userEvent.click(next);
    expect(shownProfiles()).toEqual(["Mateo", "Lucía", "Samuel"]);
    await userEvent.click(next);
    expect(shownProfiles()).toEqual(["Isabella"]);
    expect(screen.getByText("Perfiles 7 a 7 de 7")).toBeTruthy();
    expect(next).toHaveProperty("disabled", true);
    expect(previous).toHaveProperty("disabled", false);
  });
});

describe("PIN window (HU-52)", () => {
  it("has a big button to go back to the profiles", async () => {
    kids = family(2);
    await openKidsPortal();

    await userEvent.click(screen.getByRole("button", { name: /^Tomás/ }));
    expect(screen.getByRole("heading", { name: "Hola, Tomás" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /No soy yo, elegir otro perfil/ }));

    expect(screen.getByRole("heading", { name: "¿Quién eres?" })).toBeTruthy();
  });
});

describe("after the PIN", () => {
  it("the first time goes to set up the camera, then to calibrate every session", async () => {
    kids = family(1);
    login.mockResolvedValue({ access_token: "t" });
    await openKidsPortal();
    await userEvent.click(screen.getByRole("button", { name: /^Sofía/ }));
    for (const digit of "2749") await userEvent.click(screen.getByRole("button", { name: `Dígito ${digit}` }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(login).toHaveBeenCalledWith({ student_id: "k0", pin: "2749" });
    expect(navigate).toHaveBeenLastCalledWith("/student/setup-conditions", { replace: true });
  });
});
