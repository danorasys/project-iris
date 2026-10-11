import type { NotificationItem } from "@iris/shared-types";

// Only messages are written by a person: a family's to the teacher and the
// teacher's to a kid or a family. Everything else IRIS writes by itself when
// someone does something (publishes a lesson, answers a request…), so it's
// signed by IRIS and the person who did it goes in the text.
const WRITTEN_BY_A_PERSON: ReadonlySet<NotificationItem["event"]> = new Set(["message.sent", "teacher.message"]);

/** Who signs the notices IRIS writes by itself, in every portal. */
export const AUTOMATIC_SENDER = "IRIS";

export function isAutomatic(n: NotificationItem): boolean {
  return !WRITTEN_BY_A_PERSON.has(n.event);
}

/** The kid and the class a notification is about, for its row in a tray
 * (HU-43): the same tag on a message and on a notice, so every row says it
 * in the same place without opening it. */
export function notificationContext(n: NotificationItem): string | null {
  return [n.student_name, n.classroom_name].filter(Boolean).join(" · ") || null;
}
