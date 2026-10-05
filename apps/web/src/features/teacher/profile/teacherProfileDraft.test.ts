import { describe, expect, it } from "vitest";
import type { TeacherProfile } from "@iris/shared-types";
import {
  draftFromProfile,
  emptyExperience,
  emptyProfileDraft,
  emptyStudy,
  entryErrors,
  firstOpenEntry,
  experienceRangeError,
  isDraftEmpty,
  profileDraftErrors,
  profileFromDraft,
  sortExperiences,
  sortStudies,
  type ProfileDraft,
} from "./teacherProfileDraft";

// A fixed "today", so the tests don't change with the date.
const today = new Date(2026, 9, 3);

function withStudy(change: object): ProfileDraft {
  return {
    ...emptyProfileDraft(),
    studies: [{ ...emptyStudy(), level: "professional", title: "Licenciatura", institution: "UPB", endMonth: "11", endYear: "2015", ...change }],
  };
}

function withJob(change: object): ProfileDraft {
  return {
    ...emptyProfileDraft(),
    experiences: [
      { ...emptyExperience(), role: "Docente", place: "Colegio", startMonth: "2", startYear: "2016", current: true, ...change },
    ],
  };
}

function onlyMessages(draft: ProfileDraft): string[] {
  return Object.values(profileDraftErrors(draft, today));
}

describe("profileDraftErrors", () => {
  it("accepts an empty profile, everything is optional", () => {
    expect(profileDraftErrors(emptyProfileDraft(), today)).toEqual({});
  });

  it("checks how long the presentation is", () => {
    expect(onlyMessages({ ...emptyProfileDraft(), about: "x".repeat(2000) })).toEqual([]);
    expect(onlyMessages({ ...emptyProfileDraft(), about: "x".repeat(2001) })).toEqual([
      "Tu presentación puede tener máximo 2.000 caracteres.",
    ]);
  });

  it("checks the fields of a study", () => {
    expect(onlyMessages(withStudy({ level: "" }))).toEqual(["Elige el nivel del estudio."]);
    expect(onlyMessages(withStudy({ title: "   " }))).toEqual(["Escribe el título del estudio."]);
    const missing = ["Elige el mes y escribe el año en que terminaste, o marca que está en curso."];
    expect(onlyMessages(withStudy({ endYear: "" }))).toEqual(missing);
    expect(onlyMessages(withStudy({ endMonth: "" }))).toEqual(missing);
    // "Today" is October 2026: November is still to come, October isn't.
    expect(onlyMessages(withStudy({ endMonth: "11", endYear: "2026" }))).toEqual([
      "Si aún no terminas, marca que está en curso.",
    ]);
    expect(onlyMessages(withStudy({ endMonth: "10", endYear: "2026" }))).toEqual([]);
    expect(onlyMessages(withStudy({ endYear: "1900" }))).toEqual(["Revisa el año."]);
    expect(onlyMessages(withStudy({ endMonth: "", endYear: "", inProgress: true }))).toEqual([]);
  });

  it("lets a job's description be up to 2.000 characters", () => {
    expect(onlyMessages(withJob({ description: "x".repeat(2000) }))).toEqual([]);
    expect(onlyMessages(withJob({ description: "x".repeat(2001) }))).toEqual(["Usa máximo 2.000 caracteres."]);
  });

  it("checks the dates of a job", () => {
    expect(onlyMessages(withJob({ startMonth: "" }))).toEqual(["Elige el mes y escribe el año en que empezaste."]);
    expect(onlyMessages(withJob({ startMonth: "11", startYear: "2026" }))).toEqual(["La fecha no puede ser futura."]);
    expect(onlyMessages(withJob({ current: false }))).toEqual(["Elige el mes y escribe el año en que terminaste."]);
    expect(onlyMessages(withJob({ current: false, endMonth: "1", endYear: "2016" }))).toEqual([
      "La fecha de fin no puede ser anterior a la de inicio.",
    ]);
    expect(onlyMessages(withJob({ current: false, endMonth: "10", endYear: "2026" }))).toEqual([]);
  });

  it("lists a study's errors in the card's order, institution first", () => {
    const draft: ProfileDraft = { ...emptyProfileDraft(), studies: [emptyStudy()] };
    const key = draft.studies[0].key;
    expect(Object.keys(profileDraftErrors(draft, today))).toEqual([
      `study-${key}-institution`,
      `study-${key}-title`,
      `study-${key}-level`,
      `study-${key}-end`,
    ]);
  });

  it("keys each error by the entry, so it lands on the right field", () => {
    const draft = withStudy({ title: "" });
    const key = draft.studies[0].key;
    expect(Object.keys(profileDraftErrors(draft, today))).toEqual([`study-${key}-title`]);
  });
});

describe("experienceRangeError", () => {
  const job = { ...emptyExperience(), startMonth: "5", startYear: "2020", endMonth: "1", endYear: "2020" };

  it("catches an end before the start", () => {
    expect(experienceRangeError(job)).toBe("La fecha de fin no puede ser anterior a la de inicio.");
  });

  it("lets the same month and a later one go", () => {
    expect(experienceRangeError({ ...job, endMonth: "5" })).toBeNull();
    expect(experienceRangeError({ ...job, endYear: "2021" })).toBeNull();
  });

  it("waits until both dates are complete, and ignores a current job", () => {
    expect(experienceRangeError({ ...job, endYear: "20" })).toBeNull();
    expect(experienceRangeError({ ...job, startMonth: "" })).toBeNull();
    expect(experienceRangeError({ ...job, current: true })).toBeNull();
  });
});

