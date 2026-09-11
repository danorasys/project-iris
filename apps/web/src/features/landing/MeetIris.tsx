import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import logoIris from "@/assets/landing/logo-iris.png";
import styles from "./MeetIris.module.css";

const IRIS_MESSAGE =
  "¡Hola! Soy IRIS, una tecnología educativa accesible mediante seguimiento de la mirada, y quiero acompañar a tu hijo o hija en cada clase. Vamos a avanzar a su propio ritmo, celebrando cada logro. Lo que más me importa es que pueda explorar cada pantalla con decisión y orientación educativa, eligiendo y avanzando a su manera, para que pueda visionar su propio camino educativo, de la mano de su familia, sus docentes y mía.";

const TYPING_SPEED_MS = 20;

/** IRIS "talks" to the family in first person, typing letter by letter in
 * a speech bubble. Full text stays in the DOM for screen readers, the
 * typing animation is a purely visual layer marked `aria-hidden`. */
export function MeetIris() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const prefersReducedMotion = useRef(
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    if (prefersReducedMotion.current) {
      setCharCount(IRIS_MESSAGE.length);
      return;
    }
    if (charCount >= IRIS_MESSAGE.length) return;
    const lastChar = IRIS_MESSAGE[charCount - 1];
    const extraPause = lastChar === "." ? 340 : lastChar === "," ? 120 : 0;
    const timer = window.setTimeout(() => setCharCount((c) => c + 1), TYPING_SPEED_MS + extraPause);
    return () => window.clearTimeout(timer);
  }, [inView, charCount]);

  const done = charCount >= IRIS_MESSAGE.length;

  return (
    <div className={styles.container} ref={containerRef}>
      <img src={logoIris} alt="" className={styles.logo} />
      <div className={styles.bubble}>
        <p className={styles.visibleText} aria-hidden="true">
          {IRIS_MESSAGE.slice(0, charCount)}
          {!done && <span className={styles.cursor} />}
        </p>
        <p className={styles.srOnly}>{IRIS_MESSAGE}</p>
        {done && (
          <Link to="/login/adult" state={{ vista: "elegirRegistro" }} className={styles.cta}>
            Quiero que acompañe a mi hijo o hija
          </Link>
        )}
      </div>
    </div>
  );
}
