import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from "react";
import logoIris from "@/assets/landing/logo-iris.png";
import { IconBell, IconClose, IconMenu } from "@/shared/ui/icons";
import styles from "./PortalShell.module.css";
import { usePortalTheme } from "./usePortalTheme";

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
  /** Goes to the bottom of the menu, next to who is signed in (Regresar,
   * Cerrar sesión), apart from the sections. */
  footer?: boolean;
}

export interface PortalAccount {
  initials: string;
  name: string;
  email: string;
  /** Opens "Mi perfil": the initials of the top bar and the account card
   * of the menu become buttons to it. */
  onOpen?: () => void;
}

/** The top of the content: where you are and, when the section doesn't
 * draw its own heading, its title and the actions that go with it. */
export interface PortalHeader {
  /** The section's name, after the portal's in the trail. */
  section: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
}

interface PortalShellProps {
  /** Under "IRIS" in the menu, like "Portal Docente". */
  portalLabel: string;
  /** The name of the menu for screen readers. */
  navLabel: string;
  items: PortalNavItem[];
  account?: PortalAccount | null;
  header: PortalHeader;
  /** The bell of the top bar, with how many are unread. */
  notifications?: { count: number; onOpen: () => void };
  children: ReactNode;
  /** Dialogs and the like, after the content. */
  overlay?: ReactNode;
}

// Under this width the menu leaves the side and opens as a drawer.
const NARROW = "(max-width: 960px)";

// Without matchMedia (old browsers, the tests' jsdom) it counts as wide.
const canMatch = () => typeof window.matchMedia === "function";

