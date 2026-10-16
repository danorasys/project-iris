import { useState } from "react";
import type { ClassroomMember, ClassroomWithStudents, EnrollmentRequest } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { fullName } from "@/features/utils/fullName";
import { useClassroomRequests, useRemoveStudent, useResolveRequest } from "@/shared/api/hooks/useClassroomsApi";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { IconChild } from "@/shared/ui/icons";
import { SectionOverview } from "@/shared/ui/portal/SectionOverview";
import { StudentAvatarImage } from "@/shared/ui/StudentAvatarImage";
import styles from "../portalSection.module.css";

interface MembersPanelProps {
  classroom: ClassroomWithStudents;
  onToast: (message: string) => void;
  /** An archived class (HU-105): the members are only listed. */
  readOnly?: boolean;
  /** "Escribir": a new message to that kid or their family, in Mensajes. */
  onWrite: (enrollmentId: string) => void;
}

/** "Miembros" of a classroom (HU-75): the requests still waiting, to accept
 * or reject them, and each student with "Escribir" (HU-77) and "Retirar"
 * (HU-76). An archived class only shows the list, without buttons. */
export function MembersPanel({ classroom, onToast, readOnly = false, onWrite }: MembersPanelProps) {
  const requests = useClassroomRequests(classroom.id);
  const resolve = useResolveRequest();
  const removeStudent = useRemoveStudent();
  const [toRemove, setToRemove] = useState<ClassroomMember | null>(null);
  const [toReject, setToReject] = useState<EnrollmentRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The rows being answered or taken out right now. Only those are locked,
  // so a slow answer (or one waiting for the 2FA code) doesn't block the rest.
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());

  function markBusy(enrollmentId: string, on: boolean) {
    setBusy((current) => {
      const next = new Set(current);
      if (on) next.add(enrollmentId);
      else next.delete(enrollmentId);
      return next;
    });
  }

  async function answer(enrollmentId: string, studentName: string, decision: "aceptar" | "rechazar") {
    setError(null);
    markBusy(enrollmentId, true);
    try {
      await resolve.mutateAsync({ classroomId: classroom.id, enrollmentId, decision });
      onToast(
        decision === "aceptar"
          ? `${studentName} ya es parte de la clase.`
          : `Rechazaste la solicitud de ${studentName}.`,
      );
    } catch (failure) {
      setError(getAuthErrorMessage(failure));
    } finally {
      markBusy(enrollmentId, false);
    }
  }

  async function confirmRemove() {
    if (!toRemove) return;
    const member = toRemove;
    setToRemove(null);
    setError(null);
    markBusy(member.enrollment_id, true);
    try {
      await removeStudent.mutateAsync({ classroomId: classroom.id, enrollmentId: member.enrollment_id });
      onToast(`${fullName(member.first_name, member.last_name)} salió de la clase. Le avisamos a su familia.`);
    } catch (failure) {
      setError(getAuthErrorMessage(failure));
    } finally {
      markBusy(member.enrollment_id, false);
    }
  }

  const pending = requests.data ?? [];
  const students = classroom.students.length;

  return (
    <>
      <SectionOverview
        titleId="members-overview-title"
        Icon={IconChild}
        title="Quiénes están en la clase"
        text={
          <>
            Tiene <strong>{students === 1 ? "1 estudiante" : `${students} estudiantes`}</strong>
            {pending.length > 0 && (
              <>
                {" "}
                y{" "}
                <strong>
                  {pending.length === 1
                    ? "1 solicitud esperando tu respuesta"
                    : `${pending.length} solicitudes esperando tu respuesta`}
                </strong>
              </>
            )}
            .
          </>
        }
      />

      {error && (
        <p role="alert" className={`${styles.status} ${styles.error}`}>
          {error}
        </p>
      )}

      {pending.length > 0 && (
        <section aria-labelledby="requests-title" className={styles.panel}>
          <h2 id="requests-title" className={styles.panelTitle}>
            Solicitudes de ingreso
          </h2>
          <ul className={styles.list}>
            {pending.map((request) => {
              const name = fullName(request.student_first_name, request.student_last_name);
              return (
                <li key={request.enrollment_id} className={styles.row}>
                  <StudentAvatarImage avatarId={request.student_avatar_id} size="small" label="" />
                  <div className={styles.rowMain}>
                    <span className={styles.rowTitle}>{name}</span>
                    <GuardianLines
                      name={request.guardian_name}
                      relationship={request.guardian_relationship}
                      email={request.guardian_email}
                    />
                  </div>
                  <div className={styles.rowActions}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => setToReject(request)}
                      disabled={busy.has(request.enrollment_id)}
                    >
                      Rechazar
                    </button>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => void answer(request.enrollment_id, name, "aceptar")}
                      disabled={busy.has(request.enrollment_id)}
                    >
                      Aceptar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="members-title" className={styles.panel}>
        <h2 id="members-title" className={styles.panelTitle}>
          Estudiantes de la clase
        </h2>
        {classroom.students.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">
              <IconChild width={24} height={24} />
            </span>
            <p className={styles.emptyTitle}>Aún no hay estudiantes en esta clase</p>
            {!readOnly && (
              <p className={styles.emptyText}>
                Comparte el código de ingreso <strong className={styles.code}>{classroom.enrollment_code}</strong> con
                las familias. Cuando un tutor lo use, verás aquí su solicitud.
              </p>
            )}
          </div>
        ) : (
          <ul className={styles.list}>
            {classroom.students.map((member) => {
              const name = fullName(member.first_name, member.last_name);
              return (
                <li key={member.enrollment_id} className={styles.row}>
                  <StudentAvatarImage avatarId={member.avatar_id} size="small" label="" />
                  <div className={styles.rowMain}>
                    <span className={styles.rowTitle}>{name}</span>
                    {member.guardian_name ? (
                      <GuardianLines
                        name={member.guardian_name}
                        relationship={member.guardian_relationship}
                        email={member.guardian_email}
                      />
                    ) : (
                      <span className={styles.rowMeta}>No encontramos los datos de su familia.</span>
                    )}
                  </div>
                  {!readOnly && (
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => onWrite(member.enrollment_id)}
                        aria-label={`Escribirle a ${name} o a su familia`}
                      >
                        Escribir
                      </button>
                      <button
                        type="button"
                        className={styles.dangerButton}
                        onClick={() => setToRemove(member)}
                        disabled={busy.has(member.enrollment_id)}
                        aria-label={`Retirar a ${name} de la clase`}
                      >
                        Retirar
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {toReject && (
        <ConfirmDialog
          title="Rechazar la solicitud"
          message={`¿Seguro que quieres rechazar la solicitud de ${fullName(toReject.student_first_name, toReject.student_last_name)} para unirse a la clase "${classroom.name}"? Su tutor recibirá una notificación y podrá volver a pedir el ingreso más adelante.`}
          acceptLabel="Sí, rechazar"
          cancelLabel="Cancelar"
          danger
          onAccept={() => {
            setToReject(null);
            void answer(toReject.enrollment_id, fullName(toReject.student_first_name, toReject.student_last_name), "rechazar");
          }}
          onCancel={() => setToReject(null)}
        />
      )}

      {toRemove && (
        <ConfirmDialog
          title="Retirar de la clase"
          message={`¿Seguro que quieres retirar a ${fullName(toRemove.first_name, toRemove.last_name)} de la clase "${classroom.name}"? Su tutor recibirá una notificación y podrá volver a pedir el ingreso más adelante.`}
          acceptLabel="Sí, retirar"
          cancelLabel="Cancelar"
          danger
          onAccept={() => void confirmRemove()}
          onCancel={() => setToRemove(null)}
        />
      )}
    </>
  );
}

// Who the kid's guardian is and how to reach them: the name with how they're
// related to the kid ("Madre", "Padre"...) and their email.
function GuardianLines({
  name,
  relationship,
  email,
}: {
  name: string;
  relationship: string | null;
  email: string | null;
}) {
  return (
    <>
      <span className={styles.rowMeta}>
        <span className={styles.metaLabel}>Tutor:</span> {name}
        {relationship && ` (${relationship})`}
      </span>
      {email && (
        <span className={styles.rowMeta}>
          <span className={styles.metaLabel}>Contacto:</span> {email}
        </span>
      )}
    </>
  );
}
