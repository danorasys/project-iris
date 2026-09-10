import { useCallback, useEffect, useRef, useState } from "react";
import { IconArrowRight, IconArrowLeft, IconPause, IconPlay } from "@/shared/ui/icons";
import logoIris from "@/assets/landing/logo-iris.png";
import heroTeacher from "@/assets/landing/hero-teacher.jpg";
import heroStudent from "@/assets/landing/hero-student.jpg";
import heroFamily from "@/assets/landing/hero-family.jpg";
import heroEye from "@/assets/landing/hero-eye.jpg";
import { FloatingShapes, type BackgroundShape } from "./FloatingShapes";
import styles from "./HeroCarousel.module.css";

const AUTOPLAY_DURATION_MS = 7000;

interface BrandSlide {
  id: string;
  type: "brand";
  accessibleTitle: string;
}

interface PhotoSlide {
  id: string;
  type: "photo";
  accessibleTitle: string;
  image: string;
  title: string;
  text: string;
}

type Slide = BrandSlide | PhotoSlide;

/** The carousel's opening: the brand plate alone, no photo, introducing
 * IRIS before showing who it's for. Followed by four photographic entries
 * to the product (mechanism, student, family, teacher), each with its own
 * smaller brand plate (logo plus wordmark) as a recurring signature. */
const SLIDES: Slide[] = [
  {
    id: "brand",
    type: "brand",
    accessibleTitle: "IRIS — Tu mirada. Tu forma de aprender.",
  },
  {
    id: "eye",
    type: "photo",
    image: heroEye,
    title: "Tu mirada, la llave de todo",
    text:
      "En IRIS no hace falta más que mirar. Cada parpadeo abre una puerta, cada vistazo avanza una lección: la mirada, ese gesto tan propio y tan simple, se convierte en la forma de aprender.",
    accessibleTitle: "Tu mirada, la llave de todo",
  },
  {
    id: "student",
    type: "photo",
    image: heroStudent,
    title: "Su mirada, su ritmo, sus propias decisiones",
    text:
      "Un niño o niña con movilidad reducida no necesita que alguien navegue por él: con la cámara de su computador, elige, avanza y aprende solo, a su propio paso, dueño de su propio proceso.",
    accessibleTitle: "Su mirada, su ritmo, sus propias decisiones",
  },
  {
    id: "family",
    type: "photo",
    image: heroFamily,
    title: "De la mano, desde el primer vistazo",
    text:
      "Un padre, madre o tutor le abre las puertas de IRIS a su hijo o hija: no se queda afuera, acompaña de cerca cada mirada y también hace parte de este camino.",
    accessibleTitle: "De la mano, desde el primer vistazo",
  },
  {
    id: "teacher",
    type: "photo",
    image: heroTeacher,
    title: "Pensada también para quien enseña",
    text:
      "Un aula inclusiva no se arma sola: la construye un docente que decide, acompaña y ve crecer a cada uno de sus estudiantes lección a lección.",
    accessibleTitle: "Pensada también para quien enseña",
  },
];

const TOTAL = SLIDES.length;

/** Single-stroke circles, squares and crosses, scattered and each floating
 * on its own at its own pace, never concentric with each other so they
 * don't read as a camera shutter. They decorate the brand slide without
 * competing with the logo. */
const BACKGROUND_SHAPES: BackgroundShape[] = [
  { top: "8%", left: "6%", size: 56, shape: "circle", anim: "A", duration: "15s", delay: "0s" },
  { top: "66%", left: "4%", size: 110, shape: "circle", anim: "B", duration: "22s", delay: "-4s", opacity: 0.5 },
  { top: "15%", left: "23%", size: 20, shape: "cross", anim: "D", duration: "11s", delay: "-2s", opacity: 0.55 },
  { top: "40%", left: "9%", size: 34, shape: "square", anim: "A", duration: "18s", delay: "-9s", opacity: 0.4 },
  { top: "18%", right: "10%", size: 44, shape: "circle", anim: "C", duration: "13s", delay: "-6s", accent: true },
  { top: "58%", right: "6%", size: 140, shape: "circle", anim: "A", duration: "27s", delay: "-11s", opacity: 0.38 },
  { top: "10%", right: "25%", size: 26, shape: "square", anim: "B", duration: "16s", delay: "-3s", opacity: 0.45 },
  { top: "78%", right: "17%", size: 22, shape: "cross", anim: "D", duration: "10s", delay: "-5s", opacity: 0.5, accent: true },
  { top: "86%", left: "38%", size: 78, shape: "circle", anim: "B", duration: "19s", delay: "-2s", opacity: 0.42 },
  { top: "6%", left: "45%", size: 18, shape: "square", anim: "C", duration: "9s", delay: "-1s", opacity: 0.4 },
  { top: "50%", left: "15%", size: 16, shape: "cross", anim: "A", duration: "12s", delay: "-7s", opacity: 0.45 },
  { top: "32%", right: "5%", size: 62, shape: "circle", anim: "B", duration: "21s", delay: "-13s", opacity: 0.4 },
  { top: "90%", right: "31%", size: 28, shape: "square", anim: "A", duration: "17s", delay: "-4s", opacity: 0.4 },
];

