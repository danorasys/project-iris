import { useCallback, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/shared/auth/AuthContext";
import { useMiPerfilTutor } from "@/shared/api/hooks/useAuthApi";
import { useNotificacionesSinLeer } from "@/shared/api/hooks/useNotifications";
import { IconArrowLeft, IconBell, IconChild, IconInfo, IconLogOut, IconUserCircle } from "@/shared/ui/icons";
import logoIris from "@/assets/landing/logo-iris.png";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { initials } from "@/features/utils/initials";
import { PortalAccessProvider } from "../PortalAccessProvider";
import { MiPerfilSection } from "../sections/MiPerfilSection";
import { MisPequesSection } from "../sections/MisPequesSection";
import { NotificacionesSection } from "../sections/NotificacionesSection";
import styles from "./GuardianPortalPage.module.css";

type SectionId = "perfil" | "peques" | "notificaciones";

const SECTIONS: { id: SectionId; label: string; Icon: typeof IconUserCircle }[] = [
  { id: "perfil", label: "Mi perfil", Icon: IconUserCircle },
  { id: "peques", label: "Mis peques", Icon: IconChild },
  { id: "notificaciones", label: "Notificaciones", Icon: IconBell },
];

interface PendingConfirm {
  message: string;
  acceptLabel: string;
  cancelLabel: string;
  danger?: boolean;
  onAccept: () => void;
}

/** `/guardian/portal`, the parents' panel. The sidebar on the left has the
 * menu (mi perfil, mis peques, notificaciones, regresar and cerrar sesión)
 * and who is signed in at the bottom. Closing every session is in the
 * security part of Mi perfil. The content on the right changes with
 * local state, not with a route change.
 *
 * Each section works with real data, see MiPerfilSection, MisPequesSection
 * and NotificacionesSection.
 *
 * A guardian reaches this page either right after finishing 2FA setup
 * during registration, or, later on, through the "Portal de padres" link
 * on the student profile screen, which first asks for a 2FA code at
 * `/guardian/verify-2fa`. `RequirePortalAccess` keeps the URL from being
 * used to skip that step. */
export default function GuardianPortalPage() {
  const navigate = useNavigate();
  const { closeSession } = useAuth();
  // Same query as Mi perfil, so it comes from the cache.
  const profile = useMiPerfilTutor().data;
  // Sent by the 2FA page: wrong codes typed since the last good one.
  const failedAttempts = (useLocation().state as { failedAttempts?: number } | null)?.failedAttempts ?? 0;
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>("perfil");
  // Where "Regresar" in Notificaciones goes back to.
  const [previousSection, setPreviousSection] = useState<SectionId>("perfil");
  const unreadCount = useNotificacionesSinLeer().data ?? 0;
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  // Any way of leaving a form with unsaved changes (Mi perfil or the data of
  // a kid) — another sidebar tab, regresar, cerrar sesión — goes through this
  // check first, so the guardian gets a warning whichever button they click.
  const guardWithDirtyCheck = useCallback(
    (action: () => void) => {
      if (!hasUnsavedChanges) {
        action();
        return;
      }
      setConfirm({
        message: "Tienes cambios sin guardar. Se perderán si continúas.",
        acceptLabel: "Continuar sin guardar",
        cancelLabel: "Cancelar",
        danger: true,
        onAccept: () => {
          setHasUnsavedChanges(false);
          action();
        },
      });
    },
    [hasUnsavedChanges],
  );

  function selectSection(section: SectionId) {
    if (section === activeSection) return;
    guardWithDirtyCheck(() => {
      setConfirm(null);
      setPreviousSection(activeSection);
      setActiveSection(section);
    });
  }

  function requestBack() {
    guardWithDirtyCheck(() => {
      setConfirm({
        message: "¿Estás seguro de regresar al selector de perfil?",
        acceptLabel: "Sí, regresar",
        cancelLabel: "Cancelar",
        onAccept: () => navigate("/login/guardian/portal", { replace: true }),
      });
    });
  }

  function requestLogout() {
    guardWithDirtyCheck(() => {
      setConfirm({
        message: "¿Estás seguro de cerrar sesión?",
        acceptLabel: "Sí, cerrar sesión",
        cancelLabel: "Cancelar",
        danger: true,
        onAccept: () => {
          // RequireRol already redirects to /login/adult on its own once
          // the session is cleared, so this line mostly just makes that
          // same destination explicit here too.
          void closeSession().then(() => navigate("/login/adult", { replace: true }));
        },
      });
    });
  }

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <img src={logoIris} alt="" className={styles.brandLogo} />
          <div className={styles.brandText}>
            <span className={styles.brandName}>IRIS</span>
            <span className={styles.brandLabel}>Portal de Padres</span>
          </div>
        </div>

        <nav className={styles.nav} aria-label="Opciones del portal de padres">
          <span className={styles.navGroupLabel}>Menú</span>
          {SECTIONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className={activeSection === id ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
              aria-current={activeSection === id ? "page" : undefined}
              onClick={() => selectSection(id)}
            >
              <span className={styles.navIcon}>
                <Icon width={18} height={18} />
              </span>
              <span className={styles.navLabel}>{label}</span>
              {id === "notificaciones" && unreadCount > 0 && (
                <span className={styles.navBadge}>
                  {unreadCount > 99 ? "99+" : unreadCount}
                  <span className={styles.visuallyHidden}> sin leer</span>
                </span>
              )}
            </button>
          ))}
          <button type="button" className={styles.navItem} onClick={requestBack}>
            <span className={styles.navIcon}>
              <IconArrowLeft width={18} height={18} />
            </span>
            <span className={styles.navLabel}>Regresar</span>
          </button>
          <button type="button" className={`${styles.navItem} ${styles.navItemDanger}`} onClick={requestLogout}>
            <span className={styles.navIcon}>
              <IconLogOut width={18} height={18} />
            </span>
            <span className={styles.navLabel}>Cerrar sesión</span>
          </button>
        </nav>

        <div className={styles.account}>
          {profile && (
            <div className={styles.accountCard}>
              <span className={styles.accountInitials} aria-hidden="true">
                {initials(profile.first_name, profile.last_name)}
              </span>
              <span className={styles.accountText}>
                <span className={styles.accountName}>{profile.first_name}</span>
                <span className={styles.accountEmail}>{profile.email}</span>
              </span>
            </div>
          )}
        </div>
      </aside>

      <PortalAccessProvider>
        <main className={styles.content}>
          {failedAttempts > 0 && !noticeDismissed && (
            <div className={styles.securityNotice} role="alert">
              <IconInfo width={20} height={20} className={styles.securityNoticeIcon} />
              <p className={styles.securityNoticeText}>
                {failedAttempts === 1
                  ? "Desde tu última entrada alguien escribió 1 código incorrecto en tu cuenta."
                  : `Desde tu última entrada alguien escribió ${failedAttempts} códigos incorrectos en tu cuenta.`}{" "}
                Si no fuiste tú, cierra todas tus sesiones y cambia tu contraseña.
              </p>
              <button type="button" className={styles.securityNoticeClose} onClick={() => setNoticeDismissed(true)}>
                Entendido
              </button>
            </div>
          )}
          {/* The key makes this box new on every change of section, so its
              entrance animation plays again. */}
          <div key={activeSection} className={styles.sectionEnter}>
            {activeSection === "perfil" && <MiPerfilSection onDirtyChange={setHasUnsavedChanges} />}
            {activeSection === "peques" && <MisPequesSection onDirtyChange={setHasUnsavedChanges} />}
            {activeSection === "notificaciones" && (
              <NotificacionesSection onBack={() => selectSection(previousSection)} />
            )}
          </div>
        </main>
      </PortalAccessProvider>

      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          acceptLabel={confirm.acceptLabel}
          cancelLabel={confirm.cancelLabel}
          danger={confirm.danger}
          onAccept={confirm.onAccept}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
