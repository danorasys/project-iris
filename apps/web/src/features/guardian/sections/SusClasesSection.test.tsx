import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { FamilyClassroom } from "@iris/shared-types";
import { ApiError } from "@/shared/api/httpClient";
import { SusClasesSection } from "./SusClasesSection";

function classOf(studentId: string, name: string, extra: Partial<FamilyClassroom> = {}): FamilyClassroom {
  return {
    enrollment_id: `${studentId}-${name}`,
    student_id: studentId,
    student_first_name: "Sofía",
    status: "aceptada",
    requested_at: "2026-10-04T10:00:00Z",
    classroom_id: `c-${name}`,
    name,
    description: "Sumas, restas y problemas de la tienda.",
    color: "green",
    area: "mathematics",
    grade: 2,
    area_other: null,
    teacher_name: "Laura Gómez",
    published_lessons: 3,
    ...extra,
  };
}

let classes: FamilyClassroom[] = [];
let familyError: unknown = null;

vi.mock("@/shared/api/hooks/useClassroomsApi", () => ({
  useFamilyClassrooms: () => ({ data: classes, isLoading: false, isError: Boolean(familyError), error: familyError }),
}));

function renderClasses() {
  return render(
    <MemoryRouter initialEntries={["/guardian/portal"]}>
      <Routes>
        <Route path="/guardian/portal" element={<SusClasesSection studentId="s1" firstName="Sofía" />} />
        <Route path="/guardian/verify-2fa" element={<p>Pantalla del código</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  classes = [];
  familyError = null;
});

describe("SusClasesSection", () => {
  it("lists every class of the kid, the ones waiting first, with teacher and lessons", () => {
    classes = [
      classOf("s1", "Matemáticas"),
      classOf("s1", "Arte", { published_lessons: 1, area: "arts" }),
      classOf("s1", "Ciencias", { status: "pendiente", area: "natural_sciences" }),
      classOf("s2", "Lenguaje"),
    ];
    renderClasses();

    const rows = within(screen.getByRole("region", { name: "Clases de Sofía" })).getAllByRole("listitem");
    // Only Sofía's, and the request waiting goes first.
    expect(rows.map((row) => row.querySelector("p")?.textContent)).toEqual(["Ciencias", "Matemáticas", "Arte"]);
    expect(within(rows[0]).getByText("Esperando respuesta")).toBeTruthy();
    expect(within(rows[1]).getByText("Matemáticas · 2.° · con Laura Gómez")).toBeTruthy();
    expect(within(rows[1]).getByText("3 lecciones")).toBeTruthy();
    expect(within(rows[2]).getByText("1 lección")).toBeTruthy();
  });

  it("says a class has no lessons yet instead of 0 lecciones", () => {
    classes = [classOf("s1", "Arte", { published_lessons: 0 })];
    renderClasses();

    expect(screen.getByText("Aún sin lecciones")).toBeTruthy();
  });

  it("explains how to join a class when the kid has none", () => {
    classes = [classOf("s2", "Lenguaje")];
    renderClasses();

    expect(screen.getByText("Sofía aún no está en ninguna clase")).toBeTruthy();
    expect(screen.getByText(/código de ingreso/)).toBeTruthy();
  });

  it("goes to the code screen when the portal closed", () => {
    familyError = new ApiError(403, "acceso_portal_requerido", "Confirma tu código");
    renderClasses();

    expect(screen.getByText("Pantalla del código")).toBeTruthy();
  });
});
