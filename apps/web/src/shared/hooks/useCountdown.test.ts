import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCountdown } from "./useCountdown";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useCountdown", () => {
  it("starts at 0 and does nothing until start is called", () => {
    const { result } = renderHook(() => useCountdown());
    expect(result.current.remaining).toBe(0);
  });

  it("counts down every second and stops at 0", () => {
    const { result } = renderHook(() => useCountdown());

    act(() => result.current.start(3));
    expect(result.current.remaining).toBe(3);

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.remaining).toBe(2);

    act(() => vi.advanceTimersByTime(2500));
    expect(result.current.remaining).toBe(0);
  });

  it("can be started again after it ends", () => {
    const { result } = renderHook(() => useCountdown());
    act(() => result.current.start(1));
    act(() => vi.advanceTimersByTime(1500));
    expect(result.current.remaining).toBe(0);

    act(() => result.current.start(5));
    expect(result.current.remaining).toBe(5);
  });
});
