import { useEffect, useRef } from "react";
import { useGazeSource } from "@/shared/gaze/GazeSourceContext";
import styles from "./GazeCursor.module.css";

/** Visual cursor that follows the active gaze source. The same component is
 * used for real student interaction and for the landing hero's automated
 * demo, mounted inside a different `GazeSourceProvider` in each case. */
export function GazeCursor() {
  const fuente = useGazeSource();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return fuente.subscribe(({ x, y }) => {
      const element = ref.current;
      if (!element) return;
      element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    });
  }, [fuente]);

  return (
    <div ref={ref} className={styles.cursor} aria-hidden="true">
      <span className={styles.nucleo} />
    </div>
  );
}
