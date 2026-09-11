import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import howItWorksDiagram from "@/assets/landing/how-it-works-diagram.png";
import badgeTeachers from "@/assets/landing/badge-teachers.png";
import badgeStudents from "@/assets/landing/badge-students.png";
import badgeFamily from "@/assets/landing/badge-family.png";
import logoDane from "@/assets/landing/logo-dane.png";
import logoOms from "@/assets/landing/logo-oms.svg";
import logoUnicef1 from "@/assets/landing/logo-unicef-1.svg";
import joinCommunity from "@/assets/landing/join-community.jpg";
import { MeetIris } from "./MeetIris";
import { type BackgroundShape, FloatingShapes } from "./FloatingShapes";
import { HeroCarousel } from "./HeroCarousel";
import { LandingFooter } from "./LandingFooter";
import { LandingHeader } from "./LandingHeader";
import styles from "./LandingPage.module.css";

interface Role {
  image: string;
  title: string;
  text: string;
}

/** Three real spaces within IRIS, not one message split across three cards.
 * Each one describes what that person controls there, not a generic sales
 * pitch of benefits. */
const ROLES: Role[] = [
  {
    image: badgeStudents,
    title: "Estudiantes",
    text:
      "Tu propio espacio dentro de IRIS: eliges tu avatar, entras con tu PIN y avanzas por tus lecciones sosteniendo la mirada — sin mouse, sin teclado, a tu propio ritmo.",
  },
  {
    image: badgeFamily,
    title: "Familia",
    text:
      "Ustedes abren la puerta: crean la cuenta, calibran la cámara junto al niño o niña y acompañan cada uno de sus primeros pasos — sin perder de vista su progreso.",
  },
  {
    image: badgeTeachers,
    title: "Docentes",
    text:
      "Su espacio para enseñar: construyen aulas y lecciones, deciden quién entra y siguen el progreso de cada estudiante desde una interfaz convencional de mouse y teclado.",
  },
];

interface DataSegment {
  text: string;
  emphasis?: boolean;
}

interface DataParagraph {
  segments: DataSegment[];
}

interface Statistic {
  finalValue: number;
  format: (value: number) => string;
  /** One or more paragraphs under the figure, the first right below the
   * number, the rest (if any) as supporting facts. Each one can highlight
   * inline figures. The count-up animation is only for the main figure,
   * never for these text numbers. */
  paragraphs: DataParagraph[];
  source: string;
  year: string;
  logo: string;
  logoAlt: string;
}

/** The only verified figures for the landing, don't invent more. `format`
 * reproduces the exact verified text at every step of the count-up. */
const STATISTICS: Statistic[] = [
  {
    finalValue: 2500,
    format: (value) => `${Math.round(value).toLocaleString("es-CO")} millones`,
    paragraphs: [
      {
        segments: [
          { text: "de personas en el mundo necesitan tecnología de apoyo para vivir con autonomía. Solo el " },
          { text: "3 %", emphasis: true },
          { text: " accede a ella en países de bajos ingresos." },
        ],
      },
    ],
    source: "Organización Mundial de la Salud (OMS), hoja informativa «Assistive technology»",
    year: "Actualizada el 2 de enero de 2024",
    logo: logoOms,
    logoAlt: "OMS",
  },
  {
    finalValue: 19.1,
    format: (value) => `${value.toFixed(1).replace(".", ",")} millones`,
    paragraphs: [
      {
        segments: [
          { text: "de niños, niñas y adolescentes con discapacidad viven en América Latina y el Caribe. De ellos, " },
          { text: "7 de cada 10", emphasis: true },
          { text: " en edad escolar no asisten a la escuela." },
        ],
      },
    ],
    source: "UNICEF LAC",
    year: "Publicado en noviembre de 2021",
    logo: logoUnicef1,
    logoAlt: "UNICEF",
  },
  {
    finalValue: 3134037,
    format: (value) => `${Math.round(value).toLocaleString("es-CO")} personas`,
    paragraphs: [
      {
        segments: [
          { text: "en Colombia reportan dificultades para realizar actividades básicas diarias (" },
          { text: "7,1 % de la población", emphasis: true },
          { text: "), como moverse, caminar o subir y bajar escaleras." },
        ],
      },
    ],
    source: "DANE, Censo Nacional de Población y Vivienda (CNPV)",
    year: "Datos del censo 2018",
    logo: logoDane,
    logoAlt: "DANE",
  },
];

/** Fires once, the moment the returned ref's element crosses `threshold` of
 * visibility, then disconnects. Shared by every scroll-triggered reveal or
 * animation on this page, so they don't each reimplement the same observer. */
function useReveal<T extends Element>(threshold = 0.2) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, inView };
}

const COUNT_DURATION_MS = 1600;

