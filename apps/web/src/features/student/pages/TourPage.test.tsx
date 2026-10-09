import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { setInputMode } from "@/shared/gaze/inputMode";
import { isTourDone } from "../lib/studentJourney";
import TourPage from "./TourPage";

vi.mock("@/shared/auth/useAuth", () => ({ useAuth: () => ({ session: { subjectId: "kid-1" } }) }));

function renderTour(from?: string) {
  render(
    <MemoryRouter initialEntries={[{ pathname: "/student/tour", state: from ? { from } : null }]}>
      <Routes>
        <Route path="/student/tour" element={<TourPage />} />
        <Route path="/student/home" element={<p>Inicio del peque</p>} />
        <Route path="/student/settings" element={<p>Ajustes del peque</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function walkThrough() {
  for (let i = 0; i < 3; i++) await userEvent.click(screen.getByRole("button", { name: "Siguiente" }));
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("TourPage (HU-89)", () => {
  it("explains how to choose with the way the kid moves", async () => {
    setInputMode("keyboard");
    renderTour();

    await userEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    expect(screen.getByText(/usa la tecla Tab/)).toBeTruthy();
    expect(screen.getByText("Paso 2 de 4")).toBeTruthy();
  });

  it("at the end goes home and isn't shown by itself again", async () => {
    renderTour();

    await walkThrough();
    await userEvent.click(screen.getByRole("button", { name: "¡Empezar!" }));

    expect(screen.getByText("Inicio del peque")).toBeTruthy();
    expect(isTourDone("kid-1")).toBe(true);
  });

  it("seen again from Ajustes, it goes back there", async () => {
    renderTour("settings");

    await walkThrough();
    await userEvent.click(screen.getByRole("button", { name: "Volver a Ajustes" }));

    expect(screen.getByText("Ajustes del peque")).toBeTruthy();
  });
});
