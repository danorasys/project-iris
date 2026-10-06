import {
  Bike,
  BookOpen,
  Calculator,
  Church,
  CircleCheck,
  Globe,
  GraduationCap,
  HeartHandshake,
  Landmark,
  Languages,
  Laptop,
  Layers,
  Leaf,
  Palette,
  PencilLine,
  Play,
  School,
  Star,
  Target,
  type LucideIcon,
} from "lucide-react";
import type { ClassroomArea } from "@iris/shared-types";
import { CLASSROOM_AREAS, CLASSROOM_GRADES } from "@/features/teacher/classrooms/classroomDetails";
import { useReveal } from "./useReveal";
import { turn } from "./turn";
import motion from "./motion.module.css";
import styles from "./Curriculum.module.css";

// A small icon for each of the nine mandatory areas.
const AREA_ICONS: Record<Exclude<ClassroomArea, "other">, LucideIcon> = {
  natural_sciences: Leaf,
  social_sciences: Globe,
  arts: Palette,
  ethics: HeartHandshake,
  physical_education: Bike,
  religion: Church,
  humanities: Languages,
  mathematics: Calculator,
  technology: Laptop,
};

// The nine areas with the same short names the teacher sees when creating a
// class ("Otra" is left out: it isn't one of the nine).
const AREAS = CLASSROOM_AREAS.flatMap((area) =>
  area.value === "other" ? [] : [{ name: area.short, icon: AREA_ICONS[area.value] }],
);

// The four moments every lesson goes through. Only the extra one can be
// left out, the same as in the lesson editor, so it shows dashed.
const MOMENTS: { icon: LucideIcon; text: string; optional?: boolean }[] = [
  { icon: Play, text: "Inicio" },
  { icon: BookOpen, text: "Contenido" },
  { icon: PencilLine, text: "Actividad" },
  { icon: Star, text: "Extra", optional: true },
];

type PillarVisual = "example" | "areas" | "grades" | "outcome";

interface Pillar {
  icon: LucideIcon;
  title: string;
  text: string;
  tone: string;
  visual: PillarVisual;
  slot: string;
}

// How a class is put together and what it stands on. Everything here is
// what the app really asks the teacher for when creating a class, a unit or
// a lesson.
const PILLARS: Pillar[] = [
  {
    icon: School,
    title: "Así se arma una clase",
    text: "Cada clase se arma en unidades, cada una con su pregunta guía, y cada lección tiene un propósito claro y cuatro momentos.",
    tone: styles.toneClear,
    visual: "example",
    slot: styles.slotExample,
  },
  {
    icon: Landmark,
    title: "Áreas de la Ley 115",
    text: "El docente crea cada clase en una de las nueve áreas obligatorias de la educación básica.",
    tone: styles.toneSky,
    visual: "areas",
    slot: styles.slotAreas,
  },
  {
    icon: GraduationCap,
    title: "Grados de 1.° a 5.°",
    text: "Cada clase es para un grado de primaria, como los Derechos Básicos de Aprendizaje, que van grado por grado.",
    tone: styles.toneSun,
    visual: "grades",
    slot: styles.slotGrades,
  },
  {
    icon: Target,
    title: "Derechos Básicos de Aprendizaje",
    text: "A partir de ellos, el docente escribe el desempeño esperado de cada lección: lo que el estudiante va a lograr.",
    tone: styles.toneMint,
    visual: "outcome",
    slot: styles.slotOutcome,
  },
];