describe("sortStudies", () => {
  const study = (title: string, change: object) => ({ ...emptyStudy(), title, ...change });

  it("puts what's in progress first, then the newest, and the higher level on a tie", () => {
    const studies = [
      study("Técnico", { level: "technical", endMonth: "11", endYear: "2010" }),
      study("Tecnólogo", { level: "technologist", inProgress: true }),
      study("Especialización", { level: "specialization", endMonth: "6", endYear: "2018" }),
      study("Doctorado", { level: "doctorate", inProgress: true }),
      study("Maestría", { level: "masters", endMonth: "6", endYear: "2018" }),
      study("Licenciatura", { level: "professional", endMonth: "12", endYear: "2018" }),
    ];

    expect(sortStudies(studies).map((s) => s.title)).toEqual([
      "Doctorado",
      "Tecnólogo",
      "Licenciatura",
      "Maestría",
      "Especialización",
      "Técnico",
    ]);
  });

  it("leaves a study still being filled in after the complete ones, and doesn't touch the list it got", () => {
    const studies = [study("Sin datos", {}), study("Licenciatura", { level: "professional", endMonth: "3", endYear: "2015" })];

    expect(sortStudies(studies).map((s) => s.title)).toEqual(["Licenciatura", "Sin datos"]);
    expect(studies[0].title).toBe("Sin datos");
  });
});

describe("sortExperiences", () => {
  const job = (role: string, change: object) => ({ ...emptyExperience(), role, ...change });

  it("puts the current jobs first, then the latest end, and the later start on a tie", () => {
    const jobs = [
      job("Tutor", { startMonth: "1", startYear: "2010", endMonth: "6", endYear: "2012" }),
      job("Docente", { startMonth: "2", startYear: "2015", current: true }),
      job("Coordinador", { startMonth: "1", startYear: "2013", endMonth: "11", endYear: "2019" }),
      job("Rector", { startMonth: "3", startYear: "2021", current: true }),
      job("Auxiliar", { startMonth: "5", startYear: "2017", endMonth: "11", endYear: "2019" }),
    ];

    expect(sortExperiences(jobs).map((j) => j.role)).toEqual(["Rector", "Docente", "Auxiliar", "Coordinador", "Tutor"]);
  });
});

describe("entryErrors", () => {
  it("gives only the errors of the card asked for", () => {
    const draft: ProfileDraft = { ...emptyProfileDraft(), studies: [emptyStudy(), emptyStudy()] };
    const [first, second] = draft.studies.map((s) => s.key);

    const found = Object.keys(entryErrors(draft, first, today));
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((field) => field.startsWith(`study-${first}-`))).toBe(true);
    expect(found.some((field) => field.includes(second))).toBe(false);
  });
});

describe("firstOpenEntry", () => {
  it("points at the check of the first open card, studies before jobs", () => {
    const study = { ...emptyStudy(), editing: false };
    const job = emptyExperience();
    const draft: ProfileDraft = { ...emptyProfileDraft(), studies: [study], experiences: [job] };

    expect(firstOpenEntry(draft)).toBe(`experience-${job.key}-confirm`);
    expect(firstOpenEntry({ ...draft, studies: [{ ...study, editing: true }] })).toBe(`study-${study.key}-confirm`);
    expect(firstOpenEntry({ ...draft, experiences: [{ ...job, editing: false }] })).toBeNull();
  });

  it("starts new cards open and saved ones confirmed", () => {
    expect(emptyStudy().editing).toBe(true);
    const loaded = draftFromProfile({
      about: null,
      studies: [{ level: "masters", title: "Maestría", institution: "UIS", end_month: null, in_progress: true }],
      experiences: [],
    });
    expect(loaded.studies[0].editing).toBe(false);
  });
});

describe("profileFromDraft", () => {
  it("trims and leaves out empty texts", () => {
    const draft: ProfileDraft = {
      about: "  Hola  ",
      studies: [{ ...emptyStudy(), level: "masters", title: " Maestría ", institution: "UIS", endMonth: "", endYear: "", inProgress: true }],
      experiences: [
        {
          ...emptyExperience(),
          role: "Tutor",
          place: "Clases particulares",
          startMonth: "1",
          startYear: "2014",
          endMonth: "12",
          endYear: "2015",
          description: "   ",
        },
      ],
    };

    expect(profileFromDraft(draft)).toEqual({
      about: "Hola",
      studies: [{ level: "masters", title: "Maestría", institution: "UIS", end_month: null, in_progress: true }],
      experiences: [
        { role: "Tutor", place: "Clases particulares", start_month: "2014-01", end_month: "2015-12", description: null },
      ],
    });
  });

  it("goes back to the same profile it was loaded from", () => {
    const profile: TeacherProfile = {
      about: "Docente de primaria",
      studies: [{ level: "professional", title: "Licenciatura", institution: "UPB", end_month: "2015-11", in_progress: false }],
      experiences: [
        { role: "Docente", place: "Colegio", start_month: "2016-02", end_month: null, description: "Primaria" },
      ],
    };

    expect(profileFromDraft(draftFromProfile(profile))).toEqual(profile);
  });
});

describe("isDraftEmpty", () => {
  it("knows when nothing was filled in", () => {
    expect(isDraftEmpty({ ...emptyProfileDraft(), about: "   " })).toBe(true);
    expect(isDraftEmpty({ ...emptyProfileDraft(), studies: [emptyStudy()] })).toBe(false);
  });
});
