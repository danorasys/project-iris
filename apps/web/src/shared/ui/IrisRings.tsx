import { useEffect, useRef, useState } from "react";
import styles from "./IrisRings.module.css";

// The rings of an iris, like the ones in the logo, drawn very faint behind
// the dark parts of the landing and the welcome of the portals. Three of
// them turn slowly, each at its own
// pace; the dotted ones stay still (turning them wouldn't show anyway).
const RINGS = [
  { r: 120, dash: "2 10", width: 2, speed: "" },
  { r: 210, dash: "60 18", width: 1.5, speed: "220s" },
  { r: 300, dash: "1 14", width: 3, speed: "190s" },
  { r: 400, dash: "140 30", width: 1.5, speed: "260s" },
  { r: 500, dash: "3 22", width: 2, speed: "" },
  { r: 610, dash: "none", width: 1, speed: "" },
];

// Each ring is its own <svg> and the whole <svg> turns, so the graphics card
// rotates a ready picture instead of redrawing the dashes on every frame.
// They only turn while they're on screen.
export function IrisRings({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    // Without the observer (an old browser, the tests) they just stay still.
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${styles.rings} ${onScreen ? styles.turning : ""} ${className ?? ""}`}
      aria-hidden="true"
    >
      {RINGS.map((ring, index) => (
        <svg
          key={ring.r}
          className={ring.speed ? styles.ring : styles.ringStill}
          viewBox="-640 -640 1280 1280"
          focusable="false"
          style={{ animationDuration: ring.speed || undefined, animationDirection: index % 2 ? "reverse" : "normal" }}
        >
          <circle r={ring.r} strokeWidth={ring.width} strokeDasharray={ring.dash} />
        </svg>
      ))}
    </div>
  );
}
