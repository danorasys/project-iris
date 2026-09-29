import type { ImgHTMLAttributes, ReactNode } from "react";
import { useAuthImage } from "@/shared/api/hooks/useAuthImage";

interface AuthImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  /** API path of the image, from `mediaPaths.ts`. Null or undefined shows the fallback. */
  path: string | null | undefined;
  /** Shown while the image loads, if it fails, or when there's no path. */
  fallback?: ReactNode;
}

/** `<img>` for private images. Downloads the file with the user's session
 * (see `useAuthImage`), since a plain `<img src>` can't send it. */
export function AuthImage({ path, fallback = null, alt = "", ...imgProps }: AuthImageProps) {
  const { data: src } = useAuthImage(path);
  if (!src) return <>{fallback}</>;
  return <img src={src} alt={alt} {...imgProps} />;
}
