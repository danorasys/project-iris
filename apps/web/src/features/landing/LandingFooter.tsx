import { Link } from "react-router-dom";
import logoIris from "@/assets/landing/logo-iris.png";
import styles from "./LandingFooter.module.css";

/** The landing's closing section, same deep blue as the header, so the page
 * is framed by the two. Also lives at the end of the legal pages, so it's
 * never a dead end. */
export function LandingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.content}>
        <div className={styles.brand}>
          <img src={logoIris} alt="" className={styles.logo} />
          <div>
            <p className={styles.wordmark}>IRIS</p>
            <p className={styles.tagline}>Tu mirada. Tu forma de aprender.</p>
          </div>
        </div>

        <nav className={styles.links} aria-label="Enlaces legales">
          <Link to="/legal-notice" className={styles.link}>
            Aviso Legal
          </Link>
          <Link to="/privacy-policy" className={styles.link}>
            Política de Privacidad
          </Link>
        </nav>
      </div>

      <div className={styles.divider} aria-hidden="true" />

      <div className={styles.bottomBar}>
        <p className={styles.copyright}>© {year} IRIS</p>
        <a
          href="https://eyegestures.com/"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.engineCredit}
        >
          Con tecnología EyeGestures
        </a>
      </div>
    </footer>
  );
}
