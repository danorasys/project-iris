import { useCallback, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/shared/auth/AuthContext";
import { useCerrarTodasMisSesiones, useMiPerfilTutor } from "@/shared/api/hooks/useAuthApi";
import { IconArrowLeft, IconBell, IconChild, IconInfo, IconLock, IconLogOut, IconUserCircle } from "@/shared/ui/icons";
import logoIris from "@/assets/landing/logo-iris.png";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { initials } from "@/features/utils/initials";
import { PortalAccessProvider } from "../PortalAccessProvider";
import { MiPerfilSection } from "../sections/MiPerfilSection";
import { MisPequesSection } from "../sections/MisPequesSection";
import { ComingSoonSection } from "../sections/ComingSoonSection";
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
 * sections (mi perfil, mis peques, notificaciones) and the account options
 * (regresar, cerrar sesión, cerrar todas las sesiones). The content on the
 * right changes with local state, not with a route change.
 *
 * "Mi perfil" is fully working, see MiPerfilSection. "Mis peques" shows the
 * guardian's real children, but the deeper screens for each one are still
 * pending. "Notificaciones" is only a placeholder for now.
 *
 * A guardian reaches this page either right after finishing 2FA setup
 * during registration, or, later on, through the "Portal de padres" link
 * on the student profile screen, which first asks for a 2FA code at
 * `/guardian/verify-2fa`. `RequirePortalAccess` keeps the URL from being
 * used to skip that step. */
export default function GuardianPortalPage() {
  const navigate = useNavigate();
  const { closeSession, discardSession } = useAuth();
  const closeAllSessions = useCerrarTodasMisSesiones();
  // Same query as Mi perfil, so it comes from the cache.
  const profile = useMiPerfilTutor().data;
  // Sent by the 2FA page: wrong codes typed since the last good one.
  const failedAttempts = (useLocation().state as { failedAttempts?: number } | null)?.failedAttempts ?? 0;
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>("perfil");
  const [isProfileDirty, setIsProfileDirty] = useState(false);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  // Any way of leaving "mi perfil" — another sidebar tab, regresar, cerrar
  // sesión — goes through this check first, so an unsaved edit gets a
  // warning no matter which button the guardian clicks.
  const guardWithDirtyCheck = useCallback(
    (action: () => void) => {
      if (!isProfileDirty) {
        action();
        return;
      }
      setConfirm({
        message: "Tienes cambios sin guardar en tu perfil. Se perderán si continúas.",
        acceptLabel: "Continuar sin guardar",
        cancelLabel: "Cancelar",
        danger: true,
        onAccept: () => {
          setIsProfileDirty(false);
          action();
        },
      });
    },
    [isProfileDirty],
  );

  function selectSection(section: SectionId) {
    if (section === activeSection) return;
    guardWithDirtyCheck(() => {
      setConfirm(null);
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

  function requestCloseAllSessions() {
    guardWithDirtyCheck(() => {
      setConfirm({
        message: "Vamos a cerrar tu sesión en todos los dispositivos, incluido este. ¿Continuar?",
        acceptLabel: "Sí, cerrar todas",
        cancelLabel: "Cancelar",
        danger: true,
        onAccept: () => {
          setConfirm(null);
          void closeAllSessions.mutateAsync().then(
            () => {
              discardSession();
              navigate("/login/adult", {
                replace: true,
                state: { aviso: "Cerramos tus sesiones en todos los dispositivos. Inicia sesión de nuevo." },
              });
            },
            () => setConfirm(null),
          );
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
            </button>
          ))}
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

          <nav className={styles.nav} aria-label="Cuenta">
            <span className={styles.navGroupLabel}>Cuenta</span>
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
            <button
              type="button"
              className={`${styles.navItem} ${styles.navItemDanger}`}
              onClick={requestCloseAllSessions}
            >
              <span className={styles.navIcon}>
                <IconLock width={18} height={18} />
              </span>
              <span className={styles.navLabel}>Cerrar todas las sesiones</span>
            </button>
          </nav>
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
          {activeSection === "perfil" && <MiPerfilSection onDirtyChange={setIsProfileDirty} />}
          {activeSection === "peques" && <MisPequesSection />}
          {activeSection === "notificaciones" && (
            <ComingSoonSection
              icon={<IconBell width={32} height={32} />}
              title="Notificaciones"
              text="Estamos construyendo tu bandeja de notificaciones. Muy pronto vas a poder ver aquí los mensajes de los docentes de tus hijos e hijas."
            />
          )}
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
