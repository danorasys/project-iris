import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, HeartHandshake } from "lucide-react";
import badgeTeachers from "@/assets/landing/badge-teachers.png";
import badgeStudents from "@/assets/landing/badge-students.png";
import badgeFamily from "@/assets/landing/badge-family.png";
import logoIris from "@/assets/landing/logo-iris.png";
import { HeroCarousel } from "./HeroCarousel";
import { Curriculum } from "./Curriculum";
import { HowItWorks } from "./HowItWorks";
import { IrisRings } from "./IrisRings";
import { LandingFooter } from "./LandingFooter";
import { LandingHeader } from "./LandingHeader";
import { MeetIris } from "./MeetIris";
import { WhyItMatters } from "./WhyItMatters";
import { REGISTER_LINK } from "./landingLinks";
import { useReveal } from "./useReveal";
import { turn } from "./turn";
import links from "./links.module.css";
import motion from "./motion.module.css";
import styles from "./LandingPage.module.css";

interface Role {
  image: string;
  title: string;
  text: string;
  points: string[];
  tone: string;
}

// Three real spaces inside IRIS. Each card says what that person does
// there, with things the app already lets them do.
const ROLES: Role[] = [
  {
    image: badgeStudents,
    title: "Estudiantes",
    text: "Su propio lugar, donde cada mirada sostenida es una decisión: eligen, avanzan y crecen a su manera.",
    points: [
      "Calibran la cámara a su medida",
      "Exploran sus clases y lecciones",
      "Avanzan sus lecciones con la mirada",
    ],
    tone: styles.mistLight,
  },
  {
    image: badgeFamily,
    title: "Familia",
    text: "El respaldo detrás de cada avance: abren la puerta, cuidan los datos y acompañan de cerca a su hijo o hija.",
    points: ["Crean la cuenta de su peque", "Lo inscriben en sus clases", "Reciben los avisos de sus clases"],
    tone: styles.mistMid,
  },
  {
    image: badgeTeachers,
    title: "Docentes",
    text: "Quienes diseñan el camino: arman sus clases y dan forma a cada lección para sus estudiantes.",
    points: [
      "Crean clases por área y grado",
      "Organizan unidades y lecciones",
      "Publican cada lección con su actividad",
    ],
    tone: styles.mistDeep,
  },
];

// The same opening for every section: a small label, the title and a line
// under it, coming up in turn when they show up.
function SectionHead({ id, eyebrow, title, lead }: { id: string; eyebrow: string; title: string; lead?: string }) {
  const { ref, inView } = useReveal<HTMLElement>(0.4);

  return (
    <header ref={ref} className={`${styles.sectionHead} ${inView ? motion.visible : ""}`}>
      <p className={`${styles.eyebrow} ${motion.rise}`}>{eyebrow}</p>
      <h2 id={id} className={`${styles.sectionTitle} ${motion.rise}`} style={turn(1)}>
        {title}
      </h2>
      {lead && (
        <p className={`${styles.sectionLead} ${motion.rise}`} style={turn(2)}>
          {lead}
        </p>
      )}
    </header>
  );
}

// Each block inside wakes up its own entrances, so a long section doesn't
// play everything while only its top is on screen.
function Section({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className={`${styles.section} ${className ?? ""}`}>
      {children}
    </section>
  );
}

// Plays the entrances of what it wraps the first time it's on screen.
function Reveal({
  className,
  threshold = 0.25,
  children,
}: {
  className?: string;
  threshold?: number;
  children: ReactNode;
}) {
  const { ref, inView } = useReveal<HTMLDivElement>(threshold);

  return (
    <div ref={ref} className={`${className ?? ""} ${inView ? motion.visible : ""}`}>
      {children}
    </div>
  );
}

