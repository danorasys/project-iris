import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/shared/auth/AuthContext";
import { useUsuarioActual } from "@/shared/api/hooks/useTeacherTwoFactorApi";
import { TotpSetupScreen } from "@/features/auth/student/TotpSetupScreen";
import { TotpSuccessScreen } from "@/features/auth/student/TotpSuccessScreen";

/** `/teacher/setup-2fa`. For a teacher who registered before IRIS asked for
 * 2FA: they set it up here the next time they sign in, with the same steps
 * a new teacher sees at registration. */
export default function TeacherSetup2faPage() {
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const user = useUsuarioActual();
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <TotpSuccessScreen
        firstName={user.data?.first_name ?? ""}
        account="teacher"
        onContinue={() => navigate("/teacher/portal", { replace: true })}
      />
    );
  }

  return (
    <TotpSetupScreen
      account="teacher"
      onVerified={(tokens) => {
        if (tokens) setSession(tokens);
        setDone(true);
      }}
    />
  );
}
