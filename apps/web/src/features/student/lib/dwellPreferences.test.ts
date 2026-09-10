import { beforeEach, describe, expect, it } from "vitest";
import {
  calculateAverageDwellMs,
  saveDwellDurationMs,
  getDwellDurationMs,
  markTourSeen,
  isTourSeen,
} from "./dwellPreferences";

describe("calculateAverageDwellMs", () => {
  it("devuelve 0 si no hay mediciones", () => {
    expect(calculateAverageDwellMs([])).toBe(0);
  });

  it("promedia y redondea las mediciones", () => {
    expect(calculateAverageDwellMs([800, 900, 1000])).toBe(900);
  });

  it("redondea al entero más cercano cuando el promedio no es exacto", () => {
    expect(calculateAverageDwellMs([700, 800])).toBe(750);
    expect(calculateAverageDwellMs([701, 800])).toBe(751);
  });

  it("funciona con una sola medición", () => {
    expect(calculateAverageDwellMs([1234])).toBe(1234);
  });
});

describe("preferencias en localStorage", () => {
  const subjectId = "estudiante-1";

  beforeEach(() => {
    window.localStorage.clear();
  });

  it("el recorrido no está visto por defecto", () => {
    expect(isTourSeen(subjectId)).toBe(false);
  });

  it("marca y recuerda el recorrido como visto", () => {
    markTourSeen(subjectId);
    expect(isTourSeen(subjectId)).toBe(true);
  });

  it("no confunde perfiles distintos", () => {
    markTourSeen(subjectId);
    expect(isTourSeen("otro-estudiante")).toBe(false);
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
