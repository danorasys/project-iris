import { beforeEach, describe, expect, it } from "vitest";
import { saveDwellDurationMs, getDwellDurationMs } from "./dwellPreferences";

describe("preferencias en localStorage", () => {
  const subjectId = "student-1";

  beforeEach(() => {
    window.localStorage.clear();
  });

  it("no hay duración de dwell guardada por defecto", () => {
    expect(getDwellDurationMs(subjectId)).toBeUndefined();
  });

  it("guarda y lee la duración de dwell redondeada", () => {
    saveDwellDurationMs(subjectId, 733.6);
    expect(getDwellDurationMs(subjectId)).toBe(734);
  });

  it("ignora un valor corrupto guardado directamente en localStorage", () => {
    window.localStorage.setItem("iris_dwell_ms_" + subjectId, "no-es-un-numero");
    expect(getDwellDurationMs(subjectId)).toBeUndefined();
  });
});