// The little drawing at the bottom of each card. They're only decoration (the
// card's text already says it), except the list of areas, which is real info.
function PillarArt({ visual }: { visual: PillarVisual }) {
  switch (visual) {
    // The example class: it holds units, the first unit holds a lesson and
    // the lesson its four moments. Each level comes in inside the one before,
    // the next unit shows up last and paler, still to be opened.
    case "example":
      return (
        <div className={styles.example} aria-hidden="true">
          <div className={`${styles.level} ${styles.levelClass} ${motion.rise}`} style={turn(2)}>
            <p className={styles.levelName}>
              <School size={16} strokeWidth={2.2} />
              Clase
            </p>
            <p className={styles.levelTitle}>Matemáticas · 3.°</p>

            <div className={`${styles.level} ${styles.levelUnit} ${motion.rise}`} style={turn(4)}>
              <p className={styles.levelName}>
                <Layers size={16} strokeWidth={2.2} />
                Unidad 1
              </p>
              <p className={styles.levelTitle}>¿Cómo contamos lo que hay en la tienda?</p>

              <div className={`${styles.level} ${styles.levelLesson} ${motion.rise}`} style={turn(6)}>
                <p className={styles.levelName}>
                  <BookOpen size={16} strokeWidth={2.2} />
                  Lección 1
                </p>
                <p className={styles.levelTitle}>Números hasta 1000</p>
                <ul className={styles.moments}>
                  {MOMENTS.map(({ icon: Icon, text, optional }, index) => (
                    <li key={text} className={motion.pop} style={turn(8 + index)} data-optional={optional}>
                      <Icon size={14} strokeWidth={2.4} />
                      {text}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className={`${styles.level} ${styles.levelUnit} ${styles.levelNext} ${motion.rise}`} style={turn(12)}>
              <p className={styles.levelName}>
                <Layers size={16} strokeWidth={2.2} />
                Unidad 2
              </p>
              <p className={styles.levelTitle}>¿Cómo medimos lo que nos rodea?</p>
            </div>
          </div>
        </div>
      );
    case "areas":
      return (
        <ul className={styles.areas} aria-label="Las nueve áreas">
          {AREAS.map(({ name, icon: Icon }, index) => (
            <li key={name} className={motion.pop} style={turn(index + 2)}>
              <Icon size={15} strokeWidth={2.2} aria-hidden="true" />
              {name}
            </li>
          ))}
        </ul>
      );
    // Five steps that go up, one per grade. 3.° is lit, the grade of the
    // example class.
    case "grades":
      return (
        <div className={styles.grades} aria-hidden="true">
          {CLASSROOM_GRADES.map((grade, index) => (
            <span key={grade.value} className={styles.grade} data-on={grade.value === 3} style={turn(index + 3)}>
              <span className={styles.gradeBar} />
              {grade.label}
            </span>
          ))}
        </div>
      );
    // The expected outcome the way the teacher writes it in a lesson.
    case "outcome":
      return (
        <div className={`${styles.outcome} ${motion.pop}`} style={turn(4)} aria-hidden="true">
          <span className={styles.outcomeLabel}>Desempeño esperado</span>
          <span className={styles.outcomeText}>Cuenta, lee y escribe números hasta 1000.</span>
          <CircleCheck className={`${styles.outcomeCheck} ${motion.pop}`} style={turn(7)} size={22} strokeWidth={2.4} />
        </div>
      );
  }
}

// "Cómo se organiza": one bento with the example class and the three things
// it stands on (the Colombian curriculum). The example goes first and tall.
export function Curriculum() {
  const { ref, inView } = useReveal<HTMLUListElement>(0.15);

  return (
    <ul ref={ref} className={`${styles.bento} ${inView ? motion.visible : ""}`} data-visible={inView}>
      {PILLARS.map(({ icon: Icon, title, text, tone, visual, slot }, index) => (
        <li key={title} className={`${styles.pillarSlot} ${slot} ${motion.rise}`} style={turn(index)}>
          <div className={`${styles.pillar} ${tone}`}>
            <Icon className={styles.pillarWatermark} size={140} strokeWidth={1.4} aria-hidden="true" />
            <div className={styles.pillarHead}>
              <span className={styles.pillarIcon}>
                <Icon size={22} strokeWidth={2.1} aria-hidden="true" />
              </span>
              <h3 className={styles.pillarTitle}>{title}</h3>
            </div>
            <p className={styles.pillarText}>{text}</p>
            <PillarArt visual={visual} />
          </div>
        </li>
      ))}
    </ul>
  );
}
