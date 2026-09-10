import { getAvatarOption } from "./avatarCatalog";
import styles from "./StudentAvatarImage.module.css";

interface StudentAvatarImageProps {
  avatarId: string;
  size?: "small" | "medium" | "large";
  label?: string;
}

/** Renders one of the 4 predetermined student avatars by id. Falls back to
 * the first one for any unrecognized/legacy value (e.g. an old CSS-animal
 * species id from before the avatar system changed). */
export function StudentAvatarImage({ avatarId, size = "medium", label }: StudentAvatarImageProps) {
  const option = getAvatarOption(avatarId);
  return <img src={option.image} alt={label ?? ""} className={`${styles.image} ${styles[size]}`} />;
}
