import { useState } from "react";
import type { ClassroomMember, ClassroomWithStudents } from "@iris/shared-types";
import { getAuthErrorMessage } from "@/features/auth/errors";
import { useClassroomRequests, useRemoveStudent, useResolveRequest } from "@/shared/api/hooks/useClassroomsApi";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { IconChild } from "@/shared/ui/icons";
import { StudentAvatarImage } from "@/shared/ui/StudentAvatarImage";
import styles from "../portalSection.module.css";

interface MembersPanelProps {
  classroom: ClassroomWithStudents;
  onToast: (message: string) => void;
}

/** "Miembros" of a classroom (HU-75): each student with their guardian's
 * name and contact, and "Retirar" (HU-76), which asks first. Requests
 * still waiting are on top, to accept or reject them right here too. */
export function MembersPanel({ classroom, onToast }: MembersPanelProps) {
  const requests = useClassroomRequests(classroom.id);
  const resolve = useResolveRequest();
  const removeStudent = useRemoveStudent();
  const [toRemove, setToRemove] = useState<ClassroomMember | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function answer(enrollmentId: string, studentName: string, decision: "aceptar" | "rechazar") {
    setError(null);
    try {
      await resolve.mutateAsync({ classroomId: classroom.id, enrollmentId, decision });
      onToast(
        decision === "aceptar"
          ? `${studentName} ya es parte de la clase.`
          : `Rechazaste la solicitud de ${studentName}.`,
      );
    } catch (failure) {
      setError(getAuthErrorMessage(failure));
    }
  }

  async function confirmRemove() {
    if (!toRemove) return;
    const member = toRemove;
    setToRemove(null);
    setError(null);
    try {
      await removeStudent.mutateAsync({ classroomId: classroom.id, enrollmentId: member.enrollment_id });
      onToast(`${member.first_name} salió de la clase. Le avisamos a su familia.`);
    } catch (failure) {
      setError(getAuthErrorMessage(failure));
    }
  }

  const pending = requests.data ?? [];

  return (
    <>
      {error && (
        <p role="alert" className={`${styles.status} ${styles.error}`}>
          {error}
        </p>
      )}

      {pending.length > 0 && (
        <section aria-labelledby="requests-title" className={styles.section}>
          <h2 id="requests-title" className={styles.subTitle}>
            Solicitudes de ingreso
          </h2>
          <ul className={styles.list}>
            {pending.map((request) => (
              <li key={request.enrollment_id} className={styles.row}>
                <StudentAvatarImage avatarId={request.student_avatar_id} size="small" label="" />
                <div className={styles.rowMain}>
                  <span className={styles.rowTitle}>{request.student_first_name}</span>
                  <span className={styles.rowMeta}>
                    <span className={styles.metaLabel}>Tutor:</span> {request.guardian_name} ·{" "}
                    {request.guardian_contact}
                  </span>
                </div>
                <div className={styles.rowActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => void answer(request.enrollment_id, request.student_first_name, "rechazar")}
                    disabled={resolve.isPending}
                  >
                    Rechazar
                  </button>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => void answer(request.enrollment_id, request.student_first_name, "aceptar")}
                    disabled={resolve.isPending}
                  >
                    Aceptar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="members-title" className={styles.section}>
        <h2 id="members-title" className={styles.subTitle}>
          Estudiantes de la clase
        </h2>
        {classroom.students.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">
              <IconChild width={24} height={24} />
            </span>
            <p className={styles.emptyTitle}>Aún no hay estudiantes en esta clase</p>
            <p className={styles.emptyText}>
              Comparte el código de ingreso {classroom.enrollment_code} con las familias. Cuando un tutor lo use, verás
              aquí su solicitud.
            </p>
          </div>
        ) : (
          <ul className={styles.list}>
            {classroom.students.map((member) => (
              <li key={member.enrollment_id} className={styles.row}>
                <StudentAvatarImage avatarId={member.avatar_id} size="small" label="" />
                <div className={styles.rowMain}>
                  <span className={styles.rowTitle}>{member.first_name}</span>
                  {member.guardian_name ? (
                    <>
                      <span className={styles.rowMeta}>
                        <span className={styles.metaLabel}>Tutor:</span> {member.guardian_name}
                      </span>
                      <span className={styles.rowMeta}>
                        <span className={styles.metaLabel}>Contacto:</span> {member.guardian_email} ·{" "}
                        {member.guardian_phone}
                      </span>
                    </>
                  ) : (
                    <span className={styles.rowMeta}>No encontramos los datos de su familia.</span>
                  )}
                </div>
                <div className={styles.rowActions}>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={() => setToRemove(member)}
                    disabled={removeStudent.isPending}
                    aria-label={`Retirar a ${member.first_name} de la clase`}
                  >
                    Retirar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {toRemove && (
        <ConfirmDialog
          title="Retirar de la clase"
          message={`¿Seguro que quieres retirar a ${toRemove.first_name} de la clase "${classroom.name}"? Su tutor recibirá una notificación y podrá volver a pedir el ingreso más adelante.`}
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
