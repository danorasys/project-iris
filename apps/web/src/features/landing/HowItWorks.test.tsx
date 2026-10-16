import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { HowItWorks } from "./HowItWorks";

// jsdom has no IntersectionObserver; the sections just never "show up".
class FakeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Shows where the link went.
function RouteProbe() {
  const { pathname } = useLocation();
  return <p>{`at ${pathname}`}</p>;
}

function renderHowItWorks() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<HowItWorks />} />
        <Route path="/login" element={<RouteProbe />} />
        <Route path="/register" element={<RouteProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("HowItWorks", () => {
  it("shows the three paths in order", () => {
    renderHowItWorks();

    const titles = screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
    expect(titles).toEqual([
      "Aprender solo con la mirada",
      "La familia abre la puerta",
      "El docente arma el camino",
      "El estudiante aprende mirando",
      "¿Listos para empezar el camino?",
    ]);
  });

  it("the call after the paths opens the sign up", async () => {
    const user = userEvent.setup();
    renderHowItWorks();

    await user.click(screen.getByRole("link", { name: /Únete a IRIS/ }));

    expect(screen.getByText("at /register")).toBeTruthy();
  });

  it("people who already have an account go straight to sign in", async () => {
    const user = userEvent.setup();
    renderHowItWorks();

    await user.click(screen.getByRole("link", { name: "Ya tengo cuenta" }));

    expect(screen.getByText("at /login")).toBeTruthy();
  });
});
