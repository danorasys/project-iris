import type { NotificationItem } from "@iris/shared-types";
import type { TrayRole } from "@/shared/api/hooks/useNotifications";

// The small rules of a conversation (HU-51), apart from the screen.

const SUBJECT_MAX = 120;

/** A message the person sent themselves: the copy they keep. */
export function isOwnMessage(role: TrayRole, n: NotificationItem): boolean {
  return (role === "teacher" && n.event === "teacher.message") || (role === "guardian" && n.event === "message.sent");
}

/** "Re: Tarea", never "Re: Re: Tarea". */
export function replySubject(subject: string | null): string {
  const base = (subject ?? "").replace(/^(re:\s*)+/i, "").trim() || "Mensaje";
  return `Re: ${base}`.slice(0, SUBJECT_MAX);
}
