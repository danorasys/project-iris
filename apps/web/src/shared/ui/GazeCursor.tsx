import { useEffect, useRef } from "react";
import { useGazeSource } from "@/shared/gaze/useGazeSource";
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
      element.style.visibility = "visible";
    });
  }, [fuente]);

  // Hidden until the first position: with the keyboard (HU-88) none ever
  // comes, and a dot stuck in the corner would only confuse.
  return (
    <div ref={ref} className={styles.cursor} style={{ visibility: "hidden" }} aria-hidden="true">
      <span className={styles.nucleo} />
    </div>
  );
}