/** The landing's hero. Instead of just the dwell demo, the first thing you
 * see is a carousel of four real entries into the product, the mechanism,
 * the student, the family and the teacher, each with its own photo and
 * its own message over a blue glass panel. */
export function HeroCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const prefersReducedMotion = useRef(
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const goTo = useCallback((next: number) => {
    setIndex(((next % TOTAL) + TOTAL) % TOTAL);
  }, []);

  useEffect(() => {
    if (paused || interacting || prefersReducedMotion.current) return;
    const timer = window.setInterval(() => {
      setIndex((actual) => (actual + 1) % TOTAL);
    }, AUTOPLAY_DURATION_MS);
    return () => window.clearInterval(timer);
  }, [paused, interacting]);

  function handleBlur(event: React.FocusEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setInteracting(false);
    }
  }

  return (
    <section
      className={styles.carousel}
      aria-roledescription="carrusel"
      aria-label="Presentación de IRIS"
      onMouseEnter={() => setInteracting(true)}
      onMouseLeave={() => setInteracting(false)}
      onFocus={() => setInteracting(true)}
      onBlur={handleBlur}
    >
      <div className={styles.track}>
        {SLIDES.map((slide, i) =>
          slide.type === "brand" ? (
            <article
              key={slide.id}
              className={`${styles.slide} ${styles.slideBrand} ${i === index ? styles.slideActive : ""}`}
              aria-hidden={i !== index}
            >
              <FloatingShapes shapes={BACKGROUND_SHAPES} />
              <div className={styles.brandContent}>
                <img src={logoIris} alt="" className={styles.heroLogo} />
                <p className={styles.heroWordmark}>IRIS</p>
                <span className={styles.heroRule} aria-hidden="true" />
                <h1 className={styles.heroSlogan}>Tu mirada. Tu forma de aprender.</h1>
                <p className={styles.heroDescription}>
                  Tecnología educativa accesible mediante seguimiento de la mirada.
                </p>
              </div>
            </article>
          ) : (
            <article
              key={slide.id}
              className={`${styles.slide} ${i === index ? styles.slideActive : ""}`}
              aria-hidden={i !== index}
            >
              <img src={slide.image} alt="" className={styles.image} loading={i <= 1 ? "eager" : "lazy"} />
              <div className={styles.overlay} aria-hidden="true" />
              <div className={styles.content}>
                <div className={styles.textPanel}>
                  <div className={styles.brandLockup}>
                    <img src={logoIris} alt="" className={styles.brandLogo} />
                    <span className={styles.wordmark}>IRIS</span>
                  </div>
                  <span className={styles.brandRule} aria-hidden="true" />
                  <h2 className={styles.title}>{slide.title}</h2>
                  <p className={styles.text}>{slide.text}</p>
                </div>
              </div>
            </article>
          ),
        )}
      </div>

      <button
        type="button"
        className={`${styles.arrow} ${styles.arrowLeft}`}
        onClick={() => {
          goTo(index - 1);
          setInteracting(true);
        }}
        aria-label="Diapositiva anterior"
      >
        <IconArrowLeft />
      </button>
      <button
        type="button"
        className={`${styles.arrow} ${styles.arrowRight}`}
        onClick={() => {
          goTo(index + 1);
          setInteracting(true);
        }}
        aria-label="Siguiente diapositiva"
      >
        <IconArrowRight />
      </button>

      <div className={styles.bottomControls}>
        <button
          type="button"
          className={styles.pauseButton}
          onClick={() => setPaused((value) => !value)}
          aria-label={paused ? "Reanudar presentación automática" : "Pausar presentación automática"}
        >
          {paused ? <IconPlay /> : <IconPause />}
        </button>
        <div className={styles.dots} role="tablist" aria-label="Ir a una diapositiva">
          {SLIDES.map((slide, i) => (
            <button
              key={slide.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Diapositiva ${i + 1}: ${slide.accessibleTitle}`}
              className={`${styles.dot} ${i === index ? styles.dotActive : ""}`}
              onClick={() => {
                goTo(i);
                setInteracting(true);
              }}
            />
          ))}
        </div>
      </div>

      <p className={styles.srAnnouncement} aria-live="polite">
        {`Diapositiva ${index + 1} de ${TOTAL}: ${SLIDES[index].accessibleTitle}`}
      </p>
    </section>
  );
}
