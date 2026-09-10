import { Link, useNavigate } from "react-router-dom";
import { useTeacherClassrooms } from "@/shared/api/hooks/useClassroomsApi";
import { useTeacherNotifications } from "@/shared/api/hooks/useNotifications";
import { IconBell, IconSchool } from "@/shared/ui/icons";
import { IrisMark } from "@/shared/ui/IrisMark";
import styles from "./DashboardPage.module.css";

/** `/teacher/home`, the teacher's panel. Their classrooms in a grid, a
 * pending-requests badge, and toasts for new requests, both kept up to
 * date by polling `notification-service`'s tray periodically. */
export default function DashboardPage() {
  const navigate = useNavigate();
  const classroomsQuery = useTeacherClassrooms();
  const { totalPendientes: pendingCount, toasts, descartarToast: dismissToast } = useTeacherNotifications();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleWithBrand}>
          <IrisMark size={40} className={styles.brand} />
          <div>
            <h1>Panel docente</h1>
            <p className={styles.subtitle}>Tus aulas y solicitudes de ingreso</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <span
            className={styles.badge}
            aria-label={pendingCount > 0 ? `${pendingCount} solicitudes pendientes` : "sin solicitudes pendientes"}
          >
            <IconBell width={22} height={22} />
            {pendingCount > 0 && <span className={styles.badgeCount}>{pendingCount}</span>}
          </span>
          <button type="button" className={styles.createButton} onClick={() => navigate("/teacher/classrooms/create")}>
            + Crear aula
          </button>
        </div>
      </header>

      {toasts.length > 0 && (
        <div className={styles.toasts} aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className={styles.toast}>
              <span>{toast.mensaje}</span>
              <button type="button" onClick={() => dismissToast(toast.id)} aria-label="Cerrar aviso">
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {classroomsQuery.isLoading && <p>Cargando tus aulas…</p>}
      {classroomsQuery.isError && (
        <p className={styles.error} role="alert">
          No se pudieron cargar tus aulas. Intenta recargar la página.
        </p>
      )}

      {classroomsQuery.data && classroomsQuery.data.length === 0 && (
        <div className={styles.empty}>
          <p>Todavía no has creado ninguna aula.</p>
          <button type="button" className={styles.createButton} onClick={() => navigate("/teacher/classrooms/create")}>
            Crear tu primera aula
          </button>
        </div>
      )}

      {classroomsQuery.data && classroomsQuery.data.length > 0 && (
        <div className={styles.grid}>
          {classroomsQuery.data.map((classroom) => (
            <Link key={classroom.id} to={`/teacher/classrooms/${classroom.id}`} className={styles.card}>
              {classroom.logo_url ? (
                <img src={classroom.logo_url} alt="" className={styles.logo} />
              ) : (
                <div className={styles.logoPlaceholder} aria-hidden="true">
                  <IconSchool width={24} height={24} />
                </div>
              )}
              <h2>{classroom.name}</h2>
              <p>{classroom.description}</p>
              <p className={styles.code}>Código: {classroom.enrollment_code}</p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
