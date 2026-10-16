import { useId, useState, type FormEvent } from "react";
import type { ClassroomMember, MessageRecipient } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { fullName } from "@/features/utils/fullName";
import { useSendFamilyMessage } from "@/shared/api/hooks/useClassroomsApi";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { IconArrowLeft, IconSend, IconTrash } from "@/shared/ui/icons";
import { MESSAGE_BODY_MAX, MESSAGE_BODY_TOO_LONG, MESSAGE_SUBJECT_MAX } from "@/shared/ui/portal/messageThreadRules";
import tray from "@/shared/ui/portal/NotificationTray.module.css";
import { PortalSelect } from "@/shared/ui/portal/PortalSelect";
import own from "./MessageCompose.module.css";

type Field = "to" | "subject" | "body";

interface MessageComposeProps {
  classroomId: string;
  members: ClassroomMember[];
  /** The kid picked when it opens (from "Escribir" in Miembros): it goes to
   * their family, or to the kid if there's no family found. */
  enrollmentId?: string | null;
  onClose: () => void;
  onSent: (message: string) => void;
}

// Who a message can go to: each kid's family and each kid, as
// "enrollment:recipient" so one list holds both.
function recipientValue(enrollmentId: string, recipient: MessageRecipient): string {
  return `${enrollmentId}:${recipient}`;
}

function kidName(member: ClassroomMember): string {
  return fullName(member.first_name, member.last_name);
}

function firstRecipient(members: ClassroomMember[], enrollmentId?: string | null): string {
  const member = members.find((m) => m.enrollment_id === enrollmentId);
  if (!member) return "";
  return recipientValue(member.enrollment_id, member.guardian_name ? "guardian" : "student");
}

/** HU-77: a new message written like a new mail in Gmail, inside the
 * class's Mensajes: "Para" (a kid's family or the kid), "Asunto" and the
 * text on lines without boxes, "Enviar" at the bottom and the trash to
 * throw it away. It reaches that person's tray in IRIS. */
