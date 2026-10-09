import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { NotificationItem } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { formatArrival } from "@/features/utils/formatArrival";
import { useThread, type TrayRole } from "@/shared/api/hooks/useNotifications";
import { CountedTextField } from "@/shared/ui/CountedTextField";
import { isOwnMessage, replySubject } from "./messageThreadRules";
import styles from "./MessageThread.module.css";

// Same sizes as any message (classroom-service checks them too).
const SUBJECT_MAX = 120;
const BODY_MAX = 2000;

type Message = Extract<NotificationItem, { event: "message.sent" | "teacher.message" }>;

interface MessageThreadProps {
  role: TrayRole;
  /** The message being read. */
  message: Message;
  /** Who the other side is, for "Para …" and the earlier messages. */
  otherName: string;
  /** Sends the answer in the same thread. */
  onReply: (subject: string, body: string) => Promise<unknown>;
}

/** HU-51: under a message, its whole conversation in order, like an email
 * one, and the form to answer it. The answer reaches the other side's tray
 * inside the same thread, and a copy stays in this one. */
export function MessageThread({ role, message, otherName, onReply }: MessageThreadProps) {
  const thread = useThread(role, message.thread_id);
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState(() => replySubject(message.subject));
  const [body, setBody] = useState("");
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const messages = (thread.data ?? []) as Message[];
  const subjectError = !subject.trim() ? "Escribe el asunto." : undefined;
  const bodyError = !body.trim() ? "Escribe tu respuesta." : undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    setSent(false);
    if (subjectError || bodyError || sending) return;
    setError(null);
    setSending(true);
    try {
      await onReply(subject.trim(), body.trim());
      setBody("");
      setTried(false);
      setSent(true);
      // The answer reaches the tray through notification-service a moment later.
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: ["notifications", role] }), 1_000);
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className={styles.thread} aria-labelledby="message-thread-title">
      {messages.length > 1 && (
        <>
          <h2 id="message-thread-title" className={styles.title}>
            Conversación · {messages.length} mensajes
          </h2>
          <ol className={styles.messages}>
            {messages.map((m) => {
              const own = isOwnMessage(role, m);
              return (
                <li
                  key={m.id}
                  className={styles.message}
                  data-own={own}
                  aria-current={m.id === message.id ? "true" : undefined}
                >
                  <span className={styles.who}>
                    {own ? `Tú, para ${otherName}` : (m.sender_name ?? otherName)} · {formatArrival(m.created_at)}
                  </span>
                  <span className={styles.subject}>{m.subject}</span>
                  <p className={styles.body}>{m.body}</p>
                </li>
              );
            })}
          </ol>
        </>
      )}
      {messages.length <= 1 && (
        <h2 id="message-thread-title" className={styles.title}>
          Responder
        </h2>
      )}

      <form className={styles.reply} onSubmit={submit} noValidate aria-label={`Responder a ${otherName}`}>
        <CountedTextField
          id={`reply-subject-${message.id}`}
          label="Asunto"
          value={subject}
          onChange={setSubject}
          max={SUBJECT_MAX}
          error={tried ? subjectError : undefined}
          required
        />
        <CountedTextField
          id={`reply-body-${message.id}`}
          label={`Tu respuesta para ${otherName}`}
          value={body}
          onChange={setBody}
          max={BODY_MAX}
          multiline
          rows={4}
          error={tried ? bodyError : undefined}
          required
        />
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {sent && (
          <p role="status" className={styles.sent}>
            Enviamos tu respuesta. Queda en esta misma conversación.
          </p>
        )}
        <div className={styles.actions}>
          <button type="submit" className={styles.send} disabled={sending}>
            {sending ? "Enviando…" : "Responder"}
          </button>
        </div>
      </form>
    </section>
  );
}
