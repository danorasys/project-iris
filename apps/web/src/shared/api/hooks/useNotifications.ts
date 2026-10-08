// Notification hooks for teachers and guardians. They ask the tray
// (GET /notifications/me) every so often. No live push: nothing here needs
// to arrive at the very second it happens.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NotificationItem, NotificationPage } from "@iris/shared-types";
import { apiFetch } from "@/shared/api/httpClient";

// A tray changes little, once a minute is plenty. The teacher's request
// count comes with their classrooms (useTeacherClassrooms), every 30 s.
const INTERVALO_BANDEJA_MS = 60_000;

/** Whose tray. Each role keeps its own cache, so signing in with another
 * account never shows the previous one's notifications. */
export type TrayRole = "guardian" | "teacher";

const trayKeys = {
  all: (role: TrayRole) => ["notifications", role] as const,
  page: (role: TrayRole, page: number, pageSize: number) => [...trayKeys.all(role), "page", page, pageSize] as const,
  unread: (role: TrayRole) => [...trayKeys.all(role), "unread"] as const,
};

/** One page of a tray, newest first. For the guardian the server needs the
 * portal's 2FA access open, a closed one comes back as `acceso_portal_requerido`. */
export function useNotificationTray(role: TrayRole, page: number, pageSize: number) {
  return useQuery({
    queryKey: trayKeys.page(role, page, pageSize),
    queryFn: () =>
      apiFetch<NotificationPage>(`/notifications/me?page=${page}&page_size=${pageSize}`, { background: true }),
    refetchInterval: INTERVALO_BANDEJA_MS,
    // Moving to the next page keeps the current one on screen meanwhile.
    placeholderData: (previous) => previous,
  });
}

/** How many unread notifications there are, for the number next to
 * "Notificaciones" in the portal. Only the count is asked, no items. */
export function useUnreadNotifications(role: TrayRole) {
  return useQuery({
    queryKey: trayKeys.unread(role),
    queryFn: () => apiFetch<NotificationPage>("/notifications/me?page=1&page_size=1", { background: true }),
    select: (page) => page.unread_count,
    refetchInterval: INTERVALO_BANDEJA_MS,
    // Without the guardian's portal open there is nothing to count, no need to retry.
    retry: false,
  });
}

export function useMarkNotificationRead(role: TrayRole) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<NotificationItem>(`/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: trayKeys.all(role) }),
  });
}

export function useDeleteNotification(role: TrayRole) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/notifications/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: trayKeys.all(role) }),
  });
}

/** Several at once, the ones picked in the tray (`POST /notifications/me/delete`).
 * Only your own go; says how many. */
export function useDeleteNotifications(role: TrayRole) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch<{ deleted: number }>("/notifications/me/delete", { method: "POST", body: { ids } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: trayKeys.all(role) }),
  });
}

// The guardian's portal uses these names.
export const useBandejaNotificaciones = (page: number, pageSize: number) =>
  useNotificationTray("guardian", page, pageSize);
export const useNotificacionesSinLeer = () => useUnreadNotifications("guardian");
export const useMarcarNotificacionLeida = () => useMarkNotificationRead("guardian");
export const useEliminarNotificacion = () => useDeleteNotification("guardian");
export const useEliminarNotificaciones = () => useDeleteNotifications("guardian");
