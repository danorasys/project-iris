import { Link } from "react-router-dom";
import { Code } from "lucide-react";
import logoIris from "@/assets/landing/logo-iris.png";
import { NAV_LINKS } from "./landingLinks";
import styles from "./LandingFooter.module.css";

// IRIS itself is open source: its code lives in this public repository.
const REPOSITORY_URL = "https://github.com/danorasys/project-iris";

// The closing of the landing, also at the end of the legal pages, so they're
// never a dead end. The section links start with "/" to work from there too.
export function LandingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.columns}>
        <div className={styles.brand}>
          <Link to="/" className={styles.brandLockup}>
            <img src={logoIris} alt="" className={styles.logo} />
            <span className={styles.wordmark}>IRIS</span>
          </Link>
          <p className={styles.tagline}>Tu mirada. Tu forma de aprender.</p>
          <p className={styles.about}>
            Un sistema de gestión del aprendizaje (LMS) ligero y accesible por la mirada, para que niños y niñas con
            movilidad reducida aprendan a su ritmo, con su familia y sus docentes.
          </p>
        </div>

        <nav className={styles.column} aria-label="Secciones de la página de inicio">
          <p className={styles.columnTitle}>Explora</p>
          {NAV_LINKS.map((link) => (
            <a key={link.id} href={`/#${link.id}`} className={styles.link}>
              {link.text}
            </a>
          ))}
        </nav>

        <nav className={styles.column} aria-label="Enlaces legales">
          <p className={styles.columnTitle}>Legal</p>
          <Link to="/legal-notice" className={styles.link}>
            Aviso Legal
          </Link>
          <Link to="/privacy-policy" className={styles.link}>
            Política de Privacidad
          </Link>
        </nav>

        <div className={styles.column}>
          <p className={styles.columnTitle}>Código abierto</p>
          <p className={styles.note}>
            IRIS es un proyecto de código abierto: su código está a la vista de quien quiera conocerlo, revisarlo o
            aportar.
          </p>
          <a
            href={REPOSITORY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`${styles.link} ${styles.repoLink}`}
          >
            <Code size={16} strokeWidth={2.4} aria-hidden="true" />
            Ver en GitHub
            <span className={styles.srOnly}> (se abre en otra pestaña)</span>
          </a>
        </div>
      </div>

      <div className={styles.bottomBar}>
        <p className={styles.copyright}>© {year} IRIS. Todos los derechos reservados.</p>
        <p className={styles.engine}>
          Seguimiento de la mirada con{" "}
          <a href="https://eyegestures.com/" target="_blank" rel="noopener noreferrer" className={styles.link}>
            EyeGestures
            <span className={styles.srOnly}> (se abre en otra pestaña)</span>
          </a>
        </p>
      </div>
    </footer>
  );
}
