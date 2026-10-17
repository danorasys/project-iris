import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "@/shared/auth/useAuth";
import { routeIntoKids } from "@/features/student/lib/studentJourney";
import { IconInfo } from "@/shared/ui/icons";
import avatarGuardian from "@/assets/auth/avatar-guardian.png";
import avatarPeques from "@/assets/auth/avatar-peques.png";
import styles from "./ProfileSelectorAuth.module.css";

/** `/guardian/start`, behind RequireRol so it needs a tutor session.
 * "Portal Peques" goes to /kids: first the calibration, then the profiles. */
export default function ProfileSelectorAuth() {
  return <GuardianPortalChoice />;
}

/** First screen after the tutor logs in: the parents' portal or hand the
 * device to a child. It keeps a shared tablet from showing children's names
 * before someone chooses. */
function GuardianPortalChoice() {
  const navigate = useNavigate();
  const { closeSession } = useAuth();

  async function handleLogout() {
    await closeSession();
    navigate("/login", { replace: true });
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>¿Cómo quieres continuar?</h1>
      <p className={styles.subtitle}>Entra a tu portal o pásale el equipo a tu peque.</p>

      <div className={styles.portalChoices}>
        <button type="button" className={styles.portalCard} onClick={() => navigate("/guardian/verify-2fa")}>
          <img src={avatarGuardian} alt="" className={styles.portalCardIcon} />
          <span className={styles.portalCardText}>
            <span className={styles.portalCardTitle}>Portal Padres</span>
            <span className={styles.portalCardNote}>Todo tu espacio de gestión familiar, en un solo lugar.</span>
          </span>
        </button>
        <button type="button" className={styles.portalCard} onClick={() => navigate(routeIntoKids())}>
          <img src={avatarPeques} alt="" className={styles.portalCardIcon} />
          <span className={styles.portalCardText}>
            <span className={styles.portalCardTitle}>Portal Peques</span>
            <span className={styles.portalCardNote}>Su lugar para explorar, aprender y progresar.</span>
          </span>
        </button>
      </div>

      <div className={styles.notice}>
        <IconInfo className={styles.noticeIcon} />
        <p className={styles.noticeText}>
          Si va a entrar tu peque: que se siente frente a la cámara y la pantalla, a un brazo de distancia como
          máximo, con buena luz y sin nadie más en el encuadre. Al dar clic en su portal entrarán directo a calibrar
          la sesión.
        </p>
      </div>

      <button type="button" className={styles.logoutButton} onClick={handleLogout}>
        <LogOut size={20} strokeWidth={2} aria-hidden="true" />
        Cerrar sesión
      </button>
    </main>
  );
}
