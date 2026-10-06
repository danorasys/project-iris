import { Link } from "react-router-dom";
import {
  ArrowRight,
  Baby,
  BookOpen,
  BookOpenCheck,
  Compass,
  DoorOpen,
  Eye,
  HeartHandshake,
  KeyRound,
  PencilLine,
  ScanEye,
  School,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import heroStudent from "@/assets/landing/hero-student.jpg";
import heroFamily from "@/assets/landing/hero-family.jpg";
import heroTeacher from "@/assets/landing/hero-teacher.jpg";
import { IrisRings } from "./IrisRings";
import { REGISTER_LINK } from "./landingLinks";
import { useReveal } from "./useReveal";
import { turn } from "./turn";
import links from "./links.module.css";
import motion from "./motion.module.css";
import styles from "./HowItWorks.module.css";

// The gaze, shown instead of told: the pointer goes to "Siguiente", the ring
// fills sky blue in 0.9 s, turns green and a check appears. It only plays
// once the panel is on screen.
function GazePanel() {
  const { ref, inView } = useReveal<HTMLDivElement>(0.3);

  return (
    <div ref={ref} className={`${styles.panel} ${inView ? motion.visible : ""}`}>
      <IrisRings className={styles.panelRings} />
      <div className={styles.panelHead}>
        <h3 className={`${styles.panelTitle} ${motion.rise}`}>Aprender solo con la mirada</h3>
        <p className={`${styles.panelText} ${motion.rise}`} style={turn(1)}>
          La cámara del computador sigue hacia dónde mira el estudiante. Cuando sostiene la mirada sobre un botón, es
          como si lo tocara.
        </p>
      </div>

      <div className={styles.call} aria-hidden="true">
        <svg
          className={`${styles.curves} ${motion.wipe}`}
          style={turn(3)}
          viewBox="0 0 1000 400"
          preserveAspectRatio="none"
        >
          <path d="M-20 300 C 120 300, 140 180, 260 190" />
          <path d="M760 120 C 880 110, 900 250, 1020 240" />
        </svg>

        <figure className={`${styles.mainTile} ${motion.rise}`} style={turn(2)} data-playing={inView}>
          <img src={heroStudent} alt="" />
          <span className={styles.tileLabel}>Estudiante</span>
          <span className={`${styles.tileBadge} ${styles.badgeBlue} ${motion.pop}`} style={turn(5)}>
            <Eye size={18} strokeWidth={2.2} />
          </span>
          <span className={styles.gazeButton}>
            <svg className={styles.gazeRingSvg} viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="29" className={styles.gazeTrack} />
              <circle cx="32" cy="32" r="29" pathLength={1} className={styles.gazeRing} />
            </svg>
            {/* When the ring closes, "Siguiente" gives way to a check that
                draws itself inside the white circle. */}
            <span className={styles.gazeButtonFace}>
              <span className={styles.gazeLabel}>Siguiente</span>
              <svg className={styles.gazeCheck} viewBox="0 0 24 24">
                <path pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
          </span>
          <span className={styles.gazeDot} />
          <span className={styles.gazeDone}>¡Listo!</span>
        </figure>

        <div className={styles.sideTiles}>
          <figure className={`${styles.sideTile} ${motion.rise}`} style={turn(3)}>
            <img src={heroFamily} alt="" />
            <span className={styles.tileLabel}>Familia</span>
            <span className={`${styles.tileBadge} ${styles.badgeAmber} ${motion.pop}`} style={turn(6)}>
              <HeartHandshake size={18} strokeWidth={2.2} />
            </span>
          </figure>
          <figure className={`${styles.sideTile} ${motion.rise}`} style={turn(4)}>
            <img src={heroTeacher} alt="" />
            <span className={styles.tileLabel}>Docente</span>
            <span className={`${styles.tileBadge} ${styles.badgeMint} ${motion.pop}`} style={turn(7)}>
              <BookOpen size={18} strokeWidth={2.2} />
            </span>
          </figure>
        </div>

        <span className={`${styles.callPill} ${motion.pop}`} style={turn(5)}>
          <Eye size={18} strokeWidth={2.4} />
          Mirar un momento es como hacer clic
        </span>
      </div>
    </div>
  );
}

interface FlowNode {
  kind: "chip" | "tag" | "block";
  icon?: LucideIcon;
  text: string;
}

interface Step {
  who: string;
  title: string;
  text: string;
  tone: "sky" | "amber" | "mint";
  flow: FlowNode[];
}

// Who does what, in the order it happens. Every step is something the app
// really does today.
const STEPS: Step[] = [
  {
    who: "Familia",
    title: "La familia abre la puerta",
    text: "Crea su cuenta, registra a su hijo o hija y lo inscribe en sus clases con el código que le da el docente. Desde su portal recibe los avisos de esas clases.",
    tone: "amber",
    flow: [
      { kind: "chip", icon: UserPlus, text: "Crea la cuenta de la familia" },
      { kind: "chip", icon: Baby, text: "Registra a su peque" },
      { kind: "tag", icon: KeyRound, text: "Inscribe a su peque en sus clases" },
      { kind: "block", icon: DoorOpen, text: "Listo para aprender" },
    ],
  },
  {
    who: "Docente",
    title: "El docente arma el camino",
    text: "Crea su clase por área y grado, la organiza en unidades y publica cada lección con su actividad cuando está completa.",
    tone: "mint",
    flow: [
      { kind: "chip", icon: School, text: "Clase de Matemáticas, 3.°" },
      { kind: "tag", text: "Unidad 1" },
      { kind: "chip", icon: BookOpen, text: "¿Cómo contamos lo que hay en la tienda?" },
      { kind: "block", icon: BookOpenCheck, text: "Lección publicada" },
    ],
  },
  {
    who: "Estudiante",
    title: "El estudiante aprende mirando",
    text: "Calibra la cámara a su medida, explora sus clases y recorre sus lecciones solo con la mirada.",
    tone: "sky",
    flow: [
      { kind: "chip", icon: ScanEye, text: "Calibra la cámara" },
      { kind: "chip", icon: Compass, text: "Explora sus clases" },
      { kind: "tag", icon: Eye, text: "Mira para avanzar" },
      { kind: "block", icon: PencilLine, text: "Responde su actividad" },
    ],
  },
];

// One step: the words on one side and, on the other, a small flow that
// builds itself node by node, joined by dashed lines that draw as it goes.
function StepRow({ step, index }: { step: Step; index: number }) {
  const { ref, inView } = useReveal<HTMLDivElement>(0.35);

  return (
    <div
      ref={ref}
      className={`${styles.step} ${index % 2 ? styles.stepReverse : ""} ${inView ? motion.visible : ""}`}
      data-visible={inView}
    >
      <div className={styles.stepText}>
        <p className={`${styles.stepWho} ${motion.rise}`}>
          <span className={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</span>
          {step.who}
        </p>
        <h3 className={`${styles.stepTitle} ${motion.rise}`} style={turn(1)}>
          {step.title}
        </h3>
        <p className={`${styles.stepBody} ${motion.rise}`} style={turn(2)}>
          {step.text}
        </p>
      </div>

      <ol className={`${styles.flow} ${styles[step.tone]}`} aria-label={`Pasos: ${step.who}`}>
        {step.flow.map((node, i) => {
          const Icon = node.icon;
          return (
            <li key={node.text} className={styles.flowItem} data-side={i % 2 ? "b" : "a"}>
              {i > 0 && (
                <svg
                  className={styles.connector}
                  style={turn(i * 2 + 1)}
                  viewBox="0 0 100 40"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path d={i % 2 ? "M18 0 C 18 26, 52 12, 52 40" : "M52 0 C 52 26, 18 12, 18 40"} />
                </svg>
              )}
              <span className={`${styles.node} ${styles[node.kind]} ${motion.pop}`} style={turn(i * 2 + 2)}>
                {Icon && <Icon size={16} strokeWidth={2.3} aria-hidden="true" />}
                {node.text}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// Right after the three paths, a call to join while the whole way is still
// fresh, so nobody has to scroll to the end of the page to sign up.
function StartNow() {
  const { ref, inView } = useReveal<HTMLDivElement>(0.4);

  return (
    <div ref={ref} className={`${styles.startNow} ${inView ? motion.visible : ""}`}>
      <h3 className={`${styles.startTitle} ${motion.rise}`}>¿Listos para empezar el camino?</h3>
      <p className={`${styles.startText} ${motion.rise}`} style={turn(1)}>
        Las familias registran a sus peques y los docentes crean sus clases. Todo comienza con una cuenta.
      </p>
      <div className={`${styles.startActions} ${motion.rise}`} style={turn(2)}>
        <Link to={REGISTER_LINK.to} state={REGISTER_LINK.state} className={styles.startButton}>
          Únete a IRIS
          <ArrowRight size={18} strokeWidth={2.4} aria-hidden="true" />
        </Link>
        <Link to="/login/adult" className={`${links.lineLink} ${styles.startLogin}`}>
          Ya tengo cuenta
        </Link>
      </div>
    </div>
  );
}

export function HowItWorks() {
  return (
    <>
      <GazePanel />
      <div className={styles.steps}>
        {STEPS.map((step, index) => (
          <StepRow key={step.who} step={step} index={index} />
        ))}
      </div>
      <StartNow />
    </>
  );
}
