import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/shared/api/httpClient";
import { useAccesoPortal } from "./useAuthApi";

const apiFetch = vi.fn();

vi.mock("@/shared/api/httpClient", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/shared/api/httpClient")>();
  return { ...original, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  apiFetch.mockReset();
});

describe("useAccesoPortal", () => {
  it("succeeds when the server answers 204 with no body", async () => {
    apiFetch.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAccesoPortal(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.isError).toBe(false);
  });

  it("keeps the API error when the portal is closed", async () => {
    apiFetch.mockRejectedValue(new ApiError(403, "acceso_portal_requerido", "no"));
    const { result } = renderHook(() => useAccesoPortal(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as ApiError).code).toBe("acceso_portal_requerido");
  });
});
