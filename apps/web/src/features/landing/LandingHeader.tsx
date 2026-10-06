import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import logoIris from "@/assets/landing/logo-iris.png";
import { NAV_LINKS, REGISTER_LINK } from "./landingLinks";
import styles from "./LandingHeader.module.css";

// The bar stays on top the whole time. Over the dark hero it's see-through
// with white letters; once the page moves it turns into white glass, so it
// can be read over any section.
export function LandingHeader() {
  const [scrolled, setScrolled] = useState(() => window.scrollY > 12);
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuId = useId();

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  // The phone menu closes with Escape or a tap anywhere outside the bar.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [menuOpen]);

  const solid = scrolled || menuOpen;

  return (
    <header ref={headerRef} className={`${styles.header} ${solid ? styles.solid : ""} ${menuOpen ? styles.open : ""}`}>
      <div className={styles.bar}>
        <a href="#inicio" className={styles.brandLockup} aria-label="IRIS, ir al inicio">
          <img src={logoIris} alt="" className={styles.logo} />
          <span className={styles.wordmark}>IRIS</span>
        </a>

        <nav className={styles.nav} aria-label="Secciones de la página">
          {NAV_LINKS.map((link) => (
            <a key={link.id} href={`#${link.id}`} className={styles.navLink}>
              {link.text}
            </a>
          ))}
        </nav>

        <div className={styles.actions}>
          <Link to="/login/adult" className={styles.loginButton}>
            Ingresar
          </Link>
          <Link to={REGISTER_LINK.to} state={REGISTER_LINK.state} className={styles.registerButton}>
            Regístrate
          </Link>
          <button
            type="button"
            className={styles.menuButton}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={menuOpen ? "Cerrar el menú" : "Abrir el menú"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
        </div>
      </div>

      <nav id={menuId} className={styles.menu} aria-label="Menú de secciones" hidden={!menuOpen}>
        {NAV_LINKS.map((link) => (
          <a key={link.id} href={`#${link.id}`} className={styles.menuLink} onClick={() => setMenuOpen(false)}>
            {link.text}
          </a>
        ))}
        <Link to="/login/adult" className={styles.menuLogin}>
          Ingresar
        </Link>
      </nav>
    </header>
  );
}
