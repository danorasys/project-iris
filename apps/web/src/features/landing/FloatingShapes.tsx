import type { CSSProperties } from "react";
import styles from "./FloatingShapes.module.css";

export interface BackgroundShape {
  top: string;
  left?: string;
  right?: string;
  size: number;
  shape: "circle" | "square" | "cross";
  anim: "A" | "B" | "C" | "D";
  duration: string;
  delay: string;
  opacity?: number;
  accent?: boolean;
}

/** Scattered circles, squares and crosses, each floating at its own pace.
 * Color comes from `--color-shape`/`--color-shape-accent`, set by the
 * caller so the same shapes work over dark and light backgrounds. */
export function FloatingShapes({ shapes, className }: { shapes: BackgroundShape[]; className?: string }) {
  return (
    <div className={`${styles.container} ${className ?? ""}`} aria-hidden="true">
      {shapes.map((shape, idx) => {
        const style: CSSProperties = {
          top: shape.top,
          left: shape.left,
          right: shape.right,
          width: shape.size,
          height: shape.size,
          opacity: shape.opacity,
          animationDuration: shape.duration,
          animationDelay: shape.delay,
        };
        const shapeClass =
          shape.shape === "square" ? styles.shapeSquare : shape.shape === "cross" ? styles.shapeCross : "";
        const classes = [
          styles.floatingShape,
          shapeClass,
          styles[`float${shape.anim}`],
          shape.accent ? styles.shapeAccent : "",
        ].join(" ");
        return <span key={idx} className={classes} style={style} />;
      })}
    </div>
  );
}
