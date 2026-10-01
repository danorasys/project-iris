import { afterEach, describe, expect, it, vi } from "vitest";
import { removeLegacySessionData } from "./legacyStorage";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("removeLegacySessionData", () => {
  it("removes the refresh token and the tutor email left by older versions", () => {
    localStorage.setItem("iris_refresh_token", "old-token");
    localStorage.setItem("iris_tutor_correo_reciente", "tutor@example.com");

    removeLegacySessionData();

    expect(localStorage.getItem("iris_refresh_token")).toBeNull();
    expect(localStorage.getItem("iris_tutor_correo_reciente")).toBeNull();
  });

  it("doesn't break when the browser blocks the storage", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    expect(() => removeLegacySessionData()).not.toThrow();
  });
});
