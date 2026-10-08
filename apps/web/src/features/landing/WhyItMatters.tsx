import { useEffect, useRef } from "react";
import { formatNumber } from "./formatNumber";
import { turn } from "./turn";
import { prefersReducedMotion, useReveal } from "./useReveal";
import motion from "./motion.module.css";
import styles from "./WhyItMatters.module.css";

interface Statistic {
  // The number as a plain value, and how many decimals it shows.
  value: number;
  decimals: number;
  unit: string;
  before: string;
  emphasis: string;
  after: string;
  source: string;
  date: string;
  // The institution, written by name: their logos need written permission
  // to be used, the name is enough to say where the figure comes from.
  institution: string;
}

// The only verified figures for the landing, don't invent more.
const STATISTICS: Statistic[] = [
  {
    value: 2500,
    decimals: 0,
    unit: "millones",
    before: "de personas en el mundo necesitan tecnología de apoyo para vivir con autonomía. ",
    emphasis: "Solo el 3\u00a0% accede",
    after: " a ella en países de bajos ingresos.",
    source: 'Organización Mundial de la Salud (OMS), hoja informativa "Assistive technology"',
    date: "Actualizada el 2 de enero de 2024",
    institution: "OMS",
  },
  {
    value: 19.1,
    decimals: 1,
    unit: "millones",
    before: "de niños, niñas y adolescentes con discapacidad viven en América Latina y el Caribe. De ellos, ",
    emphasis: "7 de cada 10",
    after: " en edad escolar no asisten a la escuela.",
    source: "UNICEF LAC",
    date: "Publicado en noviembre de 2021",
    institution: "UNICEF",
  },
  {
    value: 3134037,
    decimals: 0,
    unit: "personas",
    before: "en Colombia reportan dificultades para realizar actividades básicas diarias (",
    emphasis: "7,1\u00a0% de la población",
    after: "), como moverse, caminar o subir y bajar escaleras.",
    source: "DANE, Censo Nacional de Población y Vivienda (CNPV)",
    date: "Datos del censo 2018",
    institution: "DANE",
  },
];

const COUNT_MS = 1600;

// The figure counts up from zero the first time it's seen, writing straight
// into the element on each frame instead of re-rendering. Screen readers
// read the real figure from the hidden copy next to it.
function CountUp({ value, decimals, start }: { value: number; decimals: number; start: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !start) return;
    if (prefersReducedMotion()) {
      el.textContent = formatNumber(value, decimals);
      return;
    }
    const began = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min((now - began) / COUNT_MS, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = formatNumber(value * eased, decimals);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [start, value, decimals]);

  return (
    <>
      <span ref={ref} className={styles.figureNumber} aria-hidden="true">
        {formatNumber(value, decimals)}
      </span>
      <span className={styles.srOnly}>{formatNumber(value, decimals)}</span>
    </>
  );
}

export function WhyItMatters() {
  const { ref, inView } = useReveal<HTMLDivElement>(0.25);

  return (
    <div ref={ref} className={`${styles.panel} ${inView ? motion.visible : ""}`}>
      <header className={styles.head}>
        <h2 id="why-it-matters-title" className={`${styles.title} ${motion.rise}`}>
          Por qué importa
        </h2>
        <p className={`${styles.lead} ${motion.rise}`} style={turn(1)}>
          Las cifras oficiales muestran cuánta falta hace una tecnología de apoyo que llegue al aula.
        </p>
      </header>

      <div className={`${styles.card} ${motion.rise}`} style={turn(2)}>
        <dl className={styles.stats}>
          {STATISTICS.map((statistic, index) => (
            <div key={statistic.source} className={`${styles.stat} ${motion.rise}`} style={turn(index + 3)}>
              <dt className={styles.figure}>
                <CountUp value={statistic.value} decimals={statistic.decimals} start={inView} />
                <span className={styles.unit}> {statistic.unit}</span>
              </dt>
              <dd className={styles.description}>
                <p>
                  {statistic.before}
                  <strong>{statistic.emphasis}</strong>
                  {statistic.after}
                </p>
                <p className={styles.source}>
                  <span className={styles.institution}>{statistic.institution}</span>
                  <span>
                    {statistic.source} · {statistic.date}
                  </span>
                </p>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
