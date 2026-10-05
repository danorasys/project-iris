import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Toast } from "./Toast";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Toast", () => {
  it("is announced, then goes away with its animation before closing", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast message="Tus datos se guardaron correctamente." onDismiss={onDismiss} durationMs={1000} />);

    const toast = screen.getByRole("status");
    expect(toast.textContent).toBe("Tus datos se guardaron correctamente.");

    act(() => vi.advanceTimersByTime(1000));
    // Leaving: still on screen while it slides down.
    expect(toast.className).toMatch(/leaving/);
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(240));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
