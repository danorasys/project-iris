import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import logoIris from "@/assets/landing/logo-iris.png";
import { LandingFooter } from "@/features/landing/LandingFooter";
import { IconArrowLeft } from "@/shared/ui/icons";
import styles from "./LegalLayout.module.css";

interface LegalLayoutProps {
  title: string;
  updatedOn: string;
  children: ReactNode;
}

/** Minimal frame for the reading pages (Aviso Legal, Política de Privacidad).
 * A simple bar with a link back home, a comfortable reading column, and the
 * same footer as the landing, so it's never a dead end. */
export function LegalLayout({ title, updatedOn, children }: LegalLayoutProps) {
  return (
    <main className={styles.page}>
      <header className={styles.bar}>
        <Link to="/" className={styles.brandLockup}>
          <img src={logoIris} alt="" className={styles.logo} />
          <span className={styles.wordmark}>IRIS</span>
        </Link>
        <Link to="/" className={styles.back}>
          <IconArrowLeft className={styles.backIcon} />
          Volver al inicio
        </Link>
      </header>

      <article className={styles.content}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.updatedOn}>Última actualización: {updatedOn}</p>
        {children}
      </article>

      <LandingFooter />
    </main>
  );
}
