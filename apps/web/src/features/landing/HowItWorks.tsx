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
  Sparkles,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import heroStudent from "@/assets/landing/hero-student.jpg";
import heroFamily from "@/assets/landing/hero-family.jpg";
import heroTeacher from "@/assets/landing/hero-teacher.jpg";
import badgeFamily from "@/assets/landing/badge-family.png";
import badgeStudents from "@/assets/landing/badge-students.png";
import badgeTeachers from "@/assets/landing/badge-teachers.png";
import { IrisRings } from "@/shared/ui/IrisRings";
import { REGISTER_LINK } from "./landingLinks";
import { useReveal } from "./useReveal";
import { turn } from "./turn";
import links from "./links.module.css";
import motion from "./motion.module.css";
import styles from "./HowItWorks.module.css";

// The gaze, shown instead of told: the pointer goes to "Siguiente", the ring
// fills sky blue in 0.9 s, turns green and a check appears. It only plays
// once the panel is on screen. The words go on the left and the call on the
// right, so the panel takes less height.
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

interface Path {
  who: string;
  badge: string;
  title: string;
  text: string;
  // The card's soft blue and the color of its steps.
  card: "mistLight" | "mistMid" | "mistDeep";
  tone: "sky" | "amber" | "mint";
  flow: FlowNode[];
}

// Who does what, in the order it happens: the family opens the door, the
// teacher builds the way and the student walks it. Every step is something
// the app really does today.
const PATHS: Path[] = [
  {
    who: "Familia",
    badge: badgeFamily,
    title: "La familia abre la puerta",
    text: "El respaldo detrás de cada avance: cuida los datos y acompaña de cerca a su hijo o hija.",
    card: "mistMid",
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
    badge: badgeTeachers,
    title: "El docente arma el camino",
    text: "Crea su clase por área y grado, la organiza en unidades y publica cada lección cuando está completa.",
    card: "mistDeep",
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
    badge: badgeStudents,
    title: "El estudiante aprende mirando",
    text: "Su propio lugar, donde cada mirada sostenida es una decisión.",
    card: "mistLight",
    tone: "sky",
    flow: [
      { kind: "chip", icon: ScanEye, text: "Calibra la cámara" },
      { kind: "chip", icon: Compass, text: "Explora sus clases" },
      { kind: "tag", icon: Eye, text: "Mira para avanzar" },
      { kind: "block", icon: PencilLine, text: "Responde su actividad" },
    ],
  },
];

// The three paths side by side, one card each: who it is, what they do there
// and their steps one under the other, the last one in color.
function PathCards() {
  const { ref, inView } = useReveal<HTMLUListElement>(0.25);

  return (
    <ul ref={ref} className={`${styles.paths} ${inView ? motion.visible : ""}`}>
      {PATHS.map((path, index) => (
        <li key={path.who} className={`${styles.path} ${styles[path.card]} ${motion.rise}`} style={turn(index)}>
          <div className={styles.pathTop}>
            <img src={path.badge} alt="" className={styles.pathBadge} />
            <p className={styles.pathWho}>
              <span className={styles.pathNumber}>{String(index + 1).padStart(2, "0")}</span>
              {path.who}
            </p>
          </div>
          <h3 className={styles.pathTitle}>{path.title}</h3>
          <p className={styles.pathText}>{path.text}</p>
          <ol className={`${styles.flow} ${styles[path.tone]}`} aria-label={`Pasos: ${path.who}`}>
            {path.flow.map((node, i) => {
              const Icon = node.icon;
              return (
                <li
                  key={node.text}
                  className={`${styles.node} ${styles[node.kind]} ${motion.pop}`}
                  style={turn(index + i + 2)}
                >
                  {Icon && <Icon size={16} strokeWidth={2.3} aria-hidden="true" />}
                  {node.text}
                </li>
              );
            })}
          </ol>
        </li>
      ))}
    </ul>
  );
}

// The three people of the paths, one after the other on the little trail
// next to the call to join.
const START_PEOPLE = [
  { photo: heroFamily, label: "Familias" },
  { photo: heroTeacher, label: "Docentes" },
  { photo: heroStudent, label: "Estudiantes" },
];

// Right after the three paths, a call to join while the whole way is still
// fresh, so nobody has to scroll to the end of the page to sign up. The
// trail draws itself, the people pop onto it and the button keeps a soft
// shine so the eye goes there.
function StartNow() {
  const { ref, inView } = useReveal<HTMLDivElement>(0.4);

  return (
    <div ref={ref} className={`${styles.startNow} ${inView ? motion.visible : ""}`} data-visible={inView}>
      <IrisRings className={styles.startRings} />
      <div className={styles.startCopy}>
        <h3 className={`${styles.startTitle} ${motion.rise}`}>
          ¿Listos para empezar <span className={styles.startMark}>el camino</span>?
        </h3>
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

      <div className={styles.startArt} aria-hidden="true">
        <svg className={`${styles.startTrail} ${motion.wipe}`} style={turn(2)} viewBox="0 0 400 300" focusable="false">
          <path d="M8 280 C 30 250, 40 225, 70 215 S 150 120, 200 85 S 290 200, 330 205 S 385 140, 392 70" />
        </svg>
        {START_PEOPLE.map((person, i) => (
          <span key={person.label} className={styles.startPerson} data-spot={i}>
            <span className={`${styles.startBubble} ${motion.pop}`} style={turn(i * 2 + 4)}>
              <img src={person.photo} alt="" />
            </span>
            <span className={`${styles.startTag} ${motion.pop}`} style={turn(i * 2 + 5)}>
              {person.label}
            </span>
          </span>
        ))}
        <span className={`${styles.startGoal} ${motion.pop}`} style={turn(10)}>
          <Sparkles size={18} strokeWidth={2.4} />
        </span>
      </div>
    </div>
  );
}

export function HowItWorks() {
  return (
    <>
      <GazePanel />
      <PathCards />
      <StartNow />
    </>
  );
}
