import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Baby,
  BookOpen,
  Check,
  CircleCheck,
  Eye,
  HeartHandshake,
  Pause,
  Play,
  ScanEye,
  School,
  Smile,
  Sparkles,
  Star,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import logoIris from "@/assets/landing/logo-iris.png";
import heroEye from "@/assets/landing/hero-eye.jpg";
import heroStudent from "@/assets/landing/hero-student.jpg";
import heroFamily from "@/assets/landing/hero-family.jpg";
import heroTeacher from "@/assets/landing/hero-teacher.jpg";
import { IrisRings } from "./IrisRings";
import { REGISTER_LINK } from "./landingLinks";
import { prefersReducedMotion } from "./useReveal";
import { turn } from "./turn";
import links from "./links.module.css";
import motion from "./motion.module.css";
import styles from "./HeroCarousel.module.css";

// How long each scene stays. The ring around the photo fills in this time,
// like a button you look at, and when it's full the next scene comes.
const SCENE_MS = 7000;

interface Chip {
  icon: LucideIcon;
  text: string;
}

type SceneCard =
  | { kind: "dwell"; label: string; doneLabel: string }
  | { kind: "note"; icon: LucideIcon; label: string; text: string; effect?: "star" | "register" }
  | { kind: "list"; label: string; items: string[] };

interface Scene {
  id: string;
  tab: string;
  image: string;
  focus: string;
  title: string;
  text: string;
  topChip: Chip;
  sideChip: Chip;
  card: SceneCard;
}

// The gaze first, then the three people who use IRIS. The little cards
// around each photo show real parts of the app, never made-up numbers.
const SCENES: Scene[] = [
  {
    id: "mirada",
    tab: "La mirada",
    image: heroEye,
    focus: "32% 46%",
    title: "Tu mirada, la llave de todo",
    text: "Mirar un botón por un momento es como tocarlo: así se elige, se avanza y se responde.",
    topChip: { icon: Eye, text: "Mirada sostenida" },
    sideChip: { icon: ScanEye, text: "Calibración lista" },
    card: { kind: "dwell", label: "Seleccionando", doneLabel: "¡Seleccionado!" },
  },
  {
    id: "estudiantes",
    tab: "Estudiantes",
    image: heroStudent,
    focus: "62% 40%",
    title: "Su mirada, sus propias decisiones",
    text: "Con la cámara de su computador, cada niño o niña elige, avanza y responde con su propia mirada, y descubre todo lo que puede lograr.",
    topChip: { icon: BookOpen, text: "Lección 2 de 5" },
    sideChip: { icon: Smile, text: "Elige con la mirada" },
    card: { kind: "note", icon: Star, label: "¡Muy bien!", text: "Respuesta correcta", effect: "star" },
  },
  {
    id: "familia",
    tab: "Familia",
    image: heroFamily,
    focus: "50% 42%",
    title: "De la mano, desde el primer vistazo",
    text: "La familia abre la puerta: crea la cuenta, cuida sus datos y acompaña de cerca cada avance.",
    topChip: { icon: Baby, text: "2 peques a su cargo" },
    sideChip: { icon: HeartHandshake, text: "Acompaña cada avance" },
    card: {
      kind: "note",
      icon: UserPlus,
      label: "¡Peque registrado!",
      text: "Ya puede aprender en IRIS",
      effect: "register",
    },
  },
  {
    id: "docentes",
    tab: "Docentes",
    image: heroTeacher,
    focus: "62% 32%",
    title: "Pensada también para quien enseña",
    text: "El docente arma sus clases por unidades y lecciones, y acompaña a cada estudiante en el camino.",
    topChip: { icon: School, text: "Matemáticas · 3.°" },
    sideChip: { icon: CircleCheck, text: "Lección publicada" },
    card: {
      kind: "list",
      label: "Unidad 1",
      items: ["Números hasta 1000", "Sumas y restas", "La multiplicación"],
    },
  },
];

