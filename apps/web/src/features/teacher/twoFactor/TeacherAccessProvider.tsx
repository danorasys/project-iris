import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useConfirmarSesionDocente } from "@/shared/api/hooks/useTeacherTwoFactorApi";
import { configureTwoFactorHandler } from "@/shared/api/httpClient";
import { useAuth } from "@/shared/auth/AuthContext";
import { TwoFactorCodeDialog } from "@/shared/ui/profile/TwoFactorCodeDialog";

/** Wraps the teacher's screens. Like the parents' portal, the panel closes
 * after 15 min without activity: when a request finds it closed, the 2FA
 * code is asked right there and the request is made again, so nothing typed
 * is lost. Cancelling goes to the full code screen. */
export function TeacherAccessProvider({ children }: { children: ReactNode }) {
  const confirm = useConfirmarSesionDocente();
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [asking, setAsking] = useState(false);
  // Several requests can find the panel closed at once, they all wait for
  // the same dialog.
  const waiting = useRef<Array<(confirmed: boolean) => void>>([]);

  const finish = useCallback((confirmed: boolean) => {
    const resolvers = waiting.current;
    waiting.current = [];
    setAsking(false);
    resolvers.forEach((resolve) => resolve(confirmed));
  }, []);

  useEffect(() => {
    configureTwoFactorHandler(
      () =>
        new Promise<boolean>((resolve) => {
          waiting.current.push(resolve);
          setAsking(true);
        }),
    );
    // Leaving the teacher's screens: nobody is left to answer the dialog.
    return () => {
      configureTwoFactorHandler(null);
      finish(false);
    };
  }, [finish]);

  return (
    <>
      {children}
      {asking && (
        <TwoFactorCodeDialog
          title="Confirma que eres tú"
          text="Pasó un tiempo sin actividad en tu panel docente. Escribe el código de 6 dígitos de tu aplicación autenticadora para continuar. Lo que estabas haciendo no se pierde."
          onSubmit={async (code) => {
            setSession(await confirm.mutateAsync({ code }));
            finish(true);
          }}
          onCancel={() => {
            finish(false);
            navigate("/teacher/verify-2fa", { replace: true, state: { desde: location.pathname } });
          }}
        />
      )}
    </>
  );
}
