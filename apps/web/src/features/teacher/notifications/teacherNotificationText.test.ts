import { describe, expect, it } from "vitest";
import type { NotificationItem } from "@iris/shared-types";
import { notificationMessage, notificationSubject, senderOf } from "./teacherNotificationText";

const base = {
  id: "n1",
  classroom_id: "c1",
  enrollment_id: "e1",
  student_id: "s1",
  student_name: "Sofía",
  classroom_name: "Matemáticas 3A",
  sender_name: "Ana Pérez",
  read: false,
  created_at: "2026-10-08T15:42:00Z",
};

describe("teacher notification texts", () => {
  it("tells who asked to join", () => {
    const n: NotificationItem = { ...base, event: "request.created" };

    expect(senderOf(n)).toBe("Ana Pérez");
    expect(notificationMessage(n)).toContain('Ana Pérez pidió que Sofía se una a la clase "Matemáticas 3A"');
  });

  it("tells that a family cancelled a request or took the kid out (HU-49)", () => {
    const cancelled: NotificationItem = { ...base, event: "request.cancelled" };
    const withdrawn: NotificationItem = { ...base, event: "enrollment.withdrawn" };

    expect(notificationSubject(cancelled)).toBe("Solicitud de ingreso cancelada");
    expect(notificationMessage(cancelled)).toContain("Ana Pérez canceló la solicitud de Sofía");
    expect(notificationSubject(withdrawn)).toBe("Un estudiante salió de la clase");
    expect(notificationMessage(withdrawn)).toContain('Ana Pérez retiró a Sofía de la clase "Matemáticas 3A"');
  });

  it("shows a family's message as they wrote it (HU-48)", () => {
    const n: NotificationItem = {
      ...base,
      event: "message.sent",
      subject: "Tarea de sumas",
      body: "Hola profe,\nSofía no pudo entrar ayer.",
    };

    expect(senderOf(n)).toBe("Ana Pérez");
    expect(notificationSubject(n)).toBe("Tarea de sumas");
    expect(notificationMessage(n)).toBe("Hola profe,\nSofía no pudo entrar ayer.");
  });

  it("what the teacher did themselves comes from IRIS", () => {
    const n: NotificationItem = { ...base, event: "request.resolved", decision: "aceptada" };

    expect(senderOf(n)).toBe("IRIS");
    expect(notificationMessage(n)).toContain("Aceptaste la solicitud de Sofía");
  });

  it("keeps a copy of the teacher's own message, saying who it went to (HU-77)", () => {
    const n: NotificationItem = {
      ...base,
      event: "teacher.message",
      subject: "Tarea",
      body: "Repasen la lección 2.",
      addressee: "guardian",
      read: true,
    };

    expect(senderOf(n)).toBe("Tú");
    expect(notificationSubject(n)).toBe("Tarea");
    expect(notificationMessage(n)).toBe("Para la familia de Sofía:\nRepasen la lección 2.");
    expect(notificationMessage({ ...n, addressee: "student" })).toMatch(/^Para Sofía:/);
  });

  it("tells what a kid finished, the activity with its score (HU-69)", () => {
    const lesson = { lesson_id: "l1", lesson_title: "Animales terrestres", sender_name: "Sofía" };
    const read: NotificationItem = {
      ...base,
      ...lesson,
      event: "lesson.content_completed",
      correct: null,
      total: null,
    };
    const done: NotificationItem = { ...base, ...lesson, event: "lesson.activity_completed", correct: 2, total: 3 };

    expect(senderOf(read)).toBe("Sofía");
    expect(notificationSubject(read)).toBe("Terminó de leer una lección");
    expect(notificationMessage(read)).toContain(
      'Sofía terminó de leer todo el contenido de la lección "Animales terrestres"',
    );
    expect(notificationMessage(done)).toContain("y acertó 2 de 3");
  });
});
