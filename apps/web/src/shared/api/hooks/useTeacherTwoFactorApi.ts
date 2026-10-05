// The teacher's 2FA: whether it's on, and the code asked when they open their
// panel in a new session. Setting it up uses useConfigurarTotp("teacher").

import { useMutation, useQuery } from "@tanstack/react-query";
import type { CurrentUser, TokensAuth, TotpStatus, TotpVerifyRequest } from "@iris/shared-types";
import { apiFetch } from "@/shared/api/httpClient";

/** Who is signed in, for the name the mascot uses. Doesn't need the 2FA. */
export function useUsuarioActual() {
  return useQuery({
    queryKey: ["users", "me"],
    queryFn: () => apiFetch<CurrentUser>("/identity/users/me"),
    staleTime: Infinity,
  });
}

export function useEstado2faDocente(enabled: boolean) {
  return useQuery({
    queryKey: ["teacher", "2fa"],
    queryFn: () => apiFetch<TotpStatus>("/identity/teachers/me/2fa"),
    enabled,
    retry: false,
  });
}

/** A good code gives back a new access token with the session verified. */
export function useConfirmarSesionDocente() {
  return useMutation({
    mutationFn: (body: TotpVerifyRequest) =>
      apiFetch<TokensAuth>("/identity/teachers/me/2fa/challenge", { method: "POST", body }),
  });
}
