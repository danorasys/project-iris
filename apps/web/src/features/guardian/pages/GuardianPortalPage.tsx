import { useCallback, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/shared/auth/useAuth";
import { useMiPerfilTutor } from "@/shared/api/hooks/useAuthApi";
import { useNotificacionesSinLeer } from "@/shared/api/hooks/useNotifications";
import { IconArrowLeft, IconBell, IconChild, IconInfo, IconLogOut, IconUserCircle } from "@/shared/ui/icons";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { PortalSection, PortalShell, type PortalNavItem } from "@/shared/ui/portal/PortalShell";
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
  title: string;
  message: string;
  acceptLabel: string;
  cancelLabel: string;
  danger?: boolean;
  onAccept: () => void;
}

/** `/guardian/portal`, the parents' portal: the menu on the left and the
 * section on the right, which changes with local state, not with the URL.
 * It's reached after the 2FA setup or, later, from the profile screen
 * after typing a 2FA code. `RequirePortalAccess` stops the URL from
 * skipping that code. */
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
        title: "Cambios sin guardar",
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
        title: "Regresar al selector de perfil",
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
        title: "Cerrar sesión",
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

  const items: PortalNavItem[] = [
    ...SECTIONS.map(({ id, label, Icon }) => ({
      key: id,
      label,
      Icon,
      onSelect: () => selectSection(id),
      active: activeSection === id,
      badgeCount: id === "notificaciones" ? unreadCount : undefined,
      badgeLabel: "sin leer",
    })),
    { key: "regresar", label: "Regresar", Icon: IconArrowLeft, onSelect: requestBack },
    { key: "salir", label: "Cerrar sesión", Icon: IconLogOut, onSelect: requestLogout, danger: true },
  ];

  return (
    <PortalShell
      portalLabel="Portal de Padres"
      navLabel="Opciones del portal de padres"
      items={items}
      account={
        profile && {
          initials: initials(profile.first_name, profile.last_name),
          name: profile.first_name,
          email: profile.email,
        }
      }
      overlay={
        confirm && (
          <ConfirmDialog
            title={confirm.title}
            message={confirm.message}
            acceptLabel={confirm.acceptLabel}
            cancelLabel={confirm.cancelLabel}
            danger={confirm.danger}
            onAccept={confirm.onAccept}
            onCancel={() => setConfirm(null)}
          />
        )
      }
    >
      <PortalAccessProvider>
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
        <PortalSection key={activeSection}>
          {activeSection === "perfil" && <MiPerfilSection onDirtyChange={setHasUnsavedChanges} />}
          {activeSection === "peques" && <MisPequesSection onDirtyChange={setHasUnsavedChanges} />}
          {activeSection === "notificaciones" && <NotificacionesSection onBack={() => selectSection(previousSection)} />}
        </PortalSection>
      </PortalAccessProvider>
    </PortalShell>
  );
}
