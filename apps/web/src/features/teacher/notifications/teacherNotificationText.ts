import type { NotificationItem } from "@iris/shared-types";

// What a teacher reads for each kind of notification. Same idea as the
// guardian's (features/guardian/notifications/notificationText.ts): the
// server keeps the facts, the words are written here.

const FALLBACK = {
  student: "un estudiante",
  classroom: "la clase",
  guardian: "Un tutor",
};

export function studentOf(n: NotificationItem): string {
  return n.student_name ?? FALLBACK.student;
}

/** Who it comes from: the family that asked, wrote or took the kid out,
 * the kid in a report, or the teacher themselves (IRIS, or "Tú" for a
 * message they sent). */
export function senderOf(n: NotificationItem): string {
  if (n.event === "request.resolved" || n.event === "enrollment.removed") return "IRIS";
  if (n.event === "teacher.message") return "Tú";
  if (n.event === "lesson.content_completed" || n.event === "lesson.activity_completed") {
    return n.sender_name ?? studentOf(n);
  }
  return n.sender_name ?? FALLBACK.guardian;
}

export function notificationSubject(n: NotificationItem): string {
  if (n.event === "request.created") return "Nueva solicitud de ingreso";
  if (n.event === "request.resolved") {
    return n.decision === "aceptada" ? "Solicitud de ingreso aceptada" : "Solicitud de ingreso rechazada";
  }
  if (n.event === "request.cancelled") return "Solicitud de ingreso cancelada";
  if (n.event === "enrollment.withdrawn") return "Un estudiante salió de la clase";
  if (n.event === "message.sent") return n.subject ?? "Mensaje de una familia";
  if (n.event === "teacher.message") return n.subject ?? "Tu mensaje";
  if (n.event === "lesson.content_completed") return "Terminó de leer una lección";
  if (n.event === "lesson.activity_completed") return "Hizo la actividad de una lección";
  return "Cambio en una clase";
}

export function notificationMessage(n: NotificationItem): string {
  const student = studentOf(n);
  const classroom = quoted(n.classroom_name);
  if (n.event === "request.created") {
    return `${senderOf(n)} pidió que ${student} se una a ${classroom}. Abre la notificación para aceptar o rechazar la solicitud.`;
  }
  if (n.event === "request.cancelled") {
    return `${senderOf(n)} canceló la solicitud de ${student} para unirse a ${classroom}. Ya no tienes que responderla.`;
  }
  if (n.event === "enrollment.withdrawn") {
    return `${senderOf(n)} retiró a ${student} de ${classroom}. Ya no aparece entre los estudiantes de la clase.`;
  }
  // What the guardian wrote, as they wrote it.
  if (n.event === "message.sent") return n.body ?? "";
  // The copy of what the teacher sent, with who it went to.
  if (n.event === "teacher.message") {
    const to = n.addressee === "student" ? student : `la familia de ${student}`;
    return `Para ${to}:\n${n.body ?? ""}`;
  }
  if (n.event === "lesson.content_completed") {
    return `${student} terminó de leer todo el contenido de ${lessonOf(n.lesson_title)} en ${classroom}.`;
  }
  if (n.event === "lesson.activity_completed") {
    const score = n.correct !== null && n.total !== null ? ` y acertó ${n.correct} de ${n.total}` : "";
    return `${student} hizo por primera vez la actividad de ${lessonOf(n.lesson_title)} en ${classroom}${score}. Sus demás intentos los ves en su progreso.`;
  }
  if (n.event === "request.resolved" && n.decision === "aceptada") {
    return `Aceptaste la solicitud de ${student} para unirse a ${classroom}. Ya es parte de la clase.`;
  }
  if (n.event === "request.resolved") {
    return `Rechazaste la solicitud de ${student} para unirse a ${classroom}. Su familia puede volver a pedir el ingreso más adelante.`;
  }
  return `Hubo un cambio en ${classroom}.`;
}

// The title of a lesson goes in quotes, "una lección" alone doesn't.
function lessonOf(title: string | null): string {
  return title ? `la lección "${title}"` : "una lección";
}

// The name of a classroom goes in quotes, "la clase" alone doesn't.
function quoted(classroom: string | null): string {
  return classroom ? `la clase "${classroom}"` : FALLBACK.classroom;
}
