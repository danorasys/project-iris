import { useCallback, useRef, useState, type ReactNode } from "react";
import { useConfirmarAccesoPortal } from "@/shared/api/hooks/useAuthApi";
import { PortalAccessContext, isPortalAccessRequired, type WithPortalAccess } from "./portalAccess";
import { TwoFactorCodeDialog } from "./ui/TwoFactorCodeDialog";

/** Wraps the parents' portal. When a request finds the portal closed (a
 * while without activity), it asks for the 2FA code right there and repeats
 * the request, instead of throwing the guardian out of the page. */
export function PortalAccessProvider({ children }: { children: ReactNode }) {
  const confirmAccess = useConfirmarAccesoPortal();
  const [asking, setAsking] = useState(false);
  // Several requests can find the portal closed at once, they all wait for
  // the same dialog.
  const waiting = useRef<Array<(confirmed: boolean) => void>>([]);

  const withPortalAccess = useCallback<WithPortalAccess>(async (action) => {
    try {
      return await action();
    } catch (error) {
      if (!isPortalAccessRequired(error)) throw error;
      const confirmed = await new Promise<boolean>((resolve) => {
        waiting.current.push(resolve);
        setAsking(true);
      });
      if (!confirmed) throw error;
      return await action();
    }
  }, []);

  const finish = useCallback((confirmed: boolean) => {
    const resolvers = waiting.current;
    waiting.current = [];
    setAsking(false);
    resolvers.forEach((resolve) => resolve(confirmed));
  }, []);

  return (
    <PortalAccessContext.Provider value={withPortalAccess}>
      {children}
      {asking && (
        <TwoFactorCodeDialog
          title="Confirma que eres tú"
          text="Pasó un tiempo sin actividad en el Portal de Padres. Escribe el código de 6 dígitos de tu aplicación autenticadora para continuar. Lo que estabas haciendo no se pierde."
          onSubmit={async (code) => {
            await confirmAccess.mutateAsync({ code });
            finish(true);
          }}
          onCancel={() => finish(false)}
        />
      )}
    </PortalAccessContext.Provider>
  );
}
