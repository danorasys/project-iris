import { afterEach, describe, expect, it } from "vitest";
import { setInputMode } from "@/shared/gaze/inputMode";
import { isTourDone, markProfileReady, markTourDone, routeAfterCalibration, routeAfterPin } from "./studentJourney";

const kid = "kid-1";

afterEach(() => localStorage.clear());

describe("the way a kid enters IRIS", () => {
  it("the first time with the gaze: conditions, camera, calibration, tour", () => {
    expect(routeAfterPin(kid)).toBe("/student/setup-conditions");
    expect(routeAfterCalibration(kid)).toBe("/student/tour");
  });

  it("the other times with the gaze: calibrate this session, then home", () => {
    markProfileReady(kid);
    markTourDone(kid);

    expect(routeAfterPin(kid)).toBe("/student/calibration");
    expect(routeAfterCalibration(kid)).toBe("/student/home");
  });

  it("with the mouse or the keyboard there's nothing to calibrate", () => {
    setInputMode("keyboard");
    expect(routeAfterPin(kid)).toBe("/student/tour");

    markTourDone(kid);
    expect(routeAfterPin(kid)).toBe("/student/home");
  });

  it("a tour seen in an older version counts, and each profile goes apart", () => {
    localStorage.setItem(`iris_recorrido_visto_${kid}`, "1");

    expect(isTourDone(kid)).toBe(true);
    expect(isTourDone("kid-2")).toBe(false);
  });
});
