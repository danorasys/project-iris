import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { LessonProgress, PartProgress } from "@iris/shared-types";
import { ApiError } from "@/shared/api/httpClient";
import { ClassStructure } from "./ClassStructure";

function part(extra: Partial<PartProgress> = {}): PartProgress {
  return {
    extra_id: null,
    title: "Animales terrestres",
    kind: "leccion",
    total_pages: 3,
    pages_seen: 0,
    has_activity: true,
    attempts: [],
    percent: 0,
    ...extra,
  };
}

function lesson(title: string, unit: string, extra: Partial<LessonProgress> = {}): LessonProgress {
  return {
    lesson_id: title,
    title,
    unit_title: unit,
    unit_guiding_question: `¿Qué sabemos de ${unit.toLowerCase()}?`,
    unit_learning_goal: `Explico qué sé de ${unit.toLowerCase()}.`,
    purpose: `Hoy vas a conocer ${title.toLowerCase()}.`,
    learning_goal: `Reconozco ${title.toLowerCase()}.`,
    unit_dba: null,
    main: part({ title }),
    extras: [],
    ...extra,
  };
}

let data: LessonProgress[] | undefined;
let error: unknown = null;

vi.mock("@/shared/api/hooks/useClassroomsApi", () => ({
  useFamilyProgress: () => ({ data, isLoading: false, isError: Boolean(error), error }),
}));

function renderStructure() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<ClassStructure enrollmentId="e1" firstName="Sofía" />} />
        <Route path="/guardian/verify-2fa" element={<p>Pantalla del código</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  data = undefined;
  error = null;
});