function subscribeNarrow(onChange: () => void) {
  if (!canMatch()) return () => {};
  const query = window.matchMedia(NARROW);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useNarrow() {
  return useSyncExternalStore(
    subscribeNarrow,
    () => canMatch() && window.matchMedia(NARROW).matches,
    () => false,
  );
}

/** The frame of the Portal Docente and the Portal de Padres: the menu on
 * the left (IRIS, the sections, and who is signed in at the bottom) and,
 * on the right, a top bar with where you are and the bell, over the
 * content, which changes with the portal's own state (not with the route).
 * On small screens the menu opens as a drawer from the top bar. */
export function PortalShell({
  portalLabel,
  navLabel,
  items,
  account,
  header,
  notifications,
  children,
  overlay,
}: PortalShellProps) {
  usePortalTheme();
  const narrow = useNarrow();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const firstOption = useRef<HTMLButtonElement>(null);
  // The drawer only exists on small screens; on wide ones it's always shown.
  const drawerOpen = narrow && menuOpen;
  const hidden = narrow && !menuOpen;

  // The open drawer takes the focus to its first option, and Escape closes
  // it giving the focus back to the button that opened it.
  useEffect(() => {
    if (!drawerOpen) return;
    firstOption.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuButton.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const sections = items.filter((item) => !item.footer);
  const footer = items.filter((item) => item.footer);

  function renderItem(item: PortalNavItem, index: number) {
    const { key, label, Icon, onSelect, active, badgeCount, badgeLabel, danger } = item;
    const classes = [styles.navItem, active ? styles.navItemActive : "", danger ? styles.navItemDanger : ""];
    return (
      <button
        key={key}
        ref={index === 0 ? firstOption : undefined}
        type="button"
        className={classes.filter(Boolean).join(" ")}
        aria-current={active ? "page" : undefined}
        onClick={() => {
          setMenuOpen(false);
          onSelect();
        }}
      >
        <span className={styles.navIcon}>
          <Icon width={19} height={19} />
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
  }

  return (
    <div className={styles.page}>
      {drawerOpen && (
        <button
          type="button"
          className={styles.scrim}
          aria-label="Cerrar el menú"
          tabIndex={-1}
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside
        id="portal-menu"
        className={`${styles.sidebar} ${drawerOpen ? styles.sidebarOpen : ""}`}
        inert={hidden || undefined}
      >
        <div className={styles.brand}>
          <img src={logoIris} alt="" className={styles.brandLogo} />
          <div className={styles.brandText}>
            <span className={styles.brandName}>IRIS</span>
            <span className={styles.brandLabel}>{portalLabel}</span>
          </div>
          {narrow && (
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Cerrar el menú"
              onClick={() => {
                setMenuOpen(false);
                menuButton.current?.focus();
              }}
            >
              <IconClose width={20} height={20} />
            </button>
          )}
        </div>

        <nav className={styles.nav} aria-label={navLabel}>
          <span className={styles.navGroupLabel}>Menú</span>
          {sections.map(renderItem)}
        </nav>

        <div className={styles.account}>
          {footer.length > 0 && <div className={styles.footerNav}>{footer.map((item) => renderItem(item, -1))}</div>}
          {account &&
            (account.onOpen ? (
              <button
                type="button"
                className={`${styles.accountCard} ${styles.accountLink}`}
                onClick={() => {
                  setMenuOpen(false);
                  account.onOpen?.();
                }}
                aria-label={`Ir a Mi perfil, ${account.name}, ${account.email}`}
              >
                <AccountCardBody account={account} />
              </button>
            ) : (
              <div className={styles.accountCard}>
                <AccountCardBody account={account} />
              </div>
            ))}
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          {narrow && (
            <button
              ref={menuButton}
              type="button"
              className={styles.iconButton}
              aria-label="Abrir el menú"
              aria-expanded={menuOpen}
              aria-controls="portal-menu"
              onClick={() => setMenuOpen(true)}
            >
              <IconMenu width={22} height={22} />
            </button>
          )}
          <div className={styles.heading}>
            <p className={styles.crumbs}>
              <span>{portalLabel}</span>
              <span aria-hidden="true" className={styles.crumbSeparator}>
                /
              </span>
              <span className={styles.crumbCurrent}>{header.section}</span>
            </p>
            {header.title && <h1 className={styles.title}>{header.title}</h1>}
            {header.description && <p className={styles.description}>{header.description}</p>}
          </div>
          <div className={styles.topActions}>
            {header.actions}
            {/* A white pill with the bell and who is signed in. */}
            {(notifications || account) && (
              <div className={styles.pill}>
                {notifications && (
                  <button
                    type="button"
                    className={styles.bell}
                    onClick={notifications.onOpen}
                    aria-label={
                      notifications.count > 0
                        ? `Ver notificaciones, ${notifications.count} sin leer`
                        : "Ver notificaciones"
                    }
                  >
                    <IconBell width={20} height={20} />
                    {notifications.count > 0 && (
                      <span className={styles.bellDot} aria-hidden="true">
                        {notifications.count > 9 ? "9+" : notifications.count}
                      </span>
                    )}
                  </button>
                )}
                {account &&
                  (account.onOpen ? (
                    // Under the mouse it opens to the left and shows the name.
                    <button
                      type="button"
                      className={styles.pillProfile}
                      onClick={account.onOpen}
                      aria-label={`Ir a Mi perfil, ${account.name}`}
                    >
                      <span className={styles.pillProfileText} aria-hidden="true">
                        <span className={styles.pillProfileName}>{account.name}</span>
                        <span className={styles.pillProfileHint}>Ver mi perfil</span>
                      </span>
                      <span className={styles.pillAvatar} aria-hidden="true">
                        {account.initials}
                      </span>
                    </button>
                  ) : (
                    <span className={styles.pillAvatar} title={account.name} aria-hidden="true">
                      {account.initials}
                    </span>
                  ))}
              </div>
            )}
          </div>
        </header>

        <main className={styles.content}>{children}</main>
      </div>
      {overlay}
    </div>
  );
}

/** Wraps the section on screen. Give it a key that changes with the
 * section, so it comes up again with a small animation on every change. */
export function PortalSection({ children }: { children: ReactNode }) {
  return <div className={styles.sectionEnter}>{children}</div>;
}

// The initials, the name and the email of the account card.
function AccountCardBody({ account }: { account: PortalAccount }) {
  return (
    <>
      <span className={styles.accountInitials} aria-hidden="true">
        {account.initials}
      </span>
      <span className={styles.accountText}>
        <span className={styles.accountName}>{account.name}</span>
        <span className={styles.accountEmail}>{account.email}</span>
      </span>
    </>
  );
}
