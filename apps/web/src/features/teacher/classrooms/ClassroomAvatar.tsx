import type { Classroom } from "@iris/shared-types";
import { classroomLogoPath } from "@/shared/api/mediaPaths";
import { AuthImage } from "@/shared/ui/AuthImage";
import { classroomInitials } from "./classroomInitials";
import styles from "./ClassroomAvatar.module.css";

interface ClassroomAvatarProps {
  classroom: Pick<Classroom, "id" | "name" | "color" | "logo_file">;
  /** Width and height in pixels. */
  size?: number;
}

/** A classroom's avatar: its own image when the teacher uploaded one, or
 * the initials of its name on the color they picked. Decorative: the name
 * is always written next to it. */
export function ClassroomAvatar({ classroom, size = 72 }: ClassroomAvatarProps) {
  const initials = (
    <span
      className={`${styles.avatar} ${styles[classroom.color]}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {classroomInitials(classroom.name)}
    </span>
  );
  if (!classroom.logo_file) return initials;
  return (
    <AuthImage
      path={classroomLogoPath(classroom.id, classroom.logo_file)}
      className={styles.image}
      style={{ width: size, height: size }}
      alt=""
      fallback={initials}
    />
  );
}