export function MessageCompose({ classroomId, members, enrollmentId, onClose, onSent }: MessageComposeProps) {
  const [to, setTo] = useState(() => firstRecipient(members, enrollmentId));
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const send = useSendFamilyMessage();
  const titleId = useId();

  const options = members.flatMap((m) => [
    ...(m.guardian_name
      ? [
          {
            value: recipientValue(m.enrollment_id, "guardian"),
            label: `${m.guardian_name}${m.guardian_relationship ? ` (${m.guardian_relationship})` : ""} · familia de ${kidName(m)}`,
          },
        ]
      : []),
    { value: recipientValue(m.enrollment_id, "student"), label: `${kidName(m)} · estudiante` },
  ]);

  // Nothing typed yet: leaving loses nothing, so it doesn't ask.
  const hasText = subject.trim() !== "" || body.trim() !== "";
  function leave() {
    if (hasText) setConfirmingDiscard(true);
    else onClose();
  }

  function clearError(field: Field) {
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    const found: Partial<Record<Field, string>> = {};
    if (!to) found.to = "Elige a quién le escribes.";
    if (!subject.trim()) found.subject = "Escribe el asunto del mensaje.";
    if (!body.trim()) found.body = "Escribe tu mensaje.";
    else if (body.trim().length > MESSAGE_BODY_MAX) found.body = MESSAGE_BODY_TOO_LONG;
    setErrors(found);
    const first = (["to", "subject", "body"] as const).find((field) => found[field]);
    if (first) {
      document.getElementById(`compose-${first}`)?.focus();
      return;
    }

    const [memberId, recipient] = to.split(":") as [string, MessageRecipient];
    const member = members.find((m) => m.enrollment_id === memberId);
    if (!member) return;
    try {
      await send.mutateAsync({
        classroomId,
        enrollmentId: member.enrollment_id,
        recipient,
        subject: subject.trim(),
        body: body.trim(),
      });
      onSent(
        recipient === "student"
          ? `Tu mensaje le llegó a ${member.first_name}.`
          : `Tu mensaje le llegó a ${member.guardian_name}.`,
      );
      onClose();
    } catch (error) {
      setSubmitError(getAuthErrorMessage(error));
    }
  }

  return (
    <section className={tray.mail} aria-labelledby={titleId}>
      <div className={tray.mailBar}>
        <button type="button" className={tray.mailBack} onClick={leave}>
          <IconArrowLeft width={18} height={18} />
          Regresar a mensajes
        </button>
      </div>

      <form className={own.form} onSubmit={(event) => void submit(event)} noValidate>
        <h2 id={titleId} className={own.title}>
          Mensaje nuevo
        </h2>

        <div className={own.lines}>
          <div className={own.line} data-invalid={Boolean(errors.to)}>
            <span className={own.lineLabel} aria-hidden="true">
              Para
            </span>
            <div className={own.lineField}>
              <PortalSelect
                id="compose-to"
                label="Para"
                hideLabel
                bare
                value={to}
                options={options}
                onChange={(value) => {
                  setTo(value);
                  clearError("to");
                }}
                placeholder="Elige a un estudiante o a su familia"
                error={errors.to}
                required
                disabled={send.isPending}
              />
            </div>
          </div>

          <div className={own.line} data-invalid={Boolean(errors.subject)}>
            <label htmlFor="compose-subject" className={own.lineLabel}>
              Asunto
            </label>
            <div className={own.lineField}>
              <input
                id="compose-subject"
                className={own.subject}
                value={subject}
                onChange={(event) => {
                  setSubject(event.target.value);
                  clearError("subject");
                }}
                maxLength={MESSAGE_SUBJECT_MAX}
                autoComplete="off"
                required
                aria-invalid={Boolean(errors.subject)}
                aria-describedby={errors.subject ? "compose-subject-error" : undefined}
                disabled={send.isPending}
              />
              {errors.subject && (
                <p id="compose-subject-error" className={own.error} role="alert">
                  {errors.subject}
                </p>
              )}
            </div>
          </div>
        </div>

        <label htmlFor="compose-body" className={own.visuallyHidden}>
          Mensaje
        </label>
        <textarea
          id="compose-body"
          className={own.body}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            clearError("body");
          }}
          placeholder="Escribe tu mensaje…"
          rows={12}
          required
          aria-invalid={Boolean(errors.body)}
          aria-describedby={errors.body ? "compose-body-error compose-body-count" : "compose-body-count"}
          disabled={send.isPending}
        />
        <div className={own.bodyFoot}>
          {errors.body ? (
            <p id="compose-body-error" className={own.error} role="alert">
              {errors.body}
            </p>
          ) : (
            <span />
          )}
          <span id="compose-body-count" className={own.count} data-over={body.trim().length > MESSAGE_BODY_MAX}>
            {body.length.toLocaleString("es-CO")} / {MESSAGE_BODY_MAX.toLocaleString("es-CO")}
          </span>
        </div>

        {submitError && (
          <p className={own.error} role="alert">
            {submitError}
          </p>
        )}

        <div className={own.footer}>
          <button type="submit" className={own.send} disabled={send.isPending}>
            {send.isPending ? "Enviando…" : "Enviar"}
            <IconSend width={18} height={18} />
          </button>
          <p className={own.hint}>Le llega a su bandeja en IRIS, con tu nombre y el de la clase.</p>
          <button
            type="button"
            className={own.discard}
            onClick={leave}
            disabled={send.isPending}
            aria-label="Descartar el mensaje"
            title="Descartar"
          >
            <IconTrash width={20} height={20} />
          </button>
        </div>
      </form>

      {confirmingDiscard && (
        <ConfirmDialog
          title="Descartar el mensaje"
          message="¿Quieres descartar este mensaje? Lo que escribiste se va a perder."
          acceptLabel="Sí, descartar"
          cancelLabel="Seguir escribiendo"
          danger
          onAccept={() => {
            setConfirmingDiscard(false);
            onClose();
          }}
          onCancel={() => setConfirmingDiscard(false)}
        />
      )}
    </section>
  );
}
