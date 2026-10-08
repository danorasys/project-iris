import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LandingPage from "./LandingPage";

// jsdom has no IntersectionObserver nor matchMedia, so the test gives
// simple ones: nothing is observed and "less movement" is off.
class FakeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LandingPage", () => {
  // The menu and the hero jump to the sections with #anchors. If a section's
  // id changes and a link doesn't, the click just does nothing.
  it("every #link goes to a section that is on the page", () => {
    const { container } = render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    const anchors = [...container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')]
      .map((link) => link.getAttribute("href")!.slice(1))
      .filter(Boolean);

    expect(anchors.length).toBeGreaterThan(0);
    for (const id of new Set(anchors)) {
      expect(document.getElementById(id), `#${id}`).not.toBeNull();
    }
  });

  it("each section is named by its own heading", () => {
    const { container } = render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    for (const section of container.querySelectorAll("section[aria-labelledby]")) {
      const headingId = section.getAttribute("aria-labelledby")!;
      expect(document.getElementById(headingId), headingId).not.toBeNull();
    }
  });
});
