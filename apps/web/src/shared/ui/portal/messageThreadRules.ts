import type { NotificationItem } from "@iris/shared-types";
import type { TrayRole } from "@/shared/api/hooks/useNotifications";

// The small rules of a conversation (HU-51), apart from the screen.

// Sizes of any message between a family and a teacher, the same ones
// classroom-service checks: long like an email, but with a top.
export const MESSAGE_SUBJECT_MAX = 300;
export const MESSAGE_BODY_MAX = 20000;

/** "El mensaje puede tener hasta 20.000 caracteres." */
export const MESSAGE_BODY_TOO_LONG = `El mensaje puede tener hasta ${MESSAGE_BODY_MAX.toLocaleString("es-CO")} caracteres.`;

/** A message the person sent themselves: the copy they keep. */
export function isOwnMessage(role: TrayRole, n: NotificationItem): boolean {
  return (role === "teacher" && n.event === "teacher.message") || (role === "guardian" && n.event === "message.sent");
}

/** "Re: Tarea", never "Re: Re: Tarea". */
export function replySubject(subject: string | null): string {
  return `Re: ${threadSubject(subject)}`.slice(0, MESSAGE_SUBJECT_MAX);
}

/** A conversation is named like its first email, without the "Re:". */
export function threadSubject(subject: string | null): string {
  return (subject ?? "").replace(/^(re:\s*)+/i, "").trim() || "Mensaje";
}

// "Laura Gómez" -> "LG", "Sofía" -> "S".
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}
