import { useCallback, useState } from "react";
import type { NotificationItem } from "@iris/shared-types";
import { useLocation, useNavigate } from "react-router-dom";
import { initials } from "@/features/utils/initials";
import { useAuth } from "@/shared/auth/useAuth";
import { useTeacherClassrooms } from "@/shared/api/hooks/useClassroomsApi";
import { useUnreadNotifications } from "@/shared/api/hooks/useNotifications";
import { useMyTeacherAccount } from "@/shared/api/hooks/useTeacherProfileApi";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { IconBell, IconClassroom, IconHome, IconLogOut, IconUserCircle } from "@/shared/ui/icons";
import { PortalSection, PortalShell, type PortalHeader, type PortalNavItem } from "@/shared/ui/portal/PortalShell";
import { ClassroomsSection } from "./sections/ClassroomsSection";
import type { ClassroomView } from "./sections/ClassroomSpace";
import { TeacherHomeSection } from "./sections/TeacherHomeSection";
import { TeacherNotificationsSection } from "./sections/TeacherNotificationsSection";
import { TeacherProfileSection } from "./sections/TeacherProfileSection";
import styles from "./TeacherPortalPage.module.css";

export type TeacherSection = "inicio" | "notificaciones" | "perfil" | "clases";

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

// Where "Mis clases" opens: a classroom (and which part of it) or the
// dialog of a new one. A new object on every jump, so the section starts
// over with it even if it was already on screen.
interface ClassesTarget {
  classroomId?: string;
  view?: ClassroomView;
  creating?: boolean;
}

/** `/teacher/portal`, the Portal Docente (HU-68). It opens on Inicio, the
 * summary of the teacher's classes; the menu has the sections (Inicio, Mis
 * clases, Notificaciones, Mi perfil) and Cerrar sesión, and the content
 * changes without reloading. A notice says how many join requests wait,
 * adding all the classrooms, and it updates by itself (HU-69). */
export default function TeacherPortalPage() {
  const navigate = useNavigate();
  const { closeSession } = useAuth();
  const landing = (useLocation().state as TeacherPortalState | null) ?? {};
  const account = useMyTeacherAccount().data;
  const unread = useUnreadNotifications("teacher").data ?? 0;
  const classrooms = useTeacherClassrooms().data ?? [];
  const pending = classrooms.reduce((total, classroom) => total + classroom.pending_requests, 0);

  const [section, setSection] = useState<TeacherSection>(landing.section ?? "inicio");
  const [classesTarget, setClassesTarget] = useState<ClassesTarget>({
    classroomId: landing.classroomId,
    view: landing.view,
  });
  // The notification to open right away in "Notificaciones", clicked in Inicio.
  const [openedNotification, setOpenedNotification] = useState<NotificationItem | null>(null);
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
      if (next === "clases") setClassesTarget({});
      setOpenedNotification(null);
      setSection(next);
    });
  }

  function openNotification(notification: NotificationItem) {
    setOpenedNotification(notification);
    setSection("notificaciones");
  }

  // From Inicio straight into a classroom, or into the dialog of a new one.
  function openClasses(target: ClassesTarget) {
    setClassesTarget(target);
    setSection("clases");
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
    { key: "inicio", label: "Inicio", Icon: IconHome, onSelect: () => select("inicio"), active: section === "inicio" },
    {
      key: "clases",
      label: "Mis clases",
      Icon: IconClassroom,
      onSelect: () => select("clases"),
      active: section === "clases",
    },
    {
      key: "notificaciones",
      label: "Notificaciones",
      Icon: IconBell,
      onSelect: () => select("notificaciones"),
      active: section === "notificaciones",
      badgeCount: unread,
      badgeLabel: "sin leer",
    },
    // "Mi perfil" goes down with the account, like in the Portal de Padres.
    {
      key: "perfil",
      label: "Mi perfil",
      Icon: IconUserCircle,
      onSelect: () => select("perfil"),
      active: section === "perfil",
      footer: true,
    },
    { key: "salir", label: "Cerrar sesión", Icon: IconLogOut, onSelect: requestLogout, danger: true, footer: true },
  ];

  // What the top bar says on each section. Mis clases, Notificaciones and Mi
  // perfil draw their own heading, like in the Portal de Padres, so there it
  // only says where you are.
  const headers: Record<TeacherSection, PortalHeader> = {
    // Inicio greets in its own banner (WelcomeBanner).
    inicio: { section: "Inicio" },
    clases: { section: "Mis clases" },
    notificaciones: { section: "Notificaciones" },
    perfil: { section: "Mi perfil" },
  };

  return (
    <PortalShell
      portalLabel="Portal Docente"
      navLabel="Opciones del portal docente"
      items={items}
      header={headers[section]}
      notifications={{ count: unread, onOpen: () => select("notificaciones") }}
      account={
        account && {
          initials: initials(account.first_name, account.last_name),
          name: account.first_name,
          email: account.email,
          onOpen: () => select("perfil"),
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
      {/* Inicio already lists the requests among what needs attention. */}
      {pending > 0 && section !== "inicio" && (
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

      {/* The key makes this box new on every change of section (and of the
          classroom opened from Inicio), so its entrance plays again. */}
      <PortalSection
        key={
          section === "clases"
            ? `clases-${classesTarget.classroomId ?? ""}`
            : `${section}-${openedNotification?.id ?? ""}`
        }
      >
        {section === "inicio" && (
          <TeacherHomeSection
            firstName={account?.first_name}
            onOpenClassroom={(classroomId, view) => openClasses({ classroomId, view })}
            onOpenClassrooms={() => select("clases")}
            onCreateClassroom={() => openClasses({ creating: true })}
            onOpenNotifications={() => select("notificaciones")}
            onOpenNotification={openNotification}
          />
        )}
        {section === "clases" && (
          <ClassroomsSection
            initialClassroomId={classesTarget.classroomId}
            initialView={classesTarget.view}
            startCreating={classesTarget.creating}
          />
        )}
        {section === "perfil" && <TeacherProfileSection onDirtyChange={setDirty} />}
        {section === "notificaciones" && <TeacherNotificationsSection initialNotification={openedNotification} />}
      </PortalSection>
    </PortalShell>
  );
}
