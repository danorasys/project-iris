import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/shared/auth/AuthContext";

interface RequireRolProps {
  role: "guardian" | "teacher" | "student";
  children: ReactNode;
}

/** Protects a route, only lets in users with an active session of the
 * given role. While the session is still loading from the refresh token,
 * it doesn't redirect yet, so we avoid a flash to /login on every reload. */
export function RequireRol({ role, children }: RequireRolProps) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;

  if (!session || session.role !== role) {
    const destination = role === "student" ? "/login/student" : "/login/adult";
    return <Navigate to={destination} state={{ desde: location }} replace />;
  }

  return <>{children}</>;
}
