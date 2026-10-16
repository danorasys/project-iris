import { useEffect, useRef } from "react";
import { subscribeDwellProgress } from "@/shared/gaze/dwellProgress";
import type { GazeEngineState } from "@/shared/gaze/GazeSource";
import { useGazeSource } from "@/shared/gaze/useGazeSource";
import styles from "./GazeCursor.module.css";

// While EyeGestures is calibrating or following the eyes, the circle is its
// own (`#cursor`): IRIS doesn't draw another one, it only fills that one.
const eyesDrive = (state: GazeEngineState | undefined) => state === "calibrating" || state === "ready";

/** The blue circle of the gaze. With the eyes it's EyeGestures' own cursor,
 * painted in the blue of IRIS (theme.css); without the camera, the mouse
 * moves one just like it, drawn here. On something that can be chosen it
 * fills up, and once it's full that thing is chosen. While it's on, the
 * mouse's own arrow hides, so there's only one thing to follow. */
export function GazeCursor() {
  const source = useGazeSource();
  const ref = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const eyesRef = useRef(eyesDrive(source.getEngineState?.()));

  // Whose circle it is: EyeGestures' once the eyes drive.
  useEffect(() => {
    if (!source.subscribeEngineState) return;
    return source.subscribeEngineState((state) => {
      eyesRef.current = eyesDrive(state);
      if (eyesRef.current && ref.current) ref.current.style.visibility = "hidden";
    });
  }, [source]);

  useEffect(() => {
    const root = document.documentElement;
    const unsubscribe = source.subscribe(({ x, y }) => {
      root.dataset.gazeCursor = "on";
      const element = ref.current;
      if (!element || eyesRef.current) return;
      element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      element.style.visibility = "visible";
    });
    return () => {
      unsubscribe();
      delete root.dataset.gazeCursor;
    };
  }, [source]);

  // The fill grows with the target being looked at, in both circles.
  useEffect(
    () =>
      subscribeDwellProgress((progress) => {
        document.getElementById("cursor")?.style.setProperty("--iris-fill", String(progress));
        ref.current?.toggleAttribute("data-filling", progress > 0);
        if (fillRef.current) fillRef.current.style.transform = `scale(${progress})`;
        if (ringRef.current) ringRef.current.style.strokeDashoffset = String(1 - progress);
      }),
    [],
  );

  // Hidden until the first position: before it, a dot stuck in the corner
  // would only confuse.
  return (
    <div ref={ref} className={styles.cursor} style={{ visibility: "hidden" }} aria-hidden="true">
      <span ref={fillRef} className={styles.fill} />
      <svg className={styles.ring} viewBox="0 0 100 100">
        <circle className={styles.track} cx="50" cy="50" r="44" pathLength="1" />
        <circle ref={ringRef} className={styles.progress} cx="50" cy="50" r="44" pathLength="1" />
      </svg>
      <span className={styles.dot} />
    </div>
  );
}
