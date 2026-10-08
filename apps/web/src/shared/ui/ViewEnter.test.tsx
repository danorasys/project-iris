import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ViewEnter } from "./ViewEnter";

// jsdom can't animate, so animate() is a spy that keeps the first frame of
// each entrance: that's enough to know which way the view came in.
let entrances: Keyframe[] = [];
let lessMotion = false;

beforeEach(() => {
  entrances = [];
  lessMotion = false;
  Element.prototype.animate = vi.fn(function (frames: Keyframe[]) {
    entrances.push(frames[0]);
    return { cancel() {} } as Animation;
  }) as unknown as typeof Element.prototype.animate;
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: lessMotion, media: query }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Element.prototype, "animate");
});

function show(view: string, level: number) {
  return (
    <ViewEnter view={view} level={level}>
      <p>{view}</p>
    </ViewEnter>
  );
}

describe("ViewEnter", () => {
  it("doesn't play on the first view, only when it changes", () => {
    const { rerender } = render(show("list", 0));
    expect(entrances).toHaveLength(0);

    rerender(show("list", 0));
    expect(entrances).toHaveLength(0);
  });

  it("deeper comes from the right, back from the left, same level fades with a zoom", () => {
    const { rerender } = render(show("list", 0));

    rerender(show("kid", 1));
    rerender(show("list", 0));
    rerender(show("other-list", 0));

    expect(entrances.map((frame) => frame.transform)).toEqual(["translateX(24px)", "translateX(-24px)", "scale(0.98)"]);
  });

  // An opened notification gets its place in the tray a bit later. "Back"
  // from there has to start at that place, not at the old level.
  it("keeps a new level of the same view for the next change", () => {
    const { rerender } = render(show("tray", 0));
    rerender(show("mail-a", 1));
    rerender(show("mail-a", 5));

    rerender(show("mail-b", 4));

    expect(entrances.at(-1)?.transform).toBe("translateX(-24px)");
  });

  it("stays still when the person asked for less motion", () => {
    lessMotion = true;
    const { rerender } = render(show("list", 0));

    rerender(show("kid", 1));

    expect(entrances).toHaveLength(0);
  });
});
