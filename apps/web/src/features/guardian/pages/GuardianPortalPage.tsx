import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/shared/auth/AuthContext";
import { IconArrowLeft, IconBell, IconChild, IconLogOut, IconUserCircle } from "@/shared/ui/icons";
import { IrisMark } from "@/shared/ui/IrisMark";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { MiPerfilSection } from "../sections/MiPerfilSection";
import { MisPequesSection } from "../sections/MisPequesSection";
import { ComingSoonSection } from "../sections/ComingSoonSection";
import styles from "./GuardianPortalPage.module.css";

type SectionId = "perfil" | "peques" | "notificaciones";

interface PendingConfirm {
  message: string;
  acceptLabel: string;
  cancelLabel: string;
  danger?: boolean;
  onAccept: () => void;
}

/** `/guardian/portal`, the parents' panel. It has a sidebar on the left with
 * five options (mi perfil, mis peques, notificaciones, regresar, cerrar
 * sesión), and the content on the right changes depending on which one is
 * selected, without reloading the page — it's just local state, not a
 * route change.
 *
 * "Mi perfil" is fully working, see MiPerfilSection. "Mis peques" shows the
 * guardian's real children, but the deeper screens for each one are still
 * pending. "Notificaciones" is only a placeholder for now.
 *
 * A guardian reaches this page either right after finishing 2FA setup
 * during registration, or, later on, through the "Portal de padres" link
 * on the student profile screen, which first asks them to confirm their
 * password again at `/guardian/confirm-password`. */
export default function GuardianPortalPage() {
  const navigate = useNavigate();
  const { closeSession } = useAuth();
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

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <IrisMark size={32} />
          <span className={styles.brandLabel}>Portal de Padres</span>
        </div>

        <nav className={styles.nav} aria-label="Opciones del portal de padres">
          <button
            type="button"
            className={activeSection === "perfil" ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
            aria-current={activeSection === "perfil" ? "page" : undefined}
            onClick={() => selectSection("perfil")}
          >
            <IconUserCircle width={20} height={20} />
            Mi perfil
          </button>
          <button
            type="button"
            className={activeSection === "peques" ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
            aria-current={activeSection === "peques" ? "page" : undefined}
            onClick={() => selectSection("peques")}
          >
            <IconChild width={20} height={20} />
            Mis peques
          </button>
          <button
            type="button"
            className={
              activeSection === "notificaciones" ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
            }
            aria-current={activeSection === "notificaciones" ? "page" : undefined}
            onClick={() => selectSection("notificaciones")}
          >
            <IconBell width={20} height={20} />
            Notificaciones
          </button>

          <div className={styles.navDivider} />

          <button type="button" className={styles.navItem} onClick={requestBack}>
            <IconArrowLeft width={20} height={20} />
            Regresar
          </button>
          <button type="button" className={`${styles.navItem} ${styles.navItemDanger}`} onClick={requestLogout}>
            <IconLogOut width={20} height={20} />
            Cerrar sesión
          </button>
        </nav>
      </aside>

      <main className={styles.content}>
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
