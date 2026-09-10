const REFRESH_TOKEN_KEY = "iris_refresh_token";
const TUTOR_HINT_KEY = "iris_tutor_correo_reciente";

export function guardarRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

export function leerRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function borrarRefreshToken(): void {
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

/** Remembering the tutor's email on this device speeds up "Ya soy Mirador" on
 * the student branch. Not sensitive information, just saves retyping it. */
export function guardarCorreoTutorReciente(correo: string): void {
  localStorage.setItem(TUTOR_HINT_KEY, correo);
}

export function leerCorreoTutorReciente(): string | null {
  return localStorage.getItem(TUTOR_HINT_KEY);
}