function RoleCards() {
  return (
    <Reveal className={styles.roles}>
      {ROLES.map((role, index) => (
        <article key={role.title} className={`${styles.role} ${role.tone} ${motion.rise}`} style={turn(index)}>
          <img src={role.image} alt="" className={styles.roleBadge} />
          <h3 className={styles.roleTitle}>{role.title}</h3>
          <p className={styles.roleText}>{role.text}</p>
          <ul className={styles.rolePoints}>
            {role.points.map((point) => (
              <li key={point}>
                <Check size={14} strokeWidth={3} aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
        </article>
      ))}
    </Reveal>
  );
}

// The closing invitation: IRIS in a ring that fills like a look, next to the
// call to join.
function JoinBand() {
  return (
    <Reveal className={styles.join} threshold={0.35}>
      <IrisRings className={styles.joinRings} />
      <div className={styles.joinText}>
        <h2 id="unete-titulo" className={`${styles.joinTitle} ${motion.rise}`}>
          Únete a la comunidad IRIS
        </h2>
        <p className={`${styles.joinLead} ${motion.rise}`} style={turn(1)}>
          Como familia, acompaña a tu hijo o hija, mirada a mirada, en su camino educativo. Como docente, súmate a una
          educación más inclusiva, donde cada estudiante aprende a su manera. Construyamos juntos un camino sin
          barreras.
        </p>
        <div className={`${styles.joinActions} ${motion.rise}`} style={turn(2)}>
          <Link to={REGISTER_LINK.to} state={REGISTER_LINK.state} className={styles.joinButton}>
            <HeartHandshake size={20} strokeWidth={2} aria-hidden="true" />
            Quiero unirme
          </Link>
          <Link to="/login/adult" className={`${links.lineLink} ${styles.joinLogin}`}>
            Ya tengo cuenta
            <ArrowRight size={16} strokeWidth={2.4} aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className={`${styles.joinArt} ${motion.rise}`} style={turn(2)} aria-hidden="true">
        <svg className={styles.joinRing} viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="47" className={styles.joinRingTrack} />
          <circle
            cx="50"
            cy="50"
            r="47"
            pathLength={1}
            className={`${styles.joinRingFill} ${motion.draw}`}
            style={turn(4)}
          />
        </svg>
        <span className={styles.joinMascot}>
          <img src={logoIris} alt="" />
        </span>
        <span className={`${styles.joinChip} ${styles.joinChipA} ${motion.pop}`} style={turn(6)}>
          Familias
        </span>
        <span className={`${styles.joinChip} ${styles.joinChipB} ${motion.pop}`} style={turn(7)}>
          Docentes
        </span>
        <span className={`${styles.joinChip} ${styles.joinChipC} ${motion.pop}`} style={turn(8)}>
          Estudiantes
        </span>
      </div>
    </Reveal>
  );
}

// `/`, the public landing.
export default function LandingPage() {
  return (
    <main className={styles.page}>
      <LandingHeader />
      <HeroCarousel />

      <Section id="conoce-iris" className={styles.meet}>
        <div className={styles.meetText}>
          <SectionHead
            id="conoce-iris-titulo"
            eyebrow="Conoce a IRIS"
            title="Tiene algo que contarte"
            lead="IRIS es el compañero que va de la mano de cada estudiante en sus clases. Antes de empezar, le escribe a su familia."
          />
        </div>
        <Reveal className={styles.meetChat}>
          <div className={motion.rise} style={turn(2)}>
            <MeetIris />
          </div>
        </Reveal>
      </Section>

      <Section id="para-quien" className={styles.centered}>
        <SectionHead
          id="para-quien-titulo"
          eyebrow="Un lugar para todos"
          title="Tres espacios, una misma comunidad"
          lead="Cada persona tiene su propio lugar dentro de IRIS, pensado para lo que hace en él."
        />
        <RoleCards />
      </Section>

      <Section id="como-funciona" className={styles.centered}>
        <SectionHead
          id="como-funciona-titulo"
          eyebrow="Cómo funciona"
          title="Tres miradas, un mismo camino"
          lead="La familia abre la puerta, el docente arma el camino y el estudiante lo recorre con la mirada."
        />
        <div className={styles.howBody}>
          <HowItWorks />
        </div>
      </Section>

      <Section id="como-se-organiza" className={styles.centered}>
        <SectionHead
          id="como-se-organiza-titulo"
          eyebrow="Cómo se organiza"
          title="Una estructura clara para cada clase"
          lead="Cada clase en IRIS se apoya en el currículo colombiano: las áreas de la Ley 115, los grados de primaria y los Derechos Básicos de Aprendizaje del Ministerio de Educación Nacional."
        />
        <Curriculum />
      </Section>

      <section id="por-que-importa" aria-labelledby="por-que-importa-titulo" className={styles.section}>
        <WhyItMatters />
      </section>

      <Section id="unete" className={styles.joinSection}>
        <JoinBand />
      </Section>

      <LandingFooter />
    </main>
  );
}
