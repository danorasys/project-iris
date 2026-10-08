import { useCallback, useState } from "react";
import type { NotificationItem } from "@iris/shared-types";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/shared/auth/useAuth";
import { useMiPerfilTutor } from "@/shared/api/hooks/useAuthApi";
import { useNotificacionesSinLeer } from "@/shared/api/hooks/useNotifications";
import { IconArrowLeft, IconBell, IconChild, IconHome, IconInfo, IconLogOut, IconUserCircle } from "@/shared/ui/icons";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { PortalSection, PortalShell, type PortalNavItem } from "@/shared/ui/portal/PortalShell";
import { initials } from "@/features/utils/initials";
import { PortalAccessProvider } from "../PortalAccessProvider";
import { GuardianHomeSection } from "../sections/GuardianHomeSection";
import { MiPerfilSection } from "../sections/MiPerfilSection";
import { MisPequesSection, type StudentOption } from "../sections/MisPequesSection";
import { NotificacionesSection } from "../sections/NotificacionesSection";
import styles from "./GuardianPortalPage.module.css";

type SectionId = "inicio" | "perfil" | "peques" | "notificaciones";

// The menu goes by what a family comes to do: Inicio, the kids and the
// notifications on top; "Mi perfil" (seldom used, and also under the
// initials of the top bar) down with the account, next to "Cambiar de
// perfil" and "Cerrar sesión". The Portal Docente keeps the same order.
const SECTIONS: { id: SectionId; label: string; Icon: typeof IconUserCircle; footer?: boolean }[] = [
  { id: "inicio", label: "Inicio", Icon: IconHome },
  { id: "peques", label: "Mis peques", Icon: IconChild },
  { id: "notificaciones", label: "Notificaciones", Icon: IconBell },
  { id: "perfil", label: "Mi perfil", Icon: IconUserCircle, footer: true },
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
  const [activeSection, setActiveSection] = useState<SectionId>("inicio");
  // The kid (and option) to open right away in "Mis peques", like from
  // "Ver su espacio" or "3 clases" in Inicio.
  const [openStudent, setOpenStudent] = useState<{ id: string; option: StudentOption | null } | null>(null);
  // The notification to open right away in "Notificaciones", clicked in Inicio.
  const [openedNotification, setOpenedNotification] = useState<NotificationItem | null>(null);
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

  function selectSection(section: SectionId, student: { id: string; option: StudentOption | null } | null = null) {
    if (section === activeSection && student === null) return;
    guardWithDirtyCheck(() => {
      setConfirm(null);
      setOpenStudent(student);
      setOpenedNotification(null);
      setActiveSection(section);
    });
  }

  function openNotification(notification: NotificationItem) {
    guardWithDirtyCheck(() => {
      setConfirm(null);
      setOpenStudent(null);
      setOpenedNotification(notification);
      setActiveSection("notificaciones");
    });
  }

  function requestBack() {
    guardWithDirtyCheck(() => {
      setConfirm({
        title: "Cambiar de perfil",
        message: "¿Quieres volver a elegir entre el Portal Padres y el Portal Peques?",
        acceptLabel: "Sí, cambiar de perfil",
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
    ...SECTIONS.map(({ id, label, Icon, footer }) => ({
      key: id,
      label,
      Icon,
      onSelect: () => selectSection(id),
      active: activeSection === id,
      badgeCount: id === "notificaciones" ? unreadCount : undefined,
      badgeLabel: "sin leer",
      footer,
    })),
    // Back to choosing between Portal Padres and Portal Peques; "Regresar"
    // alone didn't say where to.
    { key: "regresar", label: "Cambiar de perfil", Icon: IconArrowLeft, onSelect: requestBack, footer: true },
    { key: "salir", label: "Cerrar sesión", Icon: IconLogOut, onSelect: requestLogout, danger: true, footer: true },
  ];
  const current = SECTIONS.find((section) => section.id === activeSection);

  return (
    <PortalShell
      portalLabel="Portal de Padres"
      navLabel="Opciones del portal de padres"
      items={items}
      // Each section draws its own heading (Inicio, its welcome banner), so
      // the bar only says where you are.
      header={{ section: current?.label ?? "" }}
      notifications={{ count: unreadCount, onOpen: () => selectSection("notificaciones") }}
      account={
        profile && {
          initials: initials(profile.first_name, profile.last_name),
          name: profile.first_name,
          email: profile.email,
          onOpen: () => selectSection("perfil"),
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
        <PortalSection
          key={`${activeSection}-${openStudent?.id ?? ""}-${openStudent?.option ?? ""}-${openedNotification?.id ?? ""}`}
        >
          {activeSection === "inicio" && (
            <GuardianHomeSection
              onOpenStudent={(id, option) => selectSection("peques", { id, option: option ?? null })}
              onOpenStudents={() => selectSection("peques")}
              onOpenNotifications={() => selectSection("notificaciones")}
              onOpenNotification={openNotification}
            />
          )}
          {activeSection === "perfil" && <MiPerfilSection onDirtyChange={setHasUnsavedChanges} />}
          {activeSection === "peques" && (
            <MisPequesSection
              initialStudentId={openStudent?.id ?? null}
              initialOption={openStudent?.option ?? null}
              onDirtyChange={setHasUnsavedChanges}
            />
          )}
          {activeSection === "notificaciones" && <NotificacionesSection initialNotification={openedNotification} />}
        </PortalSection>
      </PortalAccessProvider>
    </PortalShell>
  );
}