describe("the structure of a class, for the family", () => {
  it("shows each unit with its guiding question and its lessons numbered across the class", () => {
    data = [
      lesson("Animales terrestres", "Los animales"),
      lesson("Animales acuáticos", "Los animales"),
      lesson("Las flores", "Las plantas"),
    ];
    renderStructure();

    expect(screen.getByText(/^Tiene/).textContent).toContain("2 unidades con 3 lecciones");
    // The card on top says what each unit and each lesson tells.
    const overview = screen.getByRole("region", { name: "Cómo está organizada la clase" });
    expect(within(overview).getByText("Lo que Sofía debería lograr con ella")).toBeTruthy();
    expect(within(overview).getByText("Qué debería lograr al terminarla")).toBeTruthy();
    const [animals, plants] = screen.getAllByRole("region", { name: /^Los animales|^Las plantas/ });
    expect(within(animals).getByText("Unidad 1")).toBeTruthy();
    expect(within(animals).getByText("¿Qué sabemos de los animales?")).toBeTruthy();
    // And what the kid should manage with the whole unit.
    expect(within(animals).getByText("Qué debería lograr Sofía con esta unidad")).toBeTruthy();
    expect(within(animals).getByText("Explico qué sé de los animales.")).toBeTruthy();
    expect(
      within(animals)
        .getAllByRole("heading", { level: 4 })
        .map((h) => h.textContent),
    ).toEqual(["Animales terrestres", "Animales acuáticos"]);
    // The numbers go on in the next unit.
    expect(within(plants).getByText("Unidad 2")).toBeTruthy();
    expect(within(plants).getByText("Lección 3")).toBeTruthy();
  });

  it("says what each lesson is for, what the kid should manage and its moments", () => {
    data = [
      lesson("Animales terrestres", "Los animales", {
        unit_dba: {
          own: false,
          id: "natural_sciences-1-3",
          subject: "natural_sciences",
          grade: 1,
          number: 3,
          name: "Seres vivos y objetos sin vida",
          points: [
            { evidence_id: "natural_sciences-1-3-3", text: "Nombra las partes de una planta." },
            { evidence_id: null, text: "Reconoce animales terrestres de su región." },
          ],
        },
        extras: [part({ extra_id: "x1", title: "Juego", kind: "actividad" })],
      }),
    ];
    renderStructure();

    expect(screen.getByText("Propósito")).toBeTruthy();
    expect(screen.getByText("Hoy vas a conocer animales terrestres.")).toBeTruthy();
    expect(screen.getByText("Qué debería lograr Sofía")).toBeTruthy();
    expect(screen.getByText("Reconozco animales terrestres.")).toBeTruthy();
    // The card on top spells out what DBA means.
    expect(screen.getByText("Su Derecho Básico de Aprendizaje (DBA) y sus Evidencias de Aprendizaje")).toBeTruthy();
    // The DBA goes with the unit, with its Evidencias de Aprendizaje.
    const unitHead = screen.getByRole("heading", { name: "Los animales" }).closest("header") as HTMLElement;
    expect(within(unitHead).getByText("Derecho Básico de Aprendizaje de la unidad")).toBeTruthy();
    expect(within(unitHead).getByText("DBA 3 · Ciencias naturales · 1.°: Seres vivos y objetos sin vida")).toBeTruthy();
    expect(within(unitHead).getByText("Evidencias de Aprendizaje")).toBeTruthy();
    expect(within(unitHead).getByText("Nombra las partes de una planta.")).toBeTruthy();
    expect(within(unitHead).getByText("Reconoce animales terrestres de su región.")).toBeTruthy();
    // The lesson no longer repeats them.
    expect(screen.queryByText("Lo que trabaja del DBA de la unidad")).toBeNull();
    // To read the official text in the MEN's own document.
    const link = screen.getByRole("link", {
      name: "Ver el texto oficial de los DBA de Ciencias naturales del Ministerio de Educación",
    });
    expect(link.getAttribute("href")).toContain("colombiaaprende.edu.co");
    expect(link.getAttribute("target")).toBe("_blank");
    const moments = screen.getByRole("list", { name: "Momentos de Animales terrestres" });
    expect(
      within(moments)
        .getAllByRole("listitem")
        .map((m) => m.textContent),
    ).toEqual(["Inicio", "Contenido · 3 páginas", "Actividad", "Actividad extra: Juego"]);
  });

  it("shows a unit's DBA the teacher wrote as their own, without the MEN's link", () => {
    data = [
      lesson("Animales terrestres", "Los animales", {
        unit_dba: {
          own: true,
          id: null,
          subject: null,
          grade: null,
          number: null,
          name: "Cuido los animales de mi casa.",
          points: [{ evidence_id: null, text: "Sabe qué come su mascota." }],
        },
      }),
    ];
    renderStructure();

    expect(screen.getByText("DBA propio del docente: Cuido los animales de mi casa.")).toBeTruthy();
    expect(screen.getByText("Sabe qué come su mascota.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Ver el texto oficial/ })).toBeNull();
  });

  it("leaves out what an older content-service didn't send", () => {
    data = [
      lesson("Animales terrestres", "Los animales", {
        unit_guiding_question: "",
        unit_learning_goal: "",
        purpose: "",
        learning_goal: "",
        main: part({ has_activity: false, total_pages: 1 }),
      }),
    ];
    renderStructure();

    expect(screen.queryByText("Pregunta guía")).toBeNull();
    expect(screen.queryByText(/con esta unidad/)).toBeNull();
    expect(screen.queryByText("Derecho Básico de Aprendizaje")).toBeNull();
    expect(screen.queryByText("Propósito")).toBeNull();
    const moments = screen.getByRole("list", { name: "Momentos de Animales terrestres" });
    expect(
      within(moments)
        .getAllByRole("listitem")
        .map((m) => m.textContent),
    ).toEqual(["Inicio", "Contenido · 1 página"]);
  });

  it("says when there's nothing published yet", () => {
    data = [];
    renderStructure();

    expect(screen.getByText(/todavía no tiene lecciones publicadas/)).toBeTruthy();
  });

  it("goes to the code screen when the portal access ran out", () => {
    error = new ApiError(403, "acceso_portal_requerido", "x");
    renderStructure();

    expect(screen.getByText("Pantalla del código")).toBeTruthy();
  });
});
