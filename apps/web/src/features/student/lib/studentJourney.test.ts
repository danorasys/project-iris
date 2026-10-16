import { afterEach, describe, expect, it } from "vitest";
import { isTourDone, markDeviceReady, markTourDone, routeAfterPin, routeIntoKids } from "./studentJourney";

const kid = "kid-1";

afterEach(() => localStorage.clear());

describe("the way a kid enters IRIS", () => {
  it("the first time on a device: conditions and camera before calibrating", () => {
    expect(routeIntoKids()).toBe("/kids/setup-conditions");
  });

  it("the other times: straight to calibrate, before the profiles", () => {
    markDeviceReady();
    expect(routeIntoKids()).toBe("/kids/calibration");
  });

  it("after the PIN: the tour the first time, then home", () => {
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
