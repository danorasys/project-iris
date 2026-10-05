import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TeacherProfileSummary } from "./TeacherProfileSummary";

afterEach(cleanup);

describe("TeacherProfileSummary", () => {
  it("shows the presentation, each study and each job with their dates", () => {
    render(
      <TeacherProfileSummary
        profile={{
          about: "Docente de primaria.\nMe gusta enseñar con juegos.",
          studies: [
            { level: "masters", title: "Maestría en Educación", institution: "UIS", end_month: null, in_progress: true },
            {
              level: "professional",
              title: "Licenciatura",
              institution: "UPB",
              end_month: "2015-11",
              in_progress: false,
            },
          ],
          experiences: [
            { role: "Rector", place: "Colegio C", start_month: "2021-03", end_month: null, description: null },
            {
              role: "Tutor",
              place: "Clases particulares",
              start_month: "2010-01",
              end_month: "2012-06",
              description: "Refuerzo escolar.",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText(/Me gusta enseñar con juegos/)).toBeTruthy();
    expect(screen.getByText("UIS · Maestría")).toBeTruthy();
    expect(screen.getByText("En curso")).toBeTruthy();
    expect(screen.getByText("Terminó en noviembre de 2015")).toBeTruthy();
    expect(screen.getByText("marzo de 2021 – actualidad")).toBeTruthy();
    expect(screen.getByText("enero de 2010 – junio de 2012")).toBeTruthy();
    expect(screen.getByText("Refuerzo escolar.")).toBeTruthy();
  });

  it("says when a part was left empty", () => {
    render(<TeacherProfileSummary profile={{ about: null, studies: [], experiences: [] }} />);

    expect(screen.getByText("Sin presentación.")).toBeTruthy();
    expect(screen.getByText("Sin estudios.")).toBeTruthy();
    expect(screen.getByText("Sin experiencia.")).toBeTruthy();
  });
});
