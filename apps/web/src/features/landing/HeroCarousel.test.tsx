import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { HeroCarousel } from "./HeroCarousel";

// jsdom has no IntersectionObserver nor matchMedia, so the test gives
// simple ones: nothing is observed and "less movement" is off unless asked.
class FakeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function stubReducedMotion(reduced: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduced,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
}

function renderHero() {
  return render(
    <MemoryRouter>
      <HeroCarousel />
    </MemoryRouter>,
  );
}

const tab = (name: string) => screen.getByRole("tab", { name });

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  stubReducedMotion(false);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("HeroCarousel", () => {
  it("shows IRIS as the page title and starts on the gaze scene", () => {
    renderHero();

    expect(screen.getByRole("heading", { level: 1, name: "IRIS" })).toBeTruthy();
    expect(tab("La mirada").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { name: "Tu mirada, la llave de todo" })).toBeTruthy();
  });

  it("moves between scenes with the arrow keys, Home and End", async () => {
    const user = userEvent.setup();
    renderHero();

    tab("La mirada").focus();
    await user.keyboard("{ArrowRight}");
    expect(tab("Estudiantes").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tab("Estudiantes"));
    expect(screen.getByRole("heading", { name: "Su mirada, sus propias decisiones" })).toBeTruthy();

    await user.keyboard("{End}");
    expect(tab("Docentes").getAttribute("aria-selected")).toBe("true");

    // From the last one, the right arrow goes back to the first.
    await user.keyboard("{ArrowRight}");
    expect(tab("La mirada").getAttribute("aria-selected")).toBe("true");

    await user.keyboard("{ArrowLeft}");
    expect(tab("Docentes").getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{Home}");
    expect(tab("La mirada").getAttribute("aria-selected")).toBe("true");
  });

  it("can be paused and shows the scene of the tab that gets clicked", async () => {
    const user = userEvent.setup();
    renderHero();

    await user.click(screen.getByRole("button", { name: "Pausar el carrusel" }));
    expect(screen.getByRole("button", { name: "Reanudar el carrusel" })).toBeTruthy();

    await user.click(tab("Familia"));
    expect(screen.getByRole("heading", { name: "De la mano, desde el primer vistazo" })).toBeTruthy();
  });

  it("doesn't play by itself when the person asked for less movement", () => {
    stubReducedMotion(true);
    renderHero();

    expect(screen.queryByRole("button", { name: "Pausar el carrusel" })).toBeNull();
    expect(screen.getAllByRole("tab")).toHaveLength(4);
  });
});
