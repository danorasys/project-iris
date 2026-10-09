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
  // The copy of a message the guardian wrote themselves (HU-51).
  if (n.event === "message.sent") return "Tú";
  return n.sender_name ?? FALLBACK.sender;
}

export function notificationSubject(n: NotificationItem): string {
  if (n.event === "request.resolved") {
    return n.decision === "aceptada" ? "Solicitud de ingreso aceptada" : "Solicitud de ingreso no aceptada";
  }
  if (n.event === "enrollment.removed") return "Retiro de una clase";
  if (n.event === "request.closed") return "Solicitud de ingreso cerrada";
  if (n.event === "teacher.message") return n.subject ?? "Mensaje del docente";
  if (n.event === "message.sent") return n.subject ?? "Tu mensaje";
  if (n.event === "lesson.published") return "Nueva lección";
  if (n.event === "extra.published") return "Nuevo material extra";
  // Only in older trays: the family now sends the request themselves.
  return "Solicitud de ingreso enviada";
}

export function notificationMessage(n: NotificationItem): string {
  const student = studentOf(n);
  const classroom = classroomOf(n);
  const teacher = n.sender_name ?? "El docente";
  // What the teacher wrote, as they wrote it.
  if (n.event === "teacher.message") return n.body ?? "";
  if (n.event === "message.sent")
    return `Para el docente de ${quoted(classroom)}:
${n.body ?? ""}`;
  if (n.event === "lesson.published") {
    return `${teacher} publicó ${lessonOf(n.lesson_title)} en ${quoted(classroom)}. ${student} ya puede verla desde su espacio en IRIS.`;
  }
  if (n.event === "extra.published") {
    const extra = n.extra_title ? `"${n.extra_title}"` : "material extra";
    return `${teacher} dejó ${extra} para ${student} en ${lessonOf(n.lesson_title)} de ${quoted(classroom)}. Lo encuentra en la lección, después de hacer su actividad.`;
  }
  if (n.event === "request.closed") {
    return `${quoted(classroom)} ya no tiene un docente a cargo, así que cerramos la solicitud de ${student}. Si quieres, pide el código de otra clase a su docente.`;
  }
  if (n.event === "enrollment.removed") {
    return `${teacher} retiró a ${student} de ${quoted(classroom)}. Si quieres que vuelva, puedes enviar de nuevo la solicitud de ingreso con el código de la clase.`;
  }
  if (n.event !== "request.resolved") {
    return `Se envió la solicitud para que ${student} se una a ${quoted(classroom)}. Te avisaremos aquí cuando el docente responda.`;
  }
  if (n.decision === "aceptada") {
    return `${teacher} aceptó la solicitud de ${student} para unirse a ${quoted(classroom)}. Desde ahora ${student} ya puede entrar a la clase y ver sus lecciones.`;
  }
  return `${teacher} no aceptó la solicitud de ${student} para unirse a ${quoted(classroom)}. Si crees que se trata de un error, revisa el código de la clase con el docente y vuelve a intentarlo.`;
}

// The title of a lesson goes in quotes, "una lección" alone doesn't.
function lessonOf(title: string | null): string {
  return title ? `la lección "${title}"` : "una lección";
}

// The name of a classroom goes in quotes, "la clase" alone doesn't.
function quoted(classroom: string): string {
  return classroom === FALLBACK.classroom ? classroom : `la clase "${classroom}"`;
}

// Shared with the teacher's tray.
export { formatArrival, formatShortArrival } from "@/features/utils/formatArrival";
