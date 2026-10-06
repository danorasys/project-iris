import {
  BookOpen,
  GraduationCap,
  Landmark,
  Layers,
  PencilLine,
  Play,
  School,
  Star,
  Target,
  type LucideIcon,
} from "lucide-react";
import { CLASSROOM_AREAS } from "@/features/teacher/classrooms/classroomDetails";
import { useReveal } from "./useReveal";
import { turn } from "./turn";
import motion from "./motion.module.css";
import styles from "./Curriculum.module.css";

// The nine mandatory areas, with the same short names the teacher sees when
// creating a class ("Otra" is left out: it isn't one of the nine).
const AREAS = CLASSROOM_AREAS.filter((area) => area.value !== "other").map((area) => area.short);

// The four moments every lesson goes through.
const MOMENTS: { icon: LucideIcon; text: string }[] = [
  { icon: Play, text: "Inicio" },
  { icon: BookOpen, text: "Contenido" },
  { icon: PencilLine, text: "Actividad" },
  { icon: Star, text: "Extra" },
];

interface Pillar {
  icon: LucideIcon;
  title: string;
  text: string;
  tone: string;
}

// What each class in IRIS stands on. Everything here is what the app really
// asks the teacher for when creating a class, a unit or a lesson.
const PILLARS: Pillar[] = [
  {
    icon: Landmark,
    title: "Áreas de la Ley 115",
    text: "El docente crea cada clase en una de las nueve áreas obligatorias de la educación básica.",
    tone: styles.toneSky,
  },
  {
    icon: GraduationCap,
    title: "Grados de 1.° a 5.°",
    text: "Cada clase es para un grado de primaria, como los Derechos Básicos de Aprendizaje, que van grado por grado.",
    tone: styles.toneSun,
  },
  {
    icon: Target,
    title: "Derechos Básicos de Aprendizaje",
    text: "A partir de ellos, el docente escribe el desempeño esperado de cada lección: lo que el estudiante va a lograr.",
    tone: styles.toneMint,
  },
  {
    icon: Layers,
    title: "Unidades y lecciones",
    text: "Cada unidad gira en torno a una pregunta guía, y cada lección tiene un propósito claro y cuatro momentos.",
    tone: styles.toneOrange,
  },
];

// The structure, shown instead of told: a class holds a unit, the unit
// holds a lesson and the lesson its four moments. Each level comes in
// nested inside the one before, the moments pop in last.
function StructureDiagram() {
  const { ref, inView } = useReveal<HTMLDivElement>(0.3);

  return (
    <div ref={ref} className={`${styles.diagram} ${inView ? motion.visible : ""}`} aria-hidden="true">
      <div className={`${styles.level} ${styles.levelClass} ${motion.rise}`}>
        <p className={styles.levelName}>
          <School size={16} strokeWidth={2.2} />
          Clase
        </p>
        <p className={styles.levelTitle}>Matemáticas · 3.°</p>

        <div className={`${styles.level} ${styles.levelUnit} ${motion.rise}`} style={turn(2)}>
          <p className={styles.levelName}>
            <Layers size={16} strokeWidth={2.2} />
            Unidad 1
          </p>
          <p className={styles.levelTitle}>¿Cómo contamos lo que hay en la tienda?</p>

          <div className={`${styles.level} ${styles.levelLesson} ${motion.rise}`} style={turn(4)}>
            <p className={styles.levelName}>
              <BookOpen size={16} strokeWidth={2.2} />
              Lección 1
            </p>
            <p className={styles.levelTitle}>Números hasta 1000</p>
            <ul className={styles.moments}>
              {MOMENTS.map(({ icon: Icon, text }, index) => (
                <li key={text} className={motion.pop} style={turn(6 + index)}>
                  <Icon size={14} strokeWidth={2.4} />
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Pillars() {
  const { ref, inView } = useReveal<HTMLUListElement>(0.2);

  return (
    <ul ref={ref} className={`${styles.pillars} ${inView ? motion.visible : ""}`}>
      {PILLARS.map(({ icon: Icon, title, text, tone }, index) => (
        <li key={title} className={`${styles.pillar} ${tone} ${motion.rise}`} style={turn(index + 1)}>
          <span className={styles.pillarIcon}>
            <Icon size={22} strokeWidth={2} aria-hidden="true" />
          </span>
          <div>
            <h3 className={styles.pillarTitle}>{title}</h3>
            <p className={styles.pillarText}>{text}</p>
            {index === 0 && (
              <ul className={styles.areas} aria-label="Las nueve áreas">
                {AREAS.map((area) => (
                  <li key={area}>{area}</li>
                ))}
              </ul>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

// "Cómo se organiza": the structure of a class on one side and what it
// stands on (the Colombian curriculum) on the other.
export function Curriculum() {
  return (
    <div className={styles.layout}>
      <StructureDiagram />
      <Pillars />
    </div>
  );
}