function CardContent({ card }: { card: SceneCard }) {
  if (card.kind === "dwell") {
    return (
      <>
        {/* The ring fills like a look on a button; when it closes, the
            label changes and the eye in the middle opens and blinks. */}
        <p className={`${styles.cardLabel} ${styles.dwellLabels}`}>
          <span className={styles.labelBefore}>{card.label}</span>
          <span className={styles.labelAfter}>{card.doneLabel}</span>
        </p>
        <div className={styles.miniDwell}>
          <svg className={styles.miniRing} viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="18" className={styles.miniTrack} />
            <circle cx="22" cy="22" r="18" pathLength={1} className={styles.miniFill} />
          </svg>
          <Eye className={styles.miniEye} strokeWidth={2.4} />
        </div>
      </>
    );
  }
  if (card.kind === "note") {
    const Icon = card.icon;
    return (
      <>
        {/* Some icons act out their card: the star of a right answer pops
            with a small yellow burst and twinkles; the new kid walks in,
            gets a green check and hops with joy. */}
        <span
          className={`${styles.cardIcon} ${card.effect === "star" ? styles.celebrate : ""} ${
            card.effect === "register" ? styles.register : ""
          }`}
        >
          <Icon size={18} strokeWidth={2.2} />
          {card.effect === "register" && (
            <span className={styles.registerBadge}>
              <Check strokeWidth={3.5} />
            </span>
          )}
          {card.effect === "star" && (
            <svg className={styles.burst} viewBox="0 0 100 100">
              <path d="M50 14 V4" />
              <path d="M76 24 L83 17" />
              <path d="M86 50 H96" />
              <path d="M24 24 L17 17" />
              <path d="M14 50 H4" />
              <path d="M76 76 L83 83" />
            </svg>
          )}
        </span>
        <p className={styles.cardLabel}>{card.label}</p>
        <p className={styles.cardText}>{card.text}</p>
      </>
    );
  }
  return (
    <>
      <p className={styles.cardLabel}>{card.label}</p>
      <ul className={styles.cardList}>
        {/* The unit fills up like a teacher building it: the lessons come in
            one by one and then each one gets its check. */}
        {card.items.map((item, i) => (
          <li key={item} style={{ "--n": i } as CSSProperties}>
            <Check size={12} strokeWidth={3} />
            {item}
          </li>
        ))}
      </ul>
    </>
  );
}

function Scenes({ index }: { index: number }) {
  return SCENES.map((scene, i) => {
    const TopIcon = scene.topChip.icon;
    const SideIcon = scene.sideChip.icon;
    return (
      <div key={scene.id} className={`${styles.scene} ${i === index ? styles.sceneActive : ""}`}>
        <div className={styles.portrait}>
          <img src={scene.image} alt="" style={{ objectPosition: scene.focus }} loading={i === 0 ? "eager" : "lazy"} />
        </div>
        <span className={`${styles.chip} ${styles.topChip}`}>
          <TopIcon size={15} strokeWidth={2.2} />
          {scene.topChip.text}
        </span>
        <svg className={styles.arrow} viewBox="0 0 80 110" fill="none">
          <path pathLength={1} d="M60 4 C 18 10, 6 50, 30 72 S 70 96, 64 104" />
          <path pathLength={1} d="M56 96 L 64 105 L 72 96" />
        </svg>
        <div className={styles.card}>
          <CardContent card={scene.card} />
        </div>
        <span className={`${styles.chip} ${styles.sideChip}`}>
          <SideIcon size={15} strokeWidth={2.2} />
          {scene.sideChip.text}
        </span>
      </div>
    );
  });
}

