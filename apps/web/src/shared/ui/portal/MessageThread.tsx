import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { NotificationItem } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { formatArrival, formatShortArrival } from "@/features/utils/formatArrival";
import { useThread, type TrayRole } from "@/shared/api/hooks/useNotifications";
import { CountedTextField } from "@/shared/ui/CountedTextField";
import { IconReply } from "@/shared/ui/icons";
import { initialsOf, isOwnMessage, MESSAGE_BODY_MAX, replySubject } from "./messageThreadRules";
import styles from "./MessageThread.module.css";

type Message = Extract<NotificationItem, { event: "message.sent" | "teacher.message" }>;

interface MessageThreadProps {
  role: TrayRole;
  /** The message being read. */
  message: Message;
  /** Who the other side is, when none of their emails says it. */
  otherName: string;
  /** Sends the answer in the same thread. */
  onReply: (subject: string, body: string) => Promise<unknown>;
}

const byDate = (a: Message, b: Message) => a.created_at.localeCompare(b.created_at);

/** HU-51: a message with its whole conversation, like a mail thread: the
 * emails one under the other, oldest first, each with who sent it, to whom
 * and when. The one being read and the newest are open, the others show one
 * line and open with a click. "Responder" at the end opens the box to answer,
 * and the answer reaches the other side inside the same thread. */
export function MessageThread({ role, message, otherName, onReply }: MessageThreadProps) {
  const thread = useThread(role, message.thread_id);
  const queryClient = useQueryClient();
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState("");
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Opening the box puts the cursor in it, ready to write.
  const bodyId = `reply-body-${message.id}`;
  useEffect(() => {
    if (composing) document.getElementById(bodyId)?.focus();
  }, [composing, bodyId]);

  // Until the thread arrives, or for an old message with no thread, it's
  // just the one being read.
  const emails = thread.data?.length ? [...(thread.data as Message[])].sort(byDate) : [message];
  const newestId = emails[emails.length - 1].id;
  const canFold = emails.length > 1;
  const isOpen = (m: Message) => !canFold || (toggled[m.id] ?? (m.id === message.id || m.id === newestId));

  // The other side by their name, taken from one of their emails.
  const other = emails.find((m) => !isOwnMessage(role, m) && m.sender_name)?.sender_name ?? otherName;
  const bodyError = !body.trim() ? "Escribe tu respuesta." : undefined;

  function senderOf(m: Message): string {
    return isOwnMessage(role, m) ? "Tú" : (m.sender_name ?? other);
  }

  // "para ti" when it came to the person; their own copy says to whom it went.
  function addresseeOf(m: Message): string {
    if (!isOwnMessage(role, m)) return "para ti";
    if (m.event === "teacher.message" && m.addressee === "student") return `para ${m.student_name ?? "el estudiante"}`;
    return `para ${other}`;
  }

  function discard() {
    setComposing(false);
    setBody("");
    setTried(false);
    setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (bodyError || sending) return;
    setError(null);
    setSending(true);
    try {
      await onReply(replySubject(message.subject), body.trim());
      discard();
      setSent(true);
      // The answer reaches the thread through notification-service a moment later.
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: ["notifications", role] }), 1_000);
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className={styles.thread} aria-label={canFold ? `Conversación de ${emails.length} correos` : "Correo"}>
      <ol className={styles.emails}>
        {emails.map((m) => {
          const open = isOpen(m);
          const own = isOwnMessage(role, m);
          const sender = senderOf(m);
          const head = (
            <>
              <span className={own ? `${styles.avatar} ${styles.avatarOwn}` : styles.avatar} aria-hidden="true">
                {own ? "Tú" : initialsOf(sender)}
              </span>
              <span className={styles.who}>
                <span className={styles.sender}>
                  <span className={styles.visuallyHidden}>De parte de </span>
                  {sender}
                </span>
                {open ? (
                  <span className={styles.to}>{addresseeOf(m)}</span>
                ) : (
                  <span className={styles.snippet}>{m.body}</span>
                )}
              </span>
              <time className={styles.date} dateTime={m.created_at} title={formatArrival(m.created_at)}>
                {open ? formatArrival(m.created_at) : formatShortArrival(m.created_at)}
              </time>
            </>
          );
          return (
            <li
              key={m.id}
              className={open ? `${styles.email} ${styles.emailOpen}` : styles.email}
              aria-current={canFold && m.id === message.id ? "true" : undefined}
            >
              {canFold ? (
                <button
                  type="button"
                  className={styles.head}
                  aria-expanded={open}
                  onClick={() => setToggled((current) => ({ ...current, [m.id]: !open }))}
                >
                  {head}
                </button>
              ) : (
                <div className={styles.head}>{head}</div>
              )}
              {open && <p className={styles.body}>{m.body}</p>}
            </li>
          );
        })}
      </ol>

      {composing ? (
        <form className={styles.compose} onSubmit={submit} noValidate aria-label={`Responder a ${other}`}>
          <p className={styles.composeTo}>
            <IconReply width={16} height={16} aria-hidden="true" />
            Para <strong>{other}</strong>
          </p>
          <CountedTextField
            id={bodyId}
            label={`Tu respuesta para ${other}`}
            value={body}
            onChange={setBody}
            max={MESSAGE_BODY_MAX}
            multiline
            rows={5}
            error={tried ? bodyError : undefined}
            required
          />
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <div className={styles.actions}>
            <button type="button" className={styles.discard} onClick={discard} disabled={sending}>
              Descartar
            </button>
            <button type="submit" className={styles.send} disabled={sending}>
              {sending ? "Enviando…" : "Enviar"}
            </button>
          </div>
        </form>
      ) : (
        <div className={styles.replyBar}>
          <button
            type="button"
            className={styles.replyButton}
            onClick={() => {
              setSent(false);
              setComposing(true);
            }}
          >
            <IconReply width={18} height={18} aria-hidden="true" />
            Responder
          </button>
        </div>
      )}

      {sent && (
        <p role="status" className={styles.sent}>
          Enviamos tu respuesta. Aparecerá en esta conversación en un momento.
        </p>
      )}
    </section>
  );
}
