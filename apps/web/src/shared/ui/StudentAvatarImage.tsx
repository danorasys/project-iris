import { useAvatars } from "@/shared/api/hooks/useAuthApi";
import styles from "./StudentAvatarImage.module.css";

interface StudentAvatarImageProps {
  avatarId: number;
  size?: "small" | "medium" | "large";
  label?: string;
}

/** Renders one of the avatars from the avatars catalog (see
 * `useAvatars`) by id. The catalog is fetched once and cached
 * (`staleTime: Infinity`), so calling this from several places on the same
 * screen costs one request, not one per avatar. Renders nothing while the
 * catalog is still loading or if the id doesn't match any entry, rather
 * than guessing at a fallback image. */
export function StudentAvatarImage({ avatarId, size = "medium", label }: StudentAvatarImageProps) {
  const avatarsQuery = useAvatars();
  const avatar = avatarsQuery.data?.find((a) => a.id === avatarId);
  if (!avatar) return null;
  return <img src={avatar.image_path} alt={label ?? avatar.name} className={`${styles.image} ${styles[size]}`} />;
}
