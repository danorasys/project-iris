// A one time message for the login page, like "your password changed".
// It goes through sessionStorage because closing the session makes the route
// guards redirect on their own, and that replaced the navigation state.

export interface LoginNotice {
  title: string;
  message: string;
}

const KEY = "iris:login-notice";

export function leaveLoginNotice(notice: LoginNotice): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(notice));
  } catch {
    // Storage blocked (private mode, for example): the login just shows no message.
  }
}

/** Reads the message without deleting it. The page deletes it once it's on
 * screen, reading and deleting in one step would lose it with React's
 * StrictMode, which runs the initial state twice in dev. */
export function peekLoginNotice(): LoginNotice | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const notice = JSON.parse(raw) as Partial<LoginNotice>;
    return typeof notice.title === "string" && typeof notice.message === "string"
      ? { title: notice.title, message: notice.message }
      : null;
  } catch {
    return null;
  }
}

export function clearLoginNotice(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}
