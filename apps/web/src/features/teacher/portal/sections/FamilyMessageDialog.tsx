import { useState } from "react";
import type { ClassroomMember, MessageRecipient } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { SelectField } from "@/features/auth/ui/SelectField";
import { useSendFamilyMessage } from "@/shared/api/hooks/useClassroomsApi";
import { CountedTextField } from "@/shared/ui/CountedTextField";
import { FormDialog } from "@/shared/ui/FormDialog";
import { IconMessage } from "@/shared/ui/icons";
import { MESSAGE_BODY_MAX, MESSAGE_BODY_TOO_LONG, MESSAGE_SUBJECT_MAX } from "@/shared/ui/portal/messageThreadRules";

type Field = "subject" | "body";

interface FamilyMessageDialogProps {
  classroomId: string;
  members: ClassroomMember[];
  /** The kid picked when it opens (from "Miembros"). */
  enrollmentId?: string;
  onClose: () => void;
  onSent: (message: string) => void;
}

/** HU-77: the teacher writes to a kid of the class or to their guardian,
 * with a subject and the text. It reaches that person's tray in IRIS. */
export function FamilyMessageDialog({ classroomId, members, enrollmentId, onClose, onSent }: FamilyMessageDialogProps) {
  const [memberId, setMemberId] = useState(enrollmentId ?? members[0]?.enrollment_id ?? "");
  const [recipient, setRecipient] = useState<MessageRecipient>("guardian");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const send = useSendFamilyMessage();
  const member = members.find((m) => m.enrollment_id === memberId);

  // Without a guardian found, the message can only go to the kid.
  const canWriteFamily = Boolean(member?.guardian_name);
  const to: MessageRecipient = canWriteFamily ? recipient : "student";

  async function submit(): Promise<boolean> {
    setSubmitError(null);
    const found: Partial<Record<Field, string>> = {};
    if (!subject.trim()) found.subject = "Escribe el asunto del mensaje.";
    if (!body.trim()) found.body = "Escribe tu mensaje.";
    else if (body.trim().length > MESSAGE_BODY_MAX) found.body = MESSAGE_BODY_TOO_LONG;
    setErrors(found);
    const first = (["subject", "body"] as const).find((field) => found[field]);
    if (first) {
      document.getElementById(`family-message-${first}`)?.focus();
      return false;
    }
    if (!member) return false;
    try {
      await send.mutateAsync({
        classroomId,
        enrollmentId: member.enrollment_id,
        recipient: to,
        subject: subject.trim(),
        body: body.trim(),
      });
      onSent(
        to === "student"
          ? `Tu mensaje le llegó a ${member.first_name}.`
          : `Tu mensaje le llegó a ${member.guardian_name}.`,
      );
    } catch (error) {
      setSubmitError(getAuthErrorMessage(error));
      return false;
    }
    return true;
  }

  return (
    <FormDialog
      eyebrow="Mensajes"
      title="Escribir un mensaje"
      intro="Le llega a su bandeja de notificaciones en IRIS, con tu nombre y el de la clase."
      icon={<IconMessage width={24} height={24} />}
      submitLabel="Enviar mensaje"
      saving={send.isPending}
      error={submitError}
      onSubmit={submit}
      onClose={onClose}
    >
      <SelectField
        id="family-message-student"
        label="Estudiante"
        value={memberId}
        onChange={setMemberId}
        options={members.map((m) => ({ value: m.enrollment_id, label: m.first_name }))}
        required
        disabled={send.isPending}
      />
      <SelectField
        id="family-message-recipient"
        label="Para"
        value={to}
        onChange={(value) => setRecipient(value as MessageRecipient)}
        options={[
          ...(canWriteFamily && member ? [{ value: "guardian", label: `Su familia: ${member.guardian_name}` }] : []),
          { value: "student", label: member ? `${member.first_name}, el estudiante` : "El estudiante" },
        ]}
        required
        disabled={send.isPending}
      />
      <CountedTextField
        id="family-message-subject"
        label="Asunto"
        value={subject}
        onChange={(value) => {
          setSubject(value);
          setErrors((current) => ({ ...current, subject: undefined }));
        }}
        max={MESSAGE_SUBJECT_MAX}
        error={errors.subject}
        required
        disabled={send.isPending}
      />
      <CountedTextField
        id="family-message-body"
        label="Mensaje"
        value={body}
        onChange={(value) => {
          setBody(value);
          setErrors((current) => ({ ...current, body: undefined }));
        }}
        max={MESSAGE_BODY_MAX}
        multiline
        rows={6}
        error={errors.body}
        required
        disabled={send.isPending}
      />
    </FormDialog>
  );
}
