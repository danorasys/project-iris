// Where families write to IRIS. Kept in one place so changing it later
// doesn't mean hunting for it in every screen.
export const SUPPORT_EMAIL = "soporte@iris.bucaramanga.upb.edu.co";

/** mailto link with only the subject filled in. Personal data never goes in
 * the link, the person writes it in the email itself. */
export function supportMailto(subject: string): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
