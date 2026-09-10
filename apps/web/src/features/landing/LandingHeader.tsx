import { Link } from "react-router-dom";
import logoIris from "@/assets/landing/logo-iris.png";
import styles from "./LandingHeader.module.css";

const NAV_LINKS = [
  { href: "#conoce-iris-titulo", text: "Conoce a IRIS" },
  { href: "#lugar-para-todos-titulo", text: "Un lugar para todos" },
  { href: "#estadisticas-titulo", text: "Por Qué Importa" },
  { href: "#como-funciona-titulo", text: "Cómo Funciona" },
  { href: "#unete-titulo", text: "Únete" },
];

/** The landing's fixed header, stays visible over every section while
 * scrolling, including the carousel's own brand slide behind it. Consistent
 * blue glass across the whole page, it never blends into what's underneath,
 * it's the same bar from start to end. */
export function LandingHeader() {
  return (
    <header className={styles.header}>
      <a href="#inicio" className={styles.brandLockup}>
        <img src={logoIris} alt="" className={styles.logo} />
        <span className={styles.wordmark}>IRIS</span>
      </a>

      <nav className={styles.nav} aria-label="Secciones de la página">
        {NAV_LINKS.map((link) => (
          <a key={link.href} href={link.href} className={styles.navLink}>
            {link.text}
          </a>
        ))}
      </nav>

      <Link to="/login/adult" className={styles.loginButton}>
        Ingresar
      </Link>
    </header>
  );
}
