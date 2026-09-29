// Private images (classroom logos, lesson images) are downloaded with the
// user's session and shown from a local blob: URL. Each image is fetched
// once and its blob: URL is shared by every component that shows it.

import { useEffect } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiFetchBlob } from "@/shared/api/httpClient";

const AUTH_IMAGE_SCOPE = "auth-image";

export const authImageKeys = {
  byPath: (path: string) => [AUTH_IMAGE_SCOPE, path] as const,
};

// A blob: URL keeps its file in memory until it's revoked. The cache owns
// them, so each one is revoked when its query leaves the cache: after
// gcTime with nobody showing it, or on logout (queryClient.clear()).
const watchedClients = new WeakSet<QueryClient>();

function revokeUrlsWhenRemoved(client: QueryClient): void {
  if (watchedClients.has(client)) return;
  watchedClients.add(client);
  client.getQueryCache().subscribe((event) => {
    if (event.type !== "removed" || event.query.queryKey[0] !== AUTH_IMAGE_SCOPE) return;
    const url: unknown = event.query.state.data;
    if (typeof url === "string") URL.revokeObjectURL(url);
  });
}

/** Returns a blob: URL for a private image, ready for `<img src>`.
 * `path` is an API path from `mediaPaths.ts`, or null/undefined when
 * there's no image to show. */
export function useAuthImage(path: string | null | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => revokeUrlsWhenRemoved(queryClient), [queryClient]);

  return useQuery({
    queryKey: authImageKeys.byPath(path ?? ""),
    queryFn: async () => URL.createObjectURL(await apiFetchBlob(path ?? "")),
    enabled: Boolean(path),
    // File names change whenever an image changes, so a downloaded one
    // never goes stale. Refetching would only leave old blob: URLs behind.
    staleTime: Infinity,
    gcTime: 10 * 60_000,
  });
}
