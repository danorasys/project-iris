import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { TokensAuth } from "@iris/shared-types";
import { ApiError, apiFetch, configureAuthHandlers } from "@/shared/api/httpClient";
import { queryClient } from "@/shared/api/queryClient";
import { decodeJwtPayload } from "./jwt";
import { removeLegacySessionData } from "./legacyStorage";
import { AuthContext, type AuthContextValue, type CurrentSession } from "./sessionContext";

// Enough for the browser to store the cookie the other tab just received.
const REFRESH_RETRY_WAIT_MS = 300;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<CurrentSession | null>(null);
  const [loading, setLoading] = useState(true);
  const accessTokenRef = useRef<string | null>(null);
  /** Refresh tokens are single use, they rotate on every call. Two calls at
   * the same time (StrictMode runs the effect twice, for example) would send
   * the same cookie and the second would wipe out the session of the first,
   * so they all wait for one shared promise. */
  const refreshInFlightRef = useRef<Promise<string | null> | null>(null);

  const setSession = useCallback((tokens: TokensAuth) => {
    const payload = decodeJwtPayload(tokens.access_token);
    if (!payload) return;
    accessTokenRef.current = tokens.access_token;
    setSessionState({
      accessToken: tokens.access_token,
      subjectId: payload.sub,
      role: payload.role,
      mfaVerified: payload.mfa === "1",
    });
  }, []);

  const clearSession = useCallback(() => {
    accessTokenRef.current = null;
    setSessionState(null);
    // Nothing the previous user loaded (data, private images) should stay
    // around for whoever uses this browser next.
    queryClient.clear();
  }, []);

  const refreshSession = useCallback((): Promise<string | null> => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    // The refresh token goes alone in its HttpOnly cookie, this code never
    // sees it. If another tab used it a moment ago, the browser already holds
    // the new cookie, so it's tried once more instead of closing the session.
    const attempt = (async () => {
      for (let tries = 1; tries <= 2; tries++) {
        try {
          const tokens = await apiFetch<TokensAuth>("/identity/auth/refresh", { method: "POST", auth: false });
          setSession(tokens);
          return tokens.access_token;
        } catch (error) {
          const usedByAnotherTab = error instanceof ApiError && error.code === "token_recien_usado";
          if (!usedByAnotherTab || tries === 2) break;
          await new Promise((resolve) => setTimeout(resolve, REFRESH_RETRY_WAIT_MS));
        }
      }
      clearSession();
      return null;
    })();

    refreshInFlightRef.current = attempt;
    void attempt.finally(() => {
      refreshInFlightRef.current = null;
    });
    return attempt;
  }, [setSession, clearSession]);

  // Always asks the server: only it can close the session and delete the
  // HttpOnly cookie. Without this, a reload would bring the session back.
  const closeSession = useCallback(async () => {
    try {
      await apiFetch("/identity/auth/logout", { method: "POST", auth: false });
    } catch {
      /* if it fails, clear local state anyway */
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
    removeLegacySessionData();
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
    () => ({ session, loading, setSession, closeSession, discardSession: clearSession }),
    [session, loading, setSession, closeSession, clearSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
