import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { initials } from "@/features/utils/initials";
import { useAuth } from "@/shared/auth/useAuth";
import { useUnreadNotifications } from "@/shared/api/hooks/useNotifications";
import { useMyTeacherAccount } from "@/shared/api/hooks/useTeacherProfileApi";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { PortalShell } from "@/shared/ui/portal/PortalShell";
import { teacherNavItems } from "./teacherNav";
import type { TeacherPortalState, TeacherSection } from "./TeacherPortalPage";

const SECTION_NAMES: Record<TeacherSection, string> = {
  inicio: "Inicio",
  clases: "Mis clases",
  notificaciones: "Notificaciones",
  perfil: "Mi perfil",
};

/** The Portal Docente around a screen that has its own address, like the
 * lesson editor: the same menu, top bar, bell and account as the portal, so
 * it doesn't feel like leaving it. The menu and the bell go back to the
 * portal, to the section they name. */
export function TeacherPortalFrame({
  section,
  children,
  overlay,
}: {
  /** The section it belongs to, marked in the menu and in the trail. */
  section: TeacherSection;
  children: ReactNode;
  overlay?: ReactNode;
}) {
  const navigate = useNavigate();
  const { closeSession } = useAuth();
  const account = useMyTeacherAccount().data;
  const unread = useUnreadNotifications("teacher").data ?? 0;
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  const go = (next: TeacherSection) => {
    const state: TeacherPortalState = { section: next };
    navigate("/teacher/portal", { state });
  };

  return (
    <PortalShell
      portalLabel="Portal Docente"
      navLabel="Opciones del portal docente"
      items={teacherNavItems({ section, select: go, logout: () => setConfirmingLogout(true), unread })}
      header={{ section: SECTION_NAMES[section] }}
      notifications={{ count: unread, onOpen: () => go("notificaciones") }}
      account={
        account && {
          initials: initials(account.first_name, account.last_name),
          name: account.first_name,
          email: account.email,
          onOpen: () => go("perfil"),
        }
      }
      overlay={
        <>
          {overlay}
          {confirmingLogout && (
            <ConfirmDialog
              title="Cerrar sesión"
              message="¿Estás seguro de cerrar sesión?"
              acceptLabel="Sí, cerrar sesión"
              cancelLabel="Cancelar"
              danger
              onAccept={() => {
                setConfirmingLogout(false);
                void closeSession().then(() => navigate("/login", { replace: true }));
              }}
              onCancel={() => setConfirmingLogout(false)}
            />
          )}
        </>
      }
    >
      {children}
    </PortalShell>
  );
}
