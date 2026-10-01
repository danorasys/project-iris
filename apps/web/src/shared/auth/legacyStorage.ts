// Older versions kept the refresh token and the last tutor's email in
// localStorage, where any script on the page could read them. The session
// now lives in an HttpOnly cookie, so whatever is left from before goes away.
const LEGACY_KEYS = ["iris_refresh_token", "iris_tutor_correo_reciente"];

export function removeLegacySessionData(): void {
  try {
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);
  } catch {
    // Storage blocked (private mode, for example): there's nothing saved either.
  }
}
