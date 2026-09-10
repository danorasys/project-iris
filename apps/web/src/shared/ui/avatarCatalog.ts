import avatar1 from "@/assets/students/avatar-1.png";
import avatar2 from "@/assets/students/avatar-2.png";
import avatar3 from "@/assets/students/avatar-3.png";
import avatar4 from "@/assets/students/avatar-4.png";

export interface AvatarOption {
  id: string;
  label: string;
  image: string;
}

/** The 4 fixed avatars a student can choose from after calibrating. It's
 * a small permanent set, not an administrable catalog, it matches
 * identity-service's `AvatarId` type and a CHECK constraint on the
 * `students.avatar` column. Replaces the earlier CSS-drawn animal
 * species (`Avatar.tsx`, now removed). */
export const STUDENT_AVATARS: readonly AvatarOption[] = [
  { id: "avatar1", label: "Violeta", image: avatar1 },
  { id: "avatar2", label: "Coral", image: avatar2 },
  { id: "avatar3", label: "Bosque", image: avatar3 },
  { id: "avatar4", label: "Cielo", image: avatar4 },
];

const DEFAULT_AVATAR = STUDENT_AVATARS[0];

export function getAvatarOption(avatarId: string): AvatarOption {
  return STUDENT_AVATARS.find((a) => a.id === avatarId) ?? DEFAULT_AVATAR;
}
