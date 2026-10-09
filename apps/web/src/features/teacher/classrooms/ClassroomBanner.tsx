import type { Classroom } from "@iris/shared-types";
import styles from "./ClassroomBanner.module.css";

interface ClassroomBannerProps {
  color: Classroom["color"];
  /** Height in pixels. */
  height?: number;
  className?: string;
}

/** The decorative band of a classroom, in its color, the same one the
 * teacher sees on its card. Purely decorative, the avatar usually hangs
 * from its bottom edge. */
export function ClassroomBanner({ color, height = 86, className }: ClassroomBannerProps) {
  return (
    <span
      className={className ? `${styles.banner} ${className}` : styles.banner}
      data-color={color}
      style={{ height }}
      aria-hidden="true"
    />
  );
}
