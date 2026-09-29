import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { ApiError } from "@/shared/api/httpClient";
import { useAccesoPortal } from "@/shared/api/hooks/useAuthApi";
import { LoadingScreen } from "@/shared/ui/LoadingScreen";

/** Shows the parents' portal only if the server says the 2FA check was
 * passed recently, otherwise sends the guardian to type the code. The server
 * checks it on every portal request too, this just picks the right screen. */
export function RequirePortalAccess({ children }: { children: ReactNode }) {
  const access = useAccesoPortal();

  if (access.isPending) return <LoadingScreen />;
  if (access.isError) {
    const needsCode = access.error instanceof ApiError && access.error.code === "acceso_portal_requerido";
    return <Navigate to={needsCode ? "/guardian/verify-2fa" : "/login/guardian/portal"} replace />;
  }
  return <>{children}</>;
}
