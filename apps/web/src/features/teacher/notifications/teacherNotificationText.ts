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

/** Who it comes from: the guardian who asked, or IRIS for what the teacher
 * did themselves. */
export function senderOf(n: NotificationItem): string {
  if (n.event === "request.created") return n.sender_name ?? FALLBACK.guardian;
  return "IRIS";
}

export function notificationSubject(n: NotificationItem): string {
  if (n.event === "request.created") return "Nueva solicitud de ingreso";
  if (n.event === "request.resolved") {
    return n.decision === "aceptada" ? "Solicitud de ingreso aceptada" : "Solicitud de ingreso rechazada";
  }
  return "Cambio en una clase";
}

export function notificationMessage(n: NotificationItem): string {
  const student = studentOf(n);
  const classroom = quoted(n.classroom_name);
  if (n.event === "request.created") {
    return `${senderOf(n)} pidió que ${student} se una a ${classroom}. Abre la notificación para aceptar o rechazar la solicitud.`;
  }
  if (n.event === "request.resolved" && n.decision === "aceptada") {
    return `Aceptaste la solicitud de ${student} para unirse a ${classroom}. Ya es parte de la clase.`;
  }
  if (n.event === "request.resolved") {
    return `Rechazaste la solicitud de ${student} para unirse a ${classroom}. Su familia puede volver a pedir el ingreso más adelante.`;
  }
  return `Hubo un cambio en ${classroom}.`;
}

// The name of a classroom goes in quotes, "la clase" alone doesn't.
function quoted(classroom: string | null): string {
  return classroom ? `la clase "${classroom}"` : FALLBACK.classroom;
}
