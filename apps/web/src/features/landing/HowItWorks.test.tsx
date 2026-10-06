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

// Shows where the link went and what it carried, to check the sign up view.
function LoginProbe() {
  const location = useLocation();
  return <p>{`login ${JSON.stringify(location.state)}`}</p>;
}

function renderHowItWorks() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<HowItWorks />} />
        <Route path="/login/adult" element={<LoginProbe />} />
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

  it("the call after the paths opens the sign up view", async () => {
    const user = userEvent.setup();
    renderHowItWorks();

    await user.click(screen.getByRole("link", { name: /Únete a IRIS/ }));

    expect(screen.getByText('login {"vista":"elegirRegistro"}')).toBeTruthy();
  });

  it("people who already have an account go straight to sign in", async () => {
    const user = userEvent.setup();
    renderHowItWorks();

    await user.click(screen.getByRole("link", { name: "Ya tengo cuenta" }));

    expect(screen.getByText("login null")).toBeTruthy();
  });
});
