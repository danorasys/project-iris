import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/shared/auth/AuthContext";
import { useConfirmarSesionDocente } from "@/shared/api/hooks/useTeacherTwoFactorApi";
import { VerifyCodePage } from "@/features/auth/VerifyCodePage";

/** `/teacher/verify-2fa`. The code asked once per session before the
 * teacher's panel. A good one comes back with a new access token for this
 * same session, now marked as verified, and the teacher goes where they
 * were headed. */
export default function TeacherVerify2faPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setSession, closeSession } = useAuth();
  const confirm = useConfirmarSesionDocente();
  const headedTo = (location.state as { desde?: string } | null)?.desde ?? "/teacher/portal";

  return (
    <VerifyCodePage
      purpose="para entrar a tu panel docente"
      pending={confirm.isPending}
      // There's nothing behind this screen but the login, so going back signs out.
      onBack={() => {
        void closeSession().then(() => navigate("/login/adult", { replace: true }));
      }}
      onConfirm={async (code) => {
        const tokens = await confirm.mutateAsync({ code });
        setSession(tokens);
        navigate(headedTo, { replace: true });
      }}
    />
  );
}
