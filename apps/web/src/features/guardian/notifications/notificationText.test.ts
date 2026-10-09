import { describe, expect, it } from "vitest";
import type { NotificationItem } from "@iris/shared-types";
import { notificationMessage, notificationSubject, senderOf, studentOf } from "./notificationText";

const base = {
  id: "n1",
  classroom_id: "c1",
  enrollment_id: "e1",
  student_id: "s1",
  student_name: "Sofía",
  classroom_name: "Matemáticas 3A",
  sender_name: "Carlos Ruiz",
  read: false,
  created_at: "2026-10-03T15:42:00Z",
};

describe("notification texts", () => {
  // Only older trays have these: the family now sends the request themselves.
  it("tells that a request was sent", () => {
    const n: NotificationItem = { ...base, event: "request.created", sender_name: "Sofía" };

    expect(notificationSubject(n)).toBe("Solicitud de ingreso enviada");
    expect(notificationMessage(n)).toContain('Se envió la solicitud para que Sofía se una a la clase "Matemáticas 3A"');
  });

  it("tells who accepted and who didn't", () => {
    const accepted: NotificationItem = { ...base, event: "request.resolved", decision: "aceptada" };
    const rejected: NotificationItem = { ...base, event: "request.resolved", decision: "rechazada" };

    expect(notificationSubject(accepted)).toBe("Solicitud de ingreso aceptada");
    expect(notificationMessage(accepted)).toContain("Carlos Ruiz aceptó la solicitud de Sofía");
    expect(notificationSubject(rejected)).toBe("Solicitud de ingreso no aceptada");
    expect(notificationMessage(rejected)).toContain("Carlos Ruiz no aceptó la solicitud de Sofía");
  });

  it("tells that the teacher took the kid out of a class", () => {
    const n: NotificationItem = { ...base, event: "enrollment.removed" };

    expect(notificationSubject(n)).toBe("Retiro de una clase");
    expect(notificationMessage(n)).toContain('Carlos Ruiz retiró a Sofía de la clase "Matemáticas 3A"');
  });

  it("still reads well when names are missing", () => {
    const n: NotificationItem = {
      ...base,
      event: "request.resolved",
      decision: "aceptada",
      student_name: null,
      classroom_name: null,
      sender_name: null,
    };

    expect(notificationMessage(n)).toBe(
      "El docente aceptó la solicitud de tu peque para unirse a la clase. Desde ahora tu peque ya puede entrar a la clase y ver sus lecciones.",
    );
    expect(notificationMessage({ ...n, event: "request.created" })).toMatch(
      /^Se envió la solicitud para que tu peque se una a la clase\./,
    );
    expect(studentOf(n)).toBe("tu peque");
    expect(senderOf(n)).toBe("IRIS");
  });

  it("shows the teacher's message as they wrote it (HU-77)", () => {
    const n: NotificationItem = {
      ...base,
      event: "teacher.message",
      subject: "Reunión",
      body: "Hablemos el jueves.",
      addressee: "guardian",
    };

    expect(notificationSubject(n)).toBe("Reunión");
    expect(notificationMessage(n)).toBe("Hablemos el jueves.");
    expect(senderOf(n)).toBe("Carlos Ruiz");
  });

  it("tells about a new lesson and a new extra (HU-83)", () => {
    const lesson = { lesson_id: "l1", lesson_title: "Animales terrestres", extra_title: null };
    const published: NotificationItem = { ...base, ...lesson, event: "lesson.published" };
    const extra: NotificationItem = { ...base, ...lesson, event: "extra.published", extra_title: "La granja" };

    expect(notificationSubject(published)).toBe("Nueva lección");
    expect(notificationMessage(published)).toContain('Carlos Ruiz publicó la lección "Animales terrestres"');
    expect(notificationSubject(extra)).toBe("Nuevo material extra");
    expect(notificationMessage(extra)).toContain('dejó "La granja" para Sofía');
  });

  it("shows the copy of a message the guardian wrote, as theirs (HU-51)", () => {
    const n: NotificationItem = {
      ...base,
      event: "message.sent",
      subject: "Tarea",
      body: "¿Hay tarea?",
      addressee: "teacher",
      read: true,
    };

    expect(senderOf(n)).toBe("Tú");
    expect(notificationSubject(n)).toBe("Tarea");
    expect(notificationMessage(n)).toBe('Para el docente de la clase "Matemáticas 3A":\n¿Hay tarea?');
  });
});
