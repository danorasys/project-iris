import type { NotificationItem } from "@iris/shared-types";

// What a guardian reads for each kind of notification. The server only
// keeps the facts (the event, the kid, the classroom, who it's from), the
// words are written here so they can change without touching the data.

/** Shown when a name didn't come with the notification. */
const FALLBACK = {
  student: "tu peque",
  classroom: "la clase",
  sender: "IRIS",
};

export function studentOf(n: NotificationItem): string {
  return n.student_name ?? FALLBACK.student;
}

export function classroomOf(n: NotificationItem): string {
  return n.classroom_name ?? FALLBACK.classroom;
}

export function senderOf(n: NotificationItem): string {
  return n.sender_name ?? FALLBACK.sender;
}

export function notificationSubject(n: NotificationItem): string {
  if (n.event === "request.created") return "Solicitud de ingreso enviada";
  return n.decision === "aceptada" ? "Solicitud de ingreso aceptada" : "Solicitud de ingreso no aceptada";
}

export function notificationMessage(n: NotificationItem): string {
  const student = studentOf(n);
  const classroom = classroomOf(n);
  if (n.event === "request.created") {
    return `${capitalized(student)} pidió unirse a ${quoted(classroom)} con el código de la clase. Te avisaremos aquí cuando el docente responda la solicitud.`;
  }
  const teacher = n.sender_name ?? "El docente";
  if (n.decision === "aceptada") {
    return `${teacher} aceptó la solicitud de ${student} para unirse a ${quoted(classroom)}. Desde ahora ${student} ya puede entrar a la clase y ver sus lecciones.`;
  }
  return `${teacher} no aceptó la solicitud de ${student} para unirse a ${quoted(classroom)}. Si crees que se trata de un error, revisa el código de la clase con el docente y vuelve a intentarlo.`;
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// The name of a classroom goes in quotes, "la clase" alone doesn't.
function quoted(classroom: string): string {
  return classroom === FALLBACK.classroom ? classroom : `la clase "${classroom}"`;
}

const dateTime = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });

/** "3 oct 2026, 10:42 a. m.", the date and time it arrived. */
export function formatArrival(isoDate: string): string {
  return dateTime.format(new Date(isoDate));
}
