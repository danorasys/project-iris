import type { ComponentType, ReactNode, SVGProps } from "react";
import logoIris from "@/assets/landing/logo-iris.png";
import styles from "./PortalShell.module.css";

export interface PortalNavItem {
  key: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  onSelect: () => void;
  active?: boolean;
  /** A number at the end of the option, like unread notifications. */
  badgeCount?: number;
  /** What a screen reader says after the number, like "sin leer". */
  badgeLabel?: string;
  /** Turns red on hover, for "cerrar sesión". */
  danger?: boolean;
}

export interface PortalAccount {
  initials: string;
  name: string;
  email: string;
}

interface PortalShellProps {
  /** Under "IRIS" in the sidebar, like "Portal de Padres". */
  portalLabel: string;
  /** The name of the menu for screen readers. */
  navLabel: string;
  items: PortalNavItem[];
  account?: PortalAccount | null;
  children: ReactNode;
  /** Dialogs and the like, after the content. */
  overlay?: ReactNode;
}

/** The frame of the Portal de Padres and the Portal Docente: the sidebar
 * on the left with IRIS, the menu and who is signed in at the bottom, and
 * the content on the right, which changes with the portal's own state
 * (not with the route). On small screens the sidebar becomes a top bar. */
export function PortalShell({ portalLabel, navLabel, items, account, children, overlay }: PortalShellProps) {
  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <img src={logoIris} alt="" className={styles.brandLogo} />
          <div className={styles.brandText}>
            <span className={styles.brandName}>IRIS</span>
            <span className={styles.brandLabel}>{portalLabel}</span>
          </div>
        </div>

        <nav className={styles.nav} aria-label={navLabel}>
          <span className={styles.navGroupLabel}>Menú</span>
          {items.map(({ key, label, Icon, onSelect, active, badgeCount, badgeLabel, danger }) => {
            const classes = [styles.navItem, active ? styles.navItemActive : "", danger ? styles.navItemDanger : ""];
            return (
              <button
                key={key}
                type="button"
                className={classes.filter(Boolean).join(" ")}
                aria-current={active ? "page" : undefined}
                onClick={onSelect}
              >
                <span className={styles.navIcon}>
                  <Icon width={18} height={18} />
                </span>
                <span className={styles.navLabel}>{label}</span>{" "}
                {badgeCount !== undefined && badgeCount > 0 && (
                  <span className={styles.navBadge}>
                    {badgeCount > 99 ? "99+" : badgeCount}{" "}
                    {badgeLabel && <span className={styles.visuallyHidden}>{badgeLabel}</span>}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className={styles.account}>
          {account && (
            <div className={styles.accountCard}>
              <span className={styles.accountInitials} aria-hidden="true">
                {account.initials}
              </span>
              <span className={styles.accountText}>
                <span className={styles.accountName}>{account.name}</span>
                <span className={styles.accountEmail}>{account.email}</span>
              </span>
            </div>
          )}
        </div>
      </aside>

      <main className={styles.content}>{children}</main>
      {overlay}
    </div>
  );
}

/** Wraps the section on screen. Give it a key that changes with the
 * section, so it comes up again with a small animation on every change. */
export function PortalSection({ children }: { children: ReactNode }) {
  return <div className={styles.sectionEnter}>{children}</div>;
}