// The landing's opening. On the left, who IRIS is (logo, slogan, what it
// does) never moves; on the right, a carousel shows the gaze and the three
// people IRIS is for, one after another.
export function HeroCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [entered, setEntered] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const heroRef = useRef<HTMLElement>(null);
  const [autoplay] = useState(() => !prefersReducedMotion());
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const tabId = (i: number) => `${baseId}-tab-${i}`;

  // The entrance starts on the next frame, so the browser has drawn the
  // "before" and has something to move from.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // The carousel waits while the hero is off screen, so you find it where
  // you left it when you come back up.
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const running = autoplay && !paused && !hovering && onScreen;
  const scene = SCENES[index];

  function select(next: number) {
    setIndex((next + SCENES.length) % SCENES.length);
  }

  // Tabs move with the arrow keys, Home and End, like the ARIA tabs pattern.
  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: SCENES.length - 1,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = (moves[event.key] + SCENES.length) % SCENES.length;
    select(next);
    document.getElementById(tabId(next))?.focus();
  }

  return (
    <section ref={heroRef} id="inicio" className={styles.hero} aria-labelledby="hero-title">
      <IrisRings className={styles.rings} />
      <div className={`${styles.inner} ${entered ? motion.visible : ""}`} data-entered={entered}>
        <div className={styles.copy}>
          {/* The name comes first and big: the logo, with an amber ring that
              closes around it like a look, and IRIS next to it. */}
          <h1 id="hero-title" className={styles.brand}>
            <span className={`${styles.brandMark} ${motion.pop}`} style={turn(0)}>
              <img src={logoIris} alt="" />
              <svg className={styles.brandRing} viewBox="0 0 100 100" aria-hidden="true">
                <circle cx="50" cy="50" r="48" pathLength={1} className={motion.draw} style={turn(4)} />
              </svg>
            </span>
            <span className={styles.lineInner} style={turn(1)}>
              IRIS
            </span>
          </h1>

          <p className={`${styles.eyebrow} ${motion.rise}`} style={turn(2)}>
            Sistema de gestión del aprendizaje <span className={styles.lms}>LMS</span>
          </p>

          <p className={styles.title}>
            <span className={styles.line}>
              <span className={styles.lineInner} style={turn(3)}>
                Tu{" "}
                <span className={styles.nowrap}>
                  <span className={styles.marked}>
                    mirada
                    <svg
                      className={styles.underline}
                      viewBox="0 0 200 22"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <path className={motion.draw} style={turn(8)} pathLength={1} d="M4 14 C 50 6, 120 4, 196 9" />
                      <path
                        className={motion.draw}
                        style={turn(10)}
                        pathLength={1}
                        d="M30 19 C 80 13, 130 12, 170 15"
                      />
                    </svg>
                  </span>
                  .
                  {/* Three strokes fanning out from the top right corner of
                      the first line: up, diagonal and to the right. */}
                  <svg className={styles.sparkle} viewBox="0 0 32 32" aria-hidden="true">
                    <g className={motion.pop} style={turn(11)}>
                      <path d="M7 17 L 5 4" />
                      <path d="M13 21 L 23 11" />
                      <path d="M16 28 L 29 26" />
                    </g>
                  </svg>
                </span>
              </span>
            </span>
            <span className={styles.line}>
              <span className={styles.lineInner} style={turn(4)}>
                Tu forma de <span className={styles.nowrap}>aprender.</span>
              </span>
            </span>
          </p>

          <p className={`${styles.lead} ${motion.rise}`} style={turn(5)}>
            Un aula virtual para niños y niñas de primaria con movilidad reducida: eligen, avanzan y aprenden mirando la
            pantalla, con la cámara de su computador. Su familia y sus docentes los acompañan en cada mirada.
          </p>

          <div className={`${styles.ctas} ${motion.rise}`} style={turn(6)}>
            <Link to={REGISTER_LINK.to} state={REGISTER_LINK.state} className={styles.primary}>
              Únete a IRIS
              <ArrowRight size={18} strokeWidth={2.4} aria-hidden="true" />
            </Link>
            <a href="#como-funciona" className={`${links.lineLink} ${styles.secondary}`}>
              Ver cómo funciona
            </a>
          </div>
        </div>

        <div
          className={styles.showcase}
          role="region"
          aria-roledescription="carrusel"
          aria-label="Quiénes aprenden con IRIS"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          onFocus={() => setHovering(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHovering(false);
          }}
        >
          <div className={`${styles.stage} ${motion.rise}`} style={turn(2)} aria-hidden="true">
            <span className={styles.blob} />
            <span className={styles.dot} />
            <svg className={styles.dwell} viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="48" className={styles.dwellTrack} />
              {autoplay ? (
                <circle
                  key={index}
                  cx="50"
                  cy="50"
                  r="48"
                  pathLength={1}
                  className={styles.dwellFill}
                  style={{ animationDuration: `${SCENE_MS}ms`, animationPlayState: running ? "running" : "paused" }}
                  onAnimationEnd={() => select(index + 1)}
                />
              ) : (
                <circle cx="50" cy="50" r="48" pathLength={1} className={`${styles.dwellFill} ${styles.dwellFull}`} />
              )}
            </svg>
            <Scenes index={index} />
            <span className={`${styles.badge} ${styles.badgeStar} ${motion.pop}`} style={turn(7)}>
              <Sparkles size={20} strokeWidth={2.2} />
            </span>
          </div>

          <div
            id={panelId}
            role="tabpanel"
            aria-labelledby={tabId(index)}
            aria-live={running ? "off" : "polite"}
            className={`${styles.caption} ${motion.rise}`}
            style={turn(4)}
          >
            <div key={scene.id} className={styles.captionText}>
              <h2 className={styles.captionTitle}>{scene.title}</h2>
              <p className={styles.captionBody}>{scene.text}</p>
            </div>
          </div>

          <div className={`${styles.controls} ${motion.rise}`} style={turn(5)}>
            <div role="tablist" aria-label="Elige qué ver" className={styles.tabs}>
              {SCENES.map((item, i) => (
                <button
                  key={item.id}
                  id={tabId(i)}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-controls={panelId}
                  tabIndex={i === index ? 0 : -1}
                  className={`${styles.tab} ${i === index ? styles.tabActive : ""}`}
                  onClick={() => select(i)}
                  onKeyDown={onTabKey}
                >
                  {item.tab}
                  {i === index && autoplay && (
                    <span
                      key={index}
                      className={styles.tabProgress}
                      style={{ animationDuration: `${SCENE_MS}ms`, animationPlayState: running ? "running" : "paused" }}
                      aria-hidden="true"
                    />
                  )}
                </button>
              ))}
            </div>
            {autoplay && (
              <button
                type="button"
                className={styles.pause}
                onClick={() => setPaused((value) => !value)}
                aria-label={paused ? "Reanudar el carrusel" : "Pausar el carrusel"}
              >
                {paused ? <Play size={16} strokeWidth={2.4} /> : <Pause size={16} strokeWidth={2.4} />}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
