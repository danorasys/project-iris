import { Navigate } from "react-router-dom";
import type { FamilyClassroom } from "@iris/shared-types";
import { classroomAudience } from "@/features/teacher/classrooms/classroomDetails";
import { ClassroomAvatar } from "@/features/teacher/classrooms/ClassroomAvatar";
import { formatArrival } from "@/features/utils/formatArrival";
import { useFamilyClassrooms } from "@/shared/api/hooks/useClassroomsApi";
import { IconBook, IconClassroom, IconClock } from "@/shared/ui/icons";
import { isPortalAccessRequired } from "../portalAccess";
import styles from "./SusClasesSection.module.css";

interface SusClasesSectionProps {
  studentId: string;
  firstName: string;
}

/** "Sus clases" in a kid's space: every class the kid is in and every
 * request still waiting for the teacher, with who teaches it and how many
 * lessons it has. The requests waiting go first, they're what the family
 * is watching. Same data as the kids in Inicio (GET /classrooms/family). */
export function SusClasesSection({ studentId, firstName }: SusClasesSectionProps) {
  const family = useFamilyClassrooms();

  // Nothing typed to keep here, a closed portal just goes to the code screen.
  if (isPortalAccessRequired(family.error)) return <Navigate to="/guardian/verify-2fa" replace />;
  if (family.isLoading) return <p className={styles.status}>Cargando sus clases…</p>;
  if (family.isError) {
    return (
      <p role="alert" className={`${styles.status} ${styles.error}`}>
        No pudimos cargar sus clases. Intenta recargar la página.
      </p>
    );
  }

  const classes = (family.data ?? []).filter((c) => c.student_id === studentId);
  const waiting = classes.filter((c) => c.status === "pendiente");
  const inside = classes.filter((c) => c.status === "aceptada");

  if (classes.length === 0) {
    return (
      <section className={styles.panel} aria-label={`Clases de ${firstName}`}>
        <div className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden="true">
            <IconClassroom width={24} height={24} />
          </span>
          <p className={styles.emptyTitle}>{firstName} aún no está en ninguna clase</p>
          <p className={styles.emptyText}>
            Cuando el docente te comparta el código de ingreso, escríbanlo juntos al entrar a IRIS con su perfil. El
            docente recibirá la solicitud y aquí verás cuando responda.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-label={`Clases de ${firstName}`}>
      <ul className={styles.list}>
        {[...waiting, ...inside].map((item) => (
          <ClassRow key={item.enrollment_id} item={item} />
        ))}
      </ul>
    </section>
  );
}

function ClassRow({ item }: { item: FamilyClassroom }) {
  const audience = classroomAudience(item.area, item.grade, item.area_other);
  const details = [audience, item.teacher_name && `con ${item.teacher_name}`].filter(Boolean).join(" · ");
  const waiting = item.status === "pendiente";

  return (
    <li className={styles.row}>
      <ClassroomAvatar
        classroom={{ id: item.classroom_id, name: item.name, color: item.color, logo_file: null }}
        size={52}
      />
      <div className={styles.text}>
        <p className={styles.name}>{item.name}</p>
        {details && <p className={styles.meta}>{details}</p>}
        {item.description && <p className={styles.description}>{item.description}</p>}
      </div>
      <div className={styles.state}>
        {waiting ? (
          <>
            <span className={styles.waitingPill}>
              <IconClock width={14} height={14} aria-hidden="true" />
              Esperando respuesta
            </span>
            <span className={styles.since}>Pidió entrar el {formatArrival(item.requested_at)}</span>
          </>
        ) : (
          <span className={styles.lessonsPill}>
            <IconBook width={14} height={14} aria-hidden="true" />
            {item.published_lessons === null
              ? "En la clase"
              : item.published_lessons === 0
                ? "Aún sin lecciones"
                : item.published_lessons === 1
                  ? "1 lección"
                  : `${item.published_lessons} lecciones`}
          </span>
        )}
      </div>
    </li>
  );
}
