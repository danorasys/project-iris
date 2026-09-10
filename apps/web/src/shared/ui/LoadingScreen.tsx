import logoIris from "@/assets/landing/logo-iris.png";
import styles from "./LoadingScreen.module.css";

/** Full-page loading state, shown while a lazy route chunk downloads (see
 * AppRouter's Suspense fallback). A ring spins around the logo and the
 * dots bounce one after another, so waiting still feels like IRIS instead
 * of a bare "Cargando…" line. */
export function LoadingScreen() {
  return (
    <div className={styles.page} role="status">
      <div className={styles.logoWrap}>
        <svg className={styles.ring} viewBox="0 0 96 96" aria-hidden="true">
          <circle className={styles.ringTrack} cx="48" cy="48" r="42" />
          <circle className={styles.ringProgress} cx="48" cy="48" r="42" />
        </svg>
        <img src={logoIris} alt="" className={styles.logo} />
      </div>
      <p className={styles.text}>
        Cargando
        <span className={styles.dots} aria-hidden="true">
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.dot} />
        </span>
        <span className={styles.srOnly}>…</span>
      </p>
    </div>
  );
}
