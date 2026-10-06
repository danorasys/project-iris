import { createContext } from "react";
import type { TokensAuth } from "@iris/shared-types";

// The session the whole app shares. AuthProvider (AuthContext.tsx) fills it
// and useAuth reads it; they live in separate files so Vite can reload the
// provider on its own while developing.
export type Role = "guardian" | "teacher" | "student";

export interface CurrentSession {
  accessToken: string;
  subjectId: string;
  role: Role;
  /** A teacher's session that already passed the 2FA code. Only picks the
   * screen, every service checks the token itself. */
  mfaVerified: boolean;
}

export interface AuthContextValue {
  session: CurrentSession | null;
  /** true while trying to restore the session with the refresh cookie */
  loading: boolean;
  setSession: (tokens: TokensAuth) => void;
  closeSession: () => Promise<void>;
  /** Drops the local session without calling the server, for when the server
   * already closed it (password change, "close all sessions", security lock). */
  discardSession: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
