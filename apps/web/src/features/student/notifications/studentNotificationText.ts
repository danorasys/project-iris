import type { NotificationItem } from "@iris/shared-types";

// What a kid reads for each notification, in simple words. Same idea as the
// parents' and the teacher's: the server keeps the facts, the words are here.
// A kid only gets three kinds: their teacher's messages, new lessons and new
// extras (HU-77, HU-83).

/** How many notifications fit on one screen (the same 3 as PagedChoices). */
export const TRAY_PAGE_SIZE = 3;

export function classroomOf(n: NotificationItem): string {
  return n.classroom_name ?? "tu clase";
}

/** Who it's from: their teacher, or IRIS when the name didn't come. */
export function senderOf(n: NotificationItem): string {
  return n.sender_name ?? "IRIS";
}

export function notificationSubject(n: NotificationItem): string {
  if (n.event === "teacher.message") return n.subject ?? "Un mensaje de tu profe";
  if (n.event === "lesson.published") return "¡Hay una lección nueva!";
  if (n.event === "extra.published") return "¡Tu profe dejó algo más para ti!";
  return "Algo nuevo en tu clase";
}

export function notificationMessage(n: NotificationItem): string {
  const teacher = n.sender_name ?? "Tu profe";
  // What the teacher wrote, as they wrote it.
  if (n.event === "teacher.message") return n.body ?? "";
  if (n.event === "lesson.published") {
    return `${teacher} publicó ${lessonOf(n.lesson_title)} en ${classroomOf(n)}. ¡Ya puedes verla cuando quieras!`;
  }
  if (n.event === "extra.published") {
    const extra = n.extra_title ? `"${n.extra_title}"` : "algo más";
    return `${teacher} dejó ${extra} para ti en ${lessonOf(n.lesson_title)}. Lo encuentras en "Extra", después de hacer la actividad.`;
  }
  return `Hay algo nuevo en ${classroomOf(n)}.`;
}

/** The first words of the message, for the list. */
export function notificationSnippet(n: NotificationItem, maxLength = 90): string {
  const text = notificationMessage(n);
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;
}

/** The message split in parts that fit on one screen, cut between words,
 * so a long one is read with the big arrows (HU-55). */
export function messagePages(text: string, maxLength = 320): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const pages: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength && current) {
      pages.push(current);
      current = word;
    } else current = next;
  }
  if (current || pages.length === 0) pages.push(current);
  return pages;
}

// The title of a lesson goes in quotes, "una lección" alone doesn't.
function lessonOf(title: string | null): string {
  return title ? `la lección "${title}"` : "una lección";
}
