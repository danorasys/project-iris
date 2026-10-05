import { useCallback, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { initials } from "@/features/utils/initials";
import { useAuth } from "@/shared/auth/AuthContext";
import { useTeacherClassrooms } from "@/shared/api/hooks/useClassroomsApi";
import { useUnreadNotifications } from "@/shared/api/hooks/useNotifications";
import { useMyTeacherAccount } from "@/shared/api/hooks/useTeacherProfileApi";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { IconBell, IconLogOut, IconSchool, IconUserCircle } from "@/shared/ui/icons";
import { PortalSection, PortalShell, type PortalNavItem } from "@/shared/ui/portal/PortalShell";
import { ClassroomsSection } from "./sections/ClassroomsSection";
import type { ClassroomView } from "./sections/ClassroomSpace";
import { TeacherNotificationsSection } from "./sections/TeacherNotificationsSection";
import { TeacherProfileSection } from "./sections/TeacherProfileSection";
import styles from "./TeacherPortalPage.module.css";

export type TeacherSection = "notificaciones" | "perfil" | "clases";

/** Where to land, sent by other screens (the lesson editor, the old routes). */
export interface TeacherPortalState {
  section?: TeacherSection;
  classroomId?: string;
  view?: ClassroomView;
}

interface PendingConfirm {
  title: string;
  message: string;
  acceptLabel: string;
  danger?: boolean;
  onAccept: () => void;
}

/** `/teacher/portal`, the Portal Docente (HU-68). The sidebar has the options
 * (notificaciones, mi perfil, mis clases and cerrar sesión) and who is
 * signed in; the content on the right changes without reloading. A notice
 * on top says how many join requests wait, adding all the classrooms, and
 * it updates by itself (HU-69). Same frame as the Portal de Padres. */
export default function TeacherPortalPage() {
  const navigate = useNavigate();
  const { closeSession } = useAuth();
  const landing = (useLocation().state as TeacherPortalState | null) ?? {};
  const account = useMyTeacherAccount().data;
  const unread = useUnreadNotifications("teacher").data ?? 0;
  const classrooms = useTeacherClassrooms().data ?? [];
  const pending = classrooms.reduce((total, classroom) => total + classroom.pending_requests, 0);

  const [section, setSection] = useState<TeacherSection>(landing.section ?? "clases");
  const [previous, setPrevious] = useState<TeacherSection>("clases");
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  // Leaving Mi perfil with unsaved changes, by any way, asks first.
  const guardDirty = useCallback(
    (action: () => void) => {
      if (!dirty) {
        action();
        return;
      }
      setConfirm({
        title: "Cambios sin guardar",
        message: "Tienes cambios sin guardar. Se perderán si continúas.",
        acceptLabel: "Continuar sin guardar",
        danger: true,
        onAccept: () => {
          setDirty(false);
          setConfirm(null);
          action();
        },
      });
    },
    [dirty],
  );

  function select(next: TeacherSection) {
    if (next === section) return;
    guardDirty(() => {
      setPrevious(section);
      setSection(next);
    });
  }

  function requestLogout() {
    guardDirty(() =>
      setConfirm({
        title: "Cerrar sesión",
        message: "¿Estás seguro de cerrar sesión?",
        acceptLabel: "Sí, cerrar sesión",
        danger: true,
        onAccept: () => {
          setConfirm(null);
          void closeSession().then(() => navigate("/login/adult", { replace: true }));
        },
      }),
    );
  }

  const items: PortalNavItem[] = [
    {
      key: "notificaciones",
      label: "Notificaciones",
      Icon: IconBell,
      onSelect: () => select("notificaciones"),
      active: section === "notificaciones",
      badgeCount: unread,
      badgeLabel: "sin leer",
    },
    { key: "perfil", label: "Mi perfil", Icon: IconUserCircle, onSelect: () => select("perfil"), active: section === "perfil" },
    { key: "clases", label: "Mis clases", Icon: IconSchool, onSelect: () => select("clases"), active: section === "clases" },
    { key: "salir", label: "Cerrar sesión", Icon: IconLogOut, onSelect: requestLogout, danger: true },
  ];

  return (
    <PortalShell
      portalLabel="Portal Docente"
      navLabel="Opciones del portal docente"
      items={items}
      account={
        account && {
          initials: initials(account.first_name, account.last_name),
          name: account.first_name,
          email: account.email,
        }
      }
      overlay={
        confirm && (
          <ConfirmDialog
            title={confirm.title}
            message={confirm.message}
            acceptLabel={confirm.acceptLabel}
            cancelLabel="Cancelar"
            danger={confirm.danger}
            onAccept={confirm.onAccept}
            onCancel={() => setConfirm(null)}
          />
        )
      }
    >
      {pending > 0 && (
        <div className={styles.pendingNotice} role="status" aria-live="polite">
          <span className={styles.pendingCount}>{pending}</span>
          <p className={styles.pendingText}>
            {pending === 1
              ? "Tienes 1 solicitud de ingreso esperando tu respuesta."
              : `Tienes ${pending} solicitudes de ingreso esperando tu respuesta, sumando todas tus clases.`}
          </p>
          {section !== "notificaciones" && (
            <button type="button" className={styles.pendingButton} onClick={() => select("notificaciones")}>
              Revisar
            </button>
          )}
        </div>
      )}

      {/* The key makes this box new on every change of section, so its
          entrance animation plays again. */}
      <PortalSection key={section}>
        {section === "clases" && (
          <ClassroomsSection initialClassroomId={landing.classroomId} initialView={landing.view} />
        )}
        {section === "perfil" && <TeacherProfileSection onDirtyChange={setDirty} />}
        {section === "notificaciones" && <TeacherNotificationsSection onBack={() => select(previous)} />}
      </PortalSection>
    </PortalShell>
  );
}
