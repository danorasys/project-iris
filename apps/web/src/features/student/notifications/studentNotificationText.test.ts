import { describe, expect, it } from "vitest";
import type { NotificationItem } from "@iris/shared-types";
import {
  messagePages,
  notificationMessage,
  notificationSnippet,
  notificationSubject,
  senderOf,
} from "./studentNotificationText";

const base = {
  id: "n1",
  classroom_id: "c1",
  enrollment_id: "e1",
  student_id: "s1",
  student_name: "Sofía",
  classroom_name: "Ciencias naturales",
  sender_name: "Laura Gómez",
  read: false,
  created_at: "2026-10-08T15:42:00Z",
};

const lesson = { lesson_id: "l1", lesson_title: "Animales acuáticos", extra_title: null };

describe("the kid's notification texts", () => {
  it("shows the teacher's message as they wrote it", () => {
    const n: NotificationItem = {
      ...base,
      event: "teacher.message",
      subject: "¡Muy bien!",
      body: "Te fue muy bien en la actividad.",
      addressee: "student",
    };

    expect(notificationSubject(n)).toBe("¡Muy bien!");
    expect(notificationMessage(n)).toBe("Te fue muy bien en la actividad.");
    expect(senderOf(n)).toBe("Laura Gómez");
  });

  it("tells about a new lesson and a new extra in simple words", () => {
    const published: NotificationItem = { ...base, ...lesson, event: "lesson.published" };
    const extra: NotificationItem = { ...base, ...lesson, event: "extra.published", extra_title: "La granja" };

    expect(notificationSubject(published)).toBe("¡Hay una lección nueva!");
    expect(notificationMessage(published)).toBe(
      'Laura Gómez publicó la lección "Animales acuáticos" en Ciencias naturales. ¡Ya puedes verla cuando quieras!',
    );
    expect(notificationMessage(extra)).toContain('dejó "La granja" para ti');
  });

  it("cuts the snippet and the pages between words", () => {
    const long = Array.from({ length: 60 }, (_, i) => `palabra${i}`).join(" ");
    const n: NotificationItem = { ...base, event: "teacher.message", subject: "x", body: long, addressee: "student" };

    expect(notificationSnippet(n, 30)).toMatch(/…$/);
    const pages = messagePages(long, 100);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((page) => page.length <= 100)).toBe(true);
    expect(pages.join(" ")).toBe(long);
    expect(messagePages("")).toEqual([""]);
  });
});
