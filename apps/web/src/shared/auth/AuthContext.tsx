import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { TokensAuth } from "@iris/shared-types";
import { apiFetch, configureAuthHandlers } from "@/shared/api/httpClient";
import { decodeJwtPayload } from "./jwt";
import { borrarRefreshToken, guardarRefreshToken, leerRefreshToken } from "./tokenStorage";

type Role = "guardian" | "teacher" | "student";

interface CurrentSession {
  accessToken: string;
  subjectId: string;
  role: Role;
}

interface AuthContextValue {
  session: CurrentSession | null;
  /** false while trying to restore a session from the stored refresh token */
  loading: boolean;
  setSession: (tokens: TokensAuth) => void;
  closeSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<CurrentSession | null>(null);
  const [loading, setLoading] = useState(true);
  const accessTokenRef = useRef<string | null>(null);
  /** Refresh tokens can only be used once, they rotate every call (see
   * identity-service's `refresh()`). If two calls try to restore the
   * session at the same time, for example React's StrictMode running the
   * effect twice, both would read the same stored token. The second one
   * would fail with 401 since the first already rotated it, and that
   * would wipe out the session the first call just set up correctly. So
   * we share one in-flight promise, this way every call waiting at the
   * same time gets the same result instead of fighting over the token. */
  const refreshInFlightRef = useRef<Promise<string | null> | null>(null);

  const setSession = useCallback((tokens: TokensAuth) => {
    const payload = decodeJwtPayload(tokens.access_token);
    if (!payload) return;
    accessTokenRef.current = tokens.access_token;
    guardarRefreshToken(tokens.refresh_token);
    setSessionState({ accessToken: tokens.access_token, subjectId: payload.sub, role: payload.role });
  }, []);

  const clearSession = useCallback(() => {
    accessTokenRef.current = null;
    borrarRefreshToken();
    setSessionState(null);
  }, []);

  const refreshSession = useCallback((): Promise<string | null> => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const attempt = (async () => {
      const refreshToken = leerRefreshToken();
      if (!refreshToken) return null;
      try {
        const tokens = await apiFetch<TokensAuth>("/identity/auth/refresh", {
          method: "POST",
          body: { refresh_token: refreshToken },
          auth: false,
        });
        setSession(tokens);
        return tokens.access_token;
      } catch {
        clearSession();
        return null;
      }
    })();

    refreshInFlightRef.current = attempt;
    void attempt.finally(() => {
      refreshInFlightRef.current = null;
    });
    return attempt;
  }, [setSession, clearSession]);

  const closeSession = useCallback(async () => {
    const refreshToken = leerRefreshToken();
    if (refreshToken && accessTokenRef.current) {
      try {
        await apiFetch("/identity/auth/logout", { method: "POST", body: { refresh_token: refreshToken } });
      } catch {
        /* if it fails, clear local state anyway */
      }
    }
    clearSession();
  }, [clearSession]);

  useEffect(() => {
    configureAuthHandlers({
      getAccessToken: () => accessTokenRef.current,
      refresh: refreshSession,
      onAuthFailure: clearSession,
    });
  }, [refreshSession, clearSession]);

  useEffect(() => {
    let active = true;
    void refreshSession().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ session, loading, setSession, closeSession }),
    [session, loading, setSession, closeSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
