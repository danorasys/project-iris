/** Decodes a JWT payload ONLY for UI decisions (which screen to show).
 * Never used as the source of truth for authorization, the backend always
 * validates that. */
export interface JwtPayload {
  sub: string;
  role: "guardian" | "teacher" | "student";
  exp: number;
  [clave: string]: unknown;
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const [, payload] = token.split(".");
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(normalized)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

export function tokenExpiresInLessThan(token: string, marginSec: number): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return true;
  return payload.exp * 1000 - Date.now() < marginSec * 1000;
}
