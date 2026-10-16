import {
  BookOpen,
  Calculator,
  Globe,
  GraduationCap,
  Landmark,
  Languages,
  Layers,
  Leaf,
  ListChecks,
  PencilLine,
  Play,
  School,
  Star,
  Target,
  type LucideIcon,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { CLASSROOM_GRADES } from "@/features/teacher/classrooms/classroomDetails";
import { IrisRings } from "@/shared/ui/IrisRings";
import { useReveal } from "./useReveal";
import { turn } from "./turn";
import motion from "./motion.module.css";
// Same blue panel, cards and steps as "Cómo funciona", so both sections look
// like one way: this file only adds what's its own.
import how from "./HowItWorks.module.css";
import styles from "./Curriculum.module.css";

// The areas with Derechos Básicos de Aprendizaje (the MEN published DBA only
// for these, so they're the only ones where IRIS asks for one). Language and
// English are both inside "Humanidades" of the Ley 115. Mathematics, the area
// of the example class, goes on its tilted tag.
const DBA_AREAS: { icon: LucideIcon; name: string; example?: boolean }[] = [
  { icon: Calculator, name: "Matemáticas", example: true },
  { icon: BookOpen, name: "Lenguaje" },
  { icon: Leaf, name: "Ciencias naturales" },
  { icon: Globe, name: "Ciencias sociales" },
  { icon: Languages, name: "Inglés" },
];

// The four moments every lesson goes through. Only the extra one can be
// left out, the same as in the lesson editor, so it shows dashed.
const MOMENTS: { icon: LucideIcon; text: string; optional?: boolean }[] = [
  { icon: Play, text: "Inicio" },
  { icon: BookOpen, text: "Contenido" },
  { icon: PencilLine, text: "Actividad" },
  { icon: Star, text: "Extra", optional: true },
];

// How round a turn of the path can be (less when there's no room).
const CORNER = 40;

// The dashed line of a winding path, drawn from where its stops really are:
// it goes down from one stop and turns into the side of the next one. It's
// measured again whenever the card changes size.
function useTrail() {
  const ref = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState("");

  useLayoutEffect(() => {
    const route = ref.current;
    if (!route) return;
    const draw = () => {
      const stops = [...route.querySelectorAll<HTMLElement>("[data-side]")];
      const parts = stops.slice(0, -1).map((from, i) => {
        const to = stops[i + 1];
        const goesRight = from.dataset.side === "left";
        // It leaves near the outer side of the stop (never further in than a
        // fifth of the route), so even a wide stop leaves room for the turn.
        const inset = Math.min(from.offsetWidth * 0.4, route.offsetWidth * 0.2);
        const x = goesRight ? from.offsetLeft + inset : from.offsetLeft + from.offsetWidth - inset;
        const y = from.offsetTop + from.offsetHeight;
        const endY = to.offsetTop + to.offsetHeight / 2;
        const endX = goesRight ? to.offsetLeft : to.offsetLeft + to.offsetWidth;
        const r = Math.max(0, Math.min(CORNER, endY - y, Math.abs(endX - x) / 2));
        const side = goesRight ? 1 : -1;
        // A round corner (a cubic close to a quarter circle) between the drop
        // and the run into the next grade.
        return (
          `M ${x} ${y} V ${endY - r} ` +
          `C ${x} ${endY - r * 0.45}, ${x + side * r * 0.45} ${endY}, ${x + side * r} ${endY} H ${endX}`
        );
      });
      setPath(parts.join(" "));
    };
    draw();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(draw);
    observer?.observe(route);
    void document.fonts?.ready.then(draw);
    return () => observer?.disconnect();
  }, []);

  return { ref, path };
}

// The stops of the example class, from the class to its lesson. They go up
// like steps on the right side of the blue panel.
const STOPS: { icon: LucideIcon; level: string; text: string; badge: string }[] = [
  { icon: School, level: "Clase", text: "Matemáticas · 3.°", badge: how.badgeBlue },
  { icon: Layers, level: "Unidad 1", text: "¿Qué operación nos ayuda a resolver cada problema?", badge: how.badgeAmber },
  { icon: BookOpen, level: "Lección 1", text: "Sumas y restas en la tienda", badge: how.badgeMint },
];

// "Así se arma una clase": the words on the left and the example class on
// the right, one stop after the other on a dashed trail, the lesson ending
// in its four moments.
function ClassPanel() {
  const { ref, inView } = useReveal<HTMLDivElement>(0.3);

  return (
    <div ref={ref} className={`${how.panel} ${styles.classPanel} ${inView ? motion.visible : ""}`}>
      <IrisRings className={how.panelRings} />
      <div className={how.panelHead}>
        <h3 className={`${how.panelTitle} ${motion.rise}`}>Así se arma una clase</h3>
        <p className={`${how.panelText} ${motion.rise}`} style={turn(1)}>
          Cada clase se arma en unidades, cada una con su pregunta guía, y cada lección tiene un propósito claro y
          cuatro momentos.
        </p>
      </div>

      <div className={styles.route} aria-hidden="true">
        <svg className={`${styles.routeTrail} ${motion.wipe}`} style={turn(2)} viewBox="0 0 600 300">
          <path d="M20 270 C 120 270, 120 200, 200 190 S 330 140, 380 110 S 520 40, 590 30" />
        </svg>
        <ol className={styles.stops}>
          {STOPS.map(({ icon: Icon, level, text, badge }, index) => (
            <li key={level} className={`${styles.stop} ${motion.rise}`} style={turn(index * 2 + 3)} data-step={index}>
              <span className={`${how.tileBadge} ${badge} ${styles.stopBadge}`}>
                <Icon size={18} strokeWidth={2.2} />
              </span>
              <span className={styles.stopLevel}>{level}</span>
              <span className={styles.stopText}>{text}</span>
              {index === STOPS.length - 1 && (
                <span className={styles.moments}>
                  {MOMENTS.map(({ icon: MomentIcon, text: moment, optional }, i) => (
                    <span key={moment} className={`${styles.moment} ${motion.pop}`} style={turn(10 + i)} data-optional={optional}>
                      <MomentIcon size={13} strokeWidth={2.4} />
                      {moment}
                    </span>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ol>
        <span className={`${how.callPill} ${styles.routePill} ${motion.pop}`} style={turn(9)}>
          <Layers size={18} strokeWidth={2.4} />
          Clase, unidades y lecciones con propósito
        </span>
      </div>
    </div>
  );
}

// The three things every class stands on, as cards like the three paths: who
// it is, what it means and its steps, the last one in color.
function Pillars() {
  const { ref, inView } = useReveal<HTMLUListElement>(0.2);
  const { ref: areasRef, path: areasPath } = useTrail();
  const { ref: gradesRef, path: gradesPath } = useTrail();
  const { ref: dbaRef, path: dbaPath } = useTrail();

  return (
    <ul ref={ref} className={`${how.paths} ${inView ? motion.visible : ""}`}>
      <li className={`${how.path} ${how.mistMid} ${motion.rise}`} style={turn(0)}>
        <div className={how.pathTop}>
          <span className={`${styles.pillarBadge} ${styles.badgeAmber}`}>
            <Landmark size={26} strokeWidth={2} aria-hidden="true" />
          </span>
          <p className={how.pathWho}>
            <span className={how.pathNumber}>01</span>
            Ley 115
          </p>
        </div>
        <h3 className={how.pathTitle}>Áreas de la Ley 115</h3>
        <p className={how.pathText}>El docente crea cada clase en una de las nueve áreas obligatorias de la educación básica.</p>
        {/* The same winding path as the grades: the five areas with DBA,
            one on each side in turns, and then all the others. */}
        <div ref={areasRef} className={`${how.flow} ${how.amber} ${styles.gradeRoute} ${styles.areasRoute}`} aria-hidden="true">
          <svg className={`${styles.gradeTrail} ${motion.wipe}`} style={turn(2)}>
            <path d={areasPath} />
          </svg>
          {DBA_AREAS.map(({ icon: Icon, name, example }, index) => (
            <span
              key={name}
              className={`${how.node} ${example ? how.tag : how.chip} ${styles.gradeStop} ${motion.pop}`}
              style={turn(index + 2)}
              data-side={index % 2 ? "right" : "left"}
            >
              <Icon size={16} strokeWidth={2.3} />
              {name}
            </span>
          ))}
          <span className={`${how.node} ${how.block} ${styles.gradeStop} ${motion.pop}`} style={turn(8)} data-side="right">
            <Landmark size={16} strokeWidth={2.3} />+ todas las áreas obligatorias
          </span>
        </div>
      </li>

      <li className={`${how.path} ${how.mistDeep} ${motion.rise}`} style={turn(1)}>
        <div className={how.pathTop}>
          <span className={`${styles.pillarBadge} ${styles.badgeMint}`}>
            <GraduationCap size={26} strokeWidth={2} aria-hidden="true" />
          </span>
          <p className={how.pathWho}>
            <span className={how.pathNumber}>02</span>
            Primaria
          </p>
        </div>
        <h3 className={how.pathTitle}>Grados de 1.° a 5.°</h3>
        <p className={how.pathText}>
          Cada clase es para un grado de primaria, como los Derechos Básicos de Aprendizaje, que van grado por grado.
        </p>
        {/* The five grades as a winding path: one on the left, the next on
            the right, tied by a dashed curve. 3.° goes on its tilted tag. */}
        <div ref={gradesRef} className={`${how.flow} ${how.mint} ${styles.gradeRoute}`} aria-hidden="true">
          <svg className={`${styles.gradeTrail} ${motion.wipe}`} style={turn(3)}>
            <path d={gradesPath} />
          </svg>
          {CLASSROOM_GRADES.map((grade, index) => (
            <span
              key={grade.value}
              className={`${how.node} ${grade.value === 3 ? how.tag : how.chip} ${styles.gradeStop} ${motion.pop}`}
              style={turn(index + 3)}
              data-side={index % 2 ? "right" : "left"}
            >
              <GraduationCap size={16} strokeWidth={2.3} />
              {grade.label} de primaria
            </span>
          ))}
          <span className={`${how.node} ${how.block} ${styles.gradeStop} ${motion.pop}`} style={turn(9)} data-side="right">
            <School size={16} strokeWidth={2.3} />
            Un grado por clase
          </span>
        </div>
      </li>

      <li className={`${how.path} ${how.mistLight} ${motion.rise}`} style={turn(2)}>
        <div className={how.pathTop}>
          <span className={`${styles.pillarBadge} ${styles.badgeBlue}`}>
            <Target size={26} strokeWidth={2} aria-hidden="true" />
          </span>
          <p className={how.pathWho}>
            <span className={how.pathNumber}>03</span>
            MEN
          </p>
        </div>
        <h3 className={how.pathTitle}>Derechos Básicos de Aprendizaje</h3>
        <p className={how.pathText}>
          A partir de ellos, el docente escribe el desempeño esperado de cada lección: lo que el estudiante va a lograr.
        </p>
        {/* The same winding path as the grades: from the DBA (DBA 1 of 3rd
            grade mathematics, MEN, "DBA · V.2", 2016, p. 22), through its
            evidences, to what the student will achieve in the lesson. */}
        <div ref={dbaRef} className={`${how.flow} ${how.sky} ${styles.gradeRoute} ${styles.dbaRoute}`} aria-hidden="true">
          <svg className={`${styles.gradeTrail} ${motion.wipe}`} style={turn(4)}>
            <path d={dbaPath} />
          </svg>
          <span
            className={`${how.node} ${how.chip} ${styles.gradeStop} ${styles.longStop} ${styles.dbaStop} ${motion.pop}`}
            style={turn(4)}
            data-side="left"
          >
            <span className={styles.dbaHead}>
              <Target size={16} strokeWidth={2.3} />
              DBA 1 · Matemáticas, 3.°
            </span>
            {/* Its name in IRIS's catalog, the one the teacher sees when
                choosing the DBA of a unit (dba_catalog_2016.json). */}
            <span className={styles.dbaName}>Problemas de suma, resta, multiplicación y división</span>
          </span>
          <span className={`${how.node} ${how.chip} ${styles.gradeStop} ${motion.pop}`} style={turn(5)} data-side="right">
            <ListChecks size={16} strokeWidth={2.3} />
            Sus evidencias
          </span>
          <span className={`${how.node} ${how.tag} ${styles.gradeStop} ${motion.pop}`} style={turn(6)} data-side="left">
            <Target size={16} strokeWidth={2.3} />
            Desempeño esperado
          </span>
          <span
            className={`${how.node} ${how.block} ${styles.gradeStop} ${styles.longStop} ${motion.pop}`}
            style={turn(7)}
            data-side="right"
          >
            <PencilLine size={16} strokeWidth={2.3} />
            Suma y resta los precios de la tienda
          </span>
        </div>
      </li>
    </ul>
  );
}

// "Cómo se organiza": the example class in the blue panel and the three
// things it stands on (the Colombian curriculum) under it, like "Cómo
// funciona" right before it.
export function Curriculum() {
  return (
    <div className={styles.curriculum}>
      <ClassPanel />
      <Pillars />
    </div>
  );
}