/** Counts from 0 to `finalValue` with a cubic ease-out, once, starting when
 * `active` turns true, never before the section is on screen. Respects
 * `prefers-reduced-motion` by jumping straight to the final value. */
function useCountUp(finalValue: number, active: boolean): number {
  const [value, setValue] = useState(0);
  const prefersReducedMotion = useRef(
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (!active) return;
    if (prefersReducedMotion.current) {
      setValue(finalValue);
      return;
    }
    let start: number | null = null;
    let frameId: number;
    function step(timestamp: number) {
      if (start === null) start = timestamp;
      const progress = Math.min((timestamp - start) / COUNT_DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(finalValue * eased);
      if (progress < 1) frameId = requestAnimationFrame(step);
    }
    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [active, finalValue]);

  return value;
}

function StatisticRow({ statistic, active }: { statistic: Statistic; active: boolean }) {
  const value = useCountUp(statistic.finalValue, active);
  return (
    <div className={styles.statisticRow}>
      <dt className={styles.figure}>{statistic.format(value)}</dt>
      <dd className={styles.figureDescription}>
        {statistic.paragraphs.map((paragraph, index) => (
          <p key={index} className={index === 0 ? styles.figureParagraph : styles.secondaryParagraph}>
            {paragraph.segments.map((segment, segmentIndex) =>
              segment.emphasis ? (
                <strong key={segmentIndex} className={styles.figureEmphasis}>
                  {segment.text}
                </strong>
              ) : (
                <span key={segmentIndex}>{segment.text}</span>
              ),
            )}
          </p>
        ))}
      </dd>
      <div className={styles.sourceRow}>
        <img src={statistic.logo} alt={statistic.logoAlt} className={styles.institutionLogo} />
        <span className={styles.figureSource}>
          {statistic.source} · {statistic.year}
        </span>
      </div>
    </div>
  );
}

/** Starts the count-up for all three figures at once, only when the
 * section enters the viewport. */
function Statistics() {
  const { ref, inView } = useReveal<HTMLDListElement>(0.3);

  return (
    <dl className={styles.statistics} ref={ref}>
      {STATISTICS.map((statistic) => (
        <StatisticRow key={statistic.source} statistic={statistic} active={inView} />
      ))}
    </dl>
  );
}

/** Scattered around the diagram, never over its content. The image's
 * background is already the page's same blue-white, so these shapes, some
 * hanging outside its own frame, feel like part of the same surface, not
 * a decoration pasted on top. */
const DIAGRAM_SHAPES: BackgroundShape[] = [
  { top: "-6%", left: "-3%", size: 40, shape: "circle", anim: "A", duration: "18s", delay: "0s", opacity: 0.5 },
  { top: "80%", left: "-4%", size: 30, shape: "cross", anim: "D", duration: "12s", delay: "-3s", opacity: 0.55 },
  {
    top: "-8%",
    right: "-2%",
    size: 24,
    shape: "square",
    anim: "C",
    duration: "13s",
    delay: "-5s",
    opacity: 0.55,
    accent: true,
  },
  { top: "88%", right: "-3%", size: 46, shape: "circle", anim: "B", duration: "21s", delay: "-8s", opacity: 0.45 },
  { top: "38%", left: "-5%", size: 16, shape: "cross", anim: "A", duration: "14s", delay: "-6s", opacity: 0.5 },
];

/** Diagram rises and fades in on reaching the viewport. No frame or
 * shadow, its background matches the page's so it blends in on purpose. */
function HowItWorksDiagram() {
  const { ref, inView } = useReveal<HTMLDivElement>(0.2);

  return (
    <div className={styles.diagramContainer} ref={ref}>
      <FloatingShapes shapes={DIAGRAM_SHAPES} className={styles.diagramDecoration} />
      <img
        src={howItWorksDiagram}
        alt="Diagrama de cómo funciona IRIS: un tutor registra la cuenta y acompaña el ingreso de su hijo o hija; el niño o niña calibra la cámara y navega las lecciones solo con la mirada, aprendiendo a su propio ritmo; mientras tanto, el docente crea lecciones y sigue el progreso de cada estudiante."
        className={`${styles.diagramImage} ${inView ? styles.diagramImageVisible : ""}`}
      />
    </div>
  );
}

/** Closing section: a real child's portrait instead of a generic "ready to
 * start?" background. Same rise-plus-fade-in as the diagram above. */
function JoinSection() {
  const { ref, inView } = useReveal<HTMLDivElement>(0.25);

  return (
    <div className={styles.join} ref={ref}>
      <div className={`${styles.joinImage} ${inView ? styles.joinVisible : ""}`}>
        <img src={joinCommunity} alt="" className={styles.joinPhoto} />
      </div>

      <div className={`${styles.joinContent} ${inView ? styles.joinVisible : ""}`}>
        <span className={styles.joinAccent} aria-hidden="true" />
        <h2 id="unete-titulo" className={styles.joinTitle}>
          Únete a la comunidad IRIS
        </h2>
        <p className={styles.joinText}>
          Como familia, acompaña a tu hijo o hija, mirada a mirada, en su camino educativo. Como docente, súmate a
          una educación más inclusiva, donde cada estudiante aprende a su manera. Construyamos juntos un camino sin
          barreras.
        </p>
        <Link to="/login/adult" className={styles.heroButton}>
          Quiero unirme
        </Link>
      </div>
    </div>
  );
}

/** Decorative seam between two section bands: a soft wave painted in the
 * color of the band that follows, sitting at the bottom edge of the band
 * above, an organic border instead of a hard line. */
function WaveDivider({ fill }: { fill: string }) {
  return (
    <svg className={styles.waveDivider} viewBox="0 0 1440 56" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M0,28 C240,56 480,0 720,14 C960,28 1200,56 1440,20 L1440,56 L0,56 Z" fill={fill} />
    </svg>
  );
}

type BandTone = "canvas" | "surface";

interface SectionBandProps {
  ariaLabelledBy: string;
  tone: BandTone;
  /** Fill of the wave painted at this band's bottom edge; the color of
   * whatever comes next. Omit on the last band. */
  nextFill?: string;
  wide?: boolean;
  /** Fades the band's whole content in on scroll. Turn off for sections
   * whose own content already animates itself (the diagram, the join
   * photo), so the two reveals don't stack. */
  reveal?: boolean;
  children: React.ReactNode;
}

/** One full-width color band per major landing section, alternating
 * between the page's two neutral tones so scrolling reads as passing
 * through distinct rooms rather than one continuous sheet. */
function SectionBand({ ariaLabelledBy, tone, nextFill, wide, reveal = true, children }: SectionBandProps) {
  const { ref, inView } = useReveal<HTMLDivElement>(0.15);

  return (
    <section
      className={`${styles.sectionBand} ${tone === "surface" ? styles.bandSurface : styles.bandCanvas}`}
      aria-labelledby={ariaLabelledBy}
    >
      <div
        ref={reveal ? ref : undefined}
        className={[
          styles.section,
          wide ? styles.sectionWide : "",
          reveal ? styles.bandReveal : "",
          reveal && inView ? styles.bandRevealVisible : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </div>
      {nextFill && <WaveDivider fill={nextFill} />}
    </section>
  );
}

/** `/`, the public landing. Opens with `HeroCarousel`, a carousel of brand
 * and real photography. */
export default function LandingPage() {
  return (
    <main className={styles.page} id="inicio">
      <LandingHeader />

      <HeroCarousel />

      <SectionBand ariaLabelledBy="conoce-iris-titulo" tone="canvas" nextFill="var(--color-surface)">
        <h2 id="conoce-iris-titulo" className={styles.sectionTitle}>
          Conoce a IRIS
        </h2>
        <MeetIris />
      </SectionBand>

      <SectionBand ariaLabelledBy="lugar-para-todos-titulo" tone="surface" nextFill="var(--color-canvas)">
        <h2 id="lugar-para-todos-titulo" className={styles.sectionTitle}>
          Un Lugar para Todos
        </h2>
        <div className={styles.forWho}>
          {ROLES.flatMap((role, index) => [
            index > 0 && <span key={`divider-${role.title}`} className={styles.forWhoDivider} aria-hidden="true" />,
            <article key={role.title} className={styles.forWhoBlock}>
              <img src={role.image} alt="" className={styles.forWhoBadge} />
              <h3>{role.title}</h3>
              <p>{role.text}</p>
            </article>,
          ])}
        </div>
      </SectionBand>

      <SectionBand ariaLabelledBy="estadisticas-titulo" tone="canvas" nextFill="var(--color-surface)">
        <h2 id="estadisticas-titulo" className={styles.sectionTitle}>
          Por Qué Importa
        </h2>
        <Statistics />
      </SectionBand>

      <SectionBand
        ariaLabelledBy="como-funciona-titulo"
        tone="surface"
        wide
        reveal={false}
        nextFill="var(--color-canvas)"
      >
        <h2 id="como-funciona-titulo" className={styles.sectionTitle}>
          Cómo Funciona
        </h2>
        <HowItWorksDiagram />
      </SectionBand>

      <SectionBand
        ariaLabelledBy="unete-titulo"
        tone="canvas"
        wide
        reveal={false}
        nextFill="var(--color-iris-deep)"
      >
        <JoinSection />
      </SectionBand>

      <LandingFooter />
    </main>
  );
}

