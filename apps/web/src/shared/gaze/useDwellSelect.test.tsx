import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { GazeSource, GazeSubscriber } from "./GazeSource";
import { GazeSourceProvider } from "./GazeSourceContext";
import { useDwellSelect } from "./useDwellSelect";

// A gaze source the test moves by hand, and a clock it controls.
function fakeSource() {
  const subscribers = new Set<GazeSubscriber>();
  const source: GazeSource = {
    start() {},
    stop() {},
    subscribe(cb) {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
  };
  const lookAt = (x: number, y: number) => act(() => subscribers.forEach((cb) => cb({ x, y })));
  return { source, lookAt, listeners: () => subscribers.size };
}

let now = 0;

function DwellButton({ onSelect, active }: { onSelect: () => void; active: boolean }) {
  const { ref, progress, focused } = useDwellSelect<HTMLButtonElement>({ onSelect, durationMs: 900, active });
  return (
    <button ref={ref} type="button">
      {`progress ${progress} focused ${focused}`}
    </button>
  );
}

function renderButton(source: GazeSource, onSelect: () => void, active = true) {
  const view = render(
    <GazeSourceProvider fuente={source}>
      <DwellButton onSelect={onSelect} active={active} />
    </GazeSourceProvider>,
  );
  const rerender = (nextActive: boolean) =>
    view.rerender(
      <GazeSourceProvider fuente={source}>
        <DwellButton onSelect={onSelect} active={nextActive} />
      </GazeSourceProvider>,
    );
  return { rerender };
}

beforeEach(() => {
  now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  // The button covers the square from (0, 0) to (100, 100).
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    right: 100,
    bottom: 100,
  } as DOMRect);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useDwellSelect", () => {
  it("selects once after the look holds on the button for the whole time", () => {
    const { source, lookAt } = fakeSource();
    const onSelect = vi.fn();
    renderButton(source, onSelect);

    lookAt(50, 50);
    now = 450;
    lookAt(50, 50);
    expect(screen.getByRole("button").textContent).toBe("progress 0.5 focused true");
    expect(onSelect).not.toHaveBeenCalled();

    now = 900;
    lookAt(50, 50);
    now = 1200;
    lookAt(50, 50);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("starts over when the look leaves the button", () => {
    const { source, lookAt } = fakeSource();
    const onSelect = vi.fn();
    renderButton(source, onSelect);

    lookAt(50, 50);
    now = 600;
    lookAt(50, 50);
    lookAt(300, 300);
    expect(screen.getByRole("button").textContent).toBe("progress 0 focused false");

    now = 1000;
    lookAt(50, 50);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("when it's turned off it stops listening and reads as empty", () => {
    const { source, lookAt, listeners } = fakeSource();
    const onSelect = vi.fn();
    const { rerender } = renderButton(source, onSelect);

    lookAt(50, 50);
    now = 600;
    lookAt(50, 50);
    rerender(false);

    expect(listeners()).toBe(0);
    expect(screen.getByRole("button").textContent).toBe("progress 0 focused false");

    // Turned back on, the dwell starts from the beginning.
    rerender(true);
    now = 700;
    lookAt(50, 50);
    expect(screen.getByRole("button").textContent).toBe("progress 0 focused true");
  });
});
