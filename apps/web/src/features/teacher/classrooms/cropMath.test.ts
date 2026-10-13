import { describe, expect, it } from "vitest";
import { clamp, FRAME, isStart, MAX_ZOOM, scaleFor, START, turnedSize, zoomAround } from "./cropMath";

// A wide picture: 800 x 400.
const wide = { naturalWidth: 800, naturalHeight: 400 };

describe("the math of the logo's crop", () => {
  it("at zoom 1 the picture just covers the frame by its short side", () => {
    expect(400 * scaleFor(wide, START)).toBe(FRAME);
    expect(800 * scaleFor(wide, START)).toBe(FRAME * 2);
  });

  it("never lets the frame show an empty border", () => {
    // It can only slide sideways, half of what's left over.
    const moved = clamp({ ...START, x: 999, y: 999 }, wide);
    expect(moved.x).toBe(FRAME / 2);
    expect(moved.y).toBe(0);
  });

  it("turned a quarter, the sides swap", () => {
    expect(turnedSize(wide, 90)).toEqual({ width: 400, height: 800 });
    const moved = clamp({ ...START, rotation: 90, x: 999, y: 999 }, wide);
    expect(moved.x).toBe(0);
    expect(moved.y).toBe(FRAME / 2);
  });

  it("zooms towards the pointer, keeping that point still", () => {
    const anchor = { x: 40, y: 20 };
    const zoomed = zoomAround(START, 2, wide, anchor);
    // The point under the pointer was 40 and 20 from the picture's center,
    // at twice the size it's 80 and 40: the center moved the other way.
    expect(zoomed.zoom).toBe(2);
    expect(zoomed.x).toBe(-40);
    expect(zoomed.y).toBe(-20);
  });

  it("knows when there's nothing to start over", () => {
    expect(isStart({ ...START })).toBe(true);
    expect(isStart({ ...START, flipped: true })).toBe(false);
  });

  it("keeps the zoom between 1 and the most allowed", () => {
    expect(zoomAround(START, 0.2, wide).zoom).toBe(1);
    expect(zoomAround(START, 99, wide).zoom).toBe(MAX_ZOOM);
  });
});
