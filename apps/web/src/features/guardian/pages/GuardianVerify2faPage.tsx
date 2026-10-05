import { useNavigate } from "react-router-dom";
import { useConfirmarAccesoPortal } from "@/shared/api/hooks/useAuthApi";
import { VerifyCodePage } from "@/features/auth/VerifyCodePage";

/** `/guardian/verify-2fa`. Asks for a fresh code from the guardian's
 * authenticator app before the parents' portal, so a session left open on a
 * shared computer can't get in. A good code makes the server open the portal
 * for a while, then this page sends the guardian there. */
export default function GuardianVerify2faPage() {
  const navigate = useNavigate();
  const confirmAccess = useConfirmarAccesoPortal();

  return (
    <VerifyCodePage
      purpose="para entrar al Portal Padres"
      pending={confirmAccess.isPending}
      onBack={() => navigate("/login/guardian/portal")}
      onConfirm={async (code) => {
        const { failed_attempts_before: failedAttempts } = await confirmAccess.mutateAsync({ code });
        // The portal shows a notice if someone typed wrong codes since the last entry.
        navigate("/guardian/portal", { replace: true, state: { failedAttempts } });
      }}
    />
  );
}
