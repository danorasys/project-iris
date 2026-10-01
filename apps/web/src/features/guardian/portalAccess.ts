import { createContext, useContext } from "react";
import { ApiError } from "@/shared/api/httpClient";

/** Runs a portal request. If the portal access ran out, the guardian types
 * the 2FA code and the request runs once more, so nothing typed is lost.
 * Closing the dialog throws the first error as usual. */
export type WithPortalAccess = <T>(action: () => Promise<T>) => Promise<T>;

export const PortalAccessContext = createContext<WithPortalAccess | null>(null);

/** The server's answer when this session has no open portal access. */
export function isPortalAccessRequired(error: unknown): boolean {
  return error instanceof ApiError && error.code === "acceso_portal_requerido";
}

const runDirectly: WithPortalAccess = (action) => action();

/** Outside the portal page (or in a test without the provider) the request
 * just runs, with no dialog. */
export function useWithPortalAccess(): WithPortalAccess {
  return useContext(PortalAccessContext) ?? runDirectly;
}
