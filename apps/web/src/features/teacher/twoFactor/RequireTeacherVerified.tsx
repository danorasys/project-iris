import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/shared/auth/useAuth";
import { useEstado2faDocente } from "@/shared/api/hooks/useTeacherTwoFactorApi";
import { LoadingScreen } from "@/shared/ui/LoadingScreen";

/** Shows the teacher's panel only to a session that already passed the 2FA
 * code. Otherwise it sends them to type it, or to set it up if they never
 * did. Every service checks the token anyway, this just picks the screen. */
export function RequireTeacherVerified({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const location = useLocation();
  const verified = session?.mfaVerified ?? false;
  const status = useEstado2faDocente(!verified);

  if (verified) return <>{children}</>;
  if (status.isPending) return <LoadingScreen />;
  if (status.isError) return <Navigate to="/login/adult" replace />;
  return (
    <Navigate
      to={status.data.enabled ? "/teacher/verify-2fa" : "/teacher/setup-2fa"}
      state={{ desde: location.pathname }}
      replace
    />
  );
}
