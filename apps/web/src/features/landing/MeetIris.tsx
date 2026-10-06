import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HeartHandshake } from "lucide-react";
import logoIris from "@/assets/landing/logo-iris.png";
import { REGISTER_LINK } from "./landingLinks";
import { prefersReducedMotion, useReveal } from "./useReveal";
import styles from "./MeetIris.module.css";

const IRIS_MESSAGE =
  "¡Hola! Soy IRIS, una tecnología educativa accesible mediante seguimiento de la mirada, y quiero acompañar a tu hijo o hija en cada clase. Vamos a avanzar juntos, celebrando cada logro. Lo que más me importa es que pueda explorar cada pantalla con decisión y orientación educativa, eligiendo y avanzando a su manera, para que pueda visionar su propio camino educativo, de la mano de su familia, sus docentes y mía.";

const TYPING_SPEED_MS = 20;
// How long the "writing..." dots show before the first letter.
const THINKING_MS = 900;

// IRIS writes to the family like in a chat: first the three dots, then the
// message letter by letter, and at the end the reply button. The whole
// text is always there for screen readers; the typing is only for the eyes.
export function MeetIris() {
  const { ref, inView } = useReveal<HTMLDivElement>(0.45);
  const [thinking, setThinking] = useState(true);
  const [charCount, setCharCount] = useState(0);
  const [reduced] = useState(prefersReducedMotion);

  useEffect(() => {
    if (!inView || !thinking) return;
    const timer = window.setTimeout(() => setThinking(false), reduced ? 0 : THINKING_MS);
    return () => window.clearTimeout(timer);
  }, [inView, thinking, reduced]);

  useEffect(() => {
    if (thinking || charCount >= IRIS_MESSAGE.length) return;
    if (reduced) {
      const timer = window.setTimeout(() => setCharCount(IRIS_MESSAGE.length), 0);
      return () => window.clearTimeout(timer);
    }
    const lastChar = IRIS_MESSAGE[charCount - 1];
    const extraPause = lastChar === "." ? 340 : lastChar === "," ? 120 : 0;
    const timer = window.setTimeout(() => setCharCount((count) => count + 1), TYPING_SPEED_MS + extraPause);
    return () => window.clearTimeout(timer);
  }, [thinking, charCount, reduced]);

  const done = charCount >= IRIS_MESSAGE.length;

  return (
    <div className={styles.chat} ref={ref}>
      <div className={styles.chatHeader}>
        <span className={styles.avatar}>
          <img src={logoIris} alt="" />
        </span>
        <div>
          <p className={styles.name}>IRIS</p>
          <p className={styles.status}>{thinking && inView ? "escribiendo…" : "Tu compañero en IRIS"}</p>
        </div>
      </div>

      <div className={styles.thread}>
        {/* The bubble is measured with the whole message (invisible), so it
            doesn't grow line by line and push the page while IRIS writes. */}
        <div className={`${styles.bubble} ${inView ? styles.bubbleIn : ""}`} aria-hidden="true">
          <p className={styles.sizer}>{IRIS_MESSAGE}</p>
          {thinking ? (
            <span className={styles.typing}>
              <span />
              <span />
              <span />
            </span>
          ) : (
            <p className={styles.visibleText}>
              {IRIS_MESSAGE.slice(0, charCount)}
              {!done && <span className={styles.cursor} />}
            </p>
          )}
        </div>
        <p className={styles.srOnly}>{IRIS_MESSAGE}</p>

        {/* The reply keeps its place from the start (hidden), for the same
            reason: nothing below jumps when it shows up. */}
        <Link
          to={REGISTER_LINK.to}
          state={REGISTER_LINK.state}
          className={`${styles.reply} ${done ? styles.replyIn : ""}`}
        >
          <HeartHandshake size={20} strokeWidth={2} aria-hidden="true" />
          Vamos juntos
        </Link>
      </div>
    </div>
  );
}
