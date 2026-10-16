import { IconBell, IconClassroom, IconHome, IconLogOut, IconUserCircle } from "@/shared/ui/icons";
import type { PortalNavItem } from "@/shared/ui/portal/PortalShell";
import type { TeacherSection } from "./TeacherPortalPage";

/** The menu of the Portal Docente, the same wherever the teacher is (the
 * portal itself or the lesson editor): Inicio, Mis clases, Notificaciones
 * with its unread count, and at the bottom Mi perfil and Cerrar sesión. */
export function teacherNavItems({
  section,
  select,
  logout,
  unread,
}: {
  /** The section that's open, marked in the menu. */
  section: TeacherSection;
  select: (section: TeacherSection) => void;
  logout: () => void;
  unread: number;
}): PortalNavItem[] {
  return [
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
    { key: "salir", label: "Cerrar sesión", Icon: IconLogOut, onSelect: logout, danger: true, footer: true },
  ];
}
