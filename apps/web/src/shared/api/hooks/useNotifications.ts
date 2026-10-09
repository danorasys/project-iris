// Notification hooks for teachers, guardians and kids. They ask the tray
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
export type TrayRole = "guardian" | "teacher" | "student";

const trayKeys = {
  all: (role: TrayRole) => ["notifications", role] as const,
  page: (role: TrayRole, page: number, pageSize: number) => [...trayKeys.all(role), "page", page, pageSize] as const,
  unread: (role: TrayRole) => [...trayKeys.all(role), "unread"] as const,
  ofClass: (classroomId: string, studentId: string, page: number, pageSize: number) =>
    [...trayKeys.all("guardian"), "class", classroomId, studentId, page, pageSize] as const,
  kidClass: (classroomId: string, page: number, pageSize: number) =>
    [...trayKeys.all("student"), "class", classroomId, page, pageSize] as const,
  kidClassUnread: (classroomId: string) => [...trayKeys.all("student"), "class", classroomId, "unread"] as const,
  thread: (role: TrayRole, threadId: string) => [...trayKeys.all(role), "thread", threadId] as const,
  messages: (classroomId: string, page: number, pageSize: number) =>
    [...trayKeys.all("teacher"), "messages", classroomId, page, pageSize] as const,
};

// The kinds of notification that are messages, from a family or from the teacher.
const MESSAGE_EVENTS = ["message.sent", "teacher.message"] as const;

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

/** The notifications of one class and one kid, for the space of the class
 * in the parents' portal (HU-42), with their own unread count. Under the
 * guardian's tray key, so reading or deleting one refreshes both. */
export function useClassNotifications(
  classroomId: string | undefined,
  studentId: string | undefined,
  page: number,
  pageSize: number,
) {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    classroom_id: classroomId ?? "",
    student_id: studentId ?? "",
  });
  return useQuery({
    queryKey: trayKeys.ofClass(classroomId ?? "", studentId ?? "", page, pageSize),
    queryFn: () => apiFetch<NotificationPage>(`/notifications/me?${params.toString()}`, { background: true }),
    enabled: Boolean(classroomId && studentId),
    refetchInterval: INTERVALO_BANDEJA_MS,
    placeholderData: (previous) => previous,
    retry: false,
  });
}

/** The messages of one class for its teacher (HU-77): what the families
 * wrote and what the teacher sent, newest first. Under the teacher's tray
 * key, so reading one there refreshes this too. */
export function useClassMessages(classroomId: string, page: number, pageSize: number) {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize), classroom_id: classroomId });
  for (const event of MESSAGE_EVENTS) params.append("event", event);
  return useQuery({
    queryKey: trayKeys.messages(classroomId, page, pageSize),
    queryFn: () => apiFetch<NotificationPage>(`/notifications/me?${params.toString()}`, { background: true }),
    refetchInterval: INTERVALO_BANDEJA_MS,
    placeholderData: (previous) => previous,
  });
}

/** The kid's notifications of one of their classes (HU-57), under the
 * kid's tray key so reading or deleting one refreshes everything. */
export function useKidClassNotifications(classroomId: string, page: number, pageSize: number) {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize), classroom_id: classroomId });
  return useQuery({
    queryKey: trayKeys.kidClass(classroomId, page, pageSize),
    queryFn: () => apiFetch<NotificationPage>(`/notifications/me?${params.toString()}`, { background: true }),
    refetchInterval: INTERVALO_BANDEJA_MS,
    placeholderData: (previous) => previous,
  });
}

/** How many of one class are still unread, for the circle on the kid's
 * "Notificaciones" in the space of that class (HU-57). */
export function useKidClassUnread(classroomId: string) {
  return useQuery({
    queryKey: trayKeys.kidClassUnread(classroomId),
    queryFn: () =>
      apiFetch<NotificationPage>(
        `/notifications/me?page=1&page_size=1&classroom_id=${encodeURIComponent(classroomId)}`,
        {
          background: true,
        },
      ),
    select: (page) => page.unread_count,
    refetchInterval: INTERVALO_BANDEJA_MS,
  });
}

/** One conversation as this person sees it (HU-51): what they got and the
 * copies of what they sent, oldest first. */
export function useThread(role: TrayRole, threadId: string | null | undefined) {
  return useQuery({
    queryKey: trayKeys.thread(role, threadId ?? ""),
    queryFn: () =>
      apiFetch<NotificationItem[]>(`/notifications/me/threads/${encodeURIComponent(threadId ?? "")}`, {
        background: true,
      }),
    enabled: Boolean(threadId),
    retry: false,
  });
}

// The guardian's portal uses these names.
export const useBandejaNotificaciones = (page: number, pageSize: number) =>
  useNotificationTray("guardian", page, pageSize);
export const useNotificacionesSinLeer = () => useUnreadNotifications("guardian");
export const useMarcarNotificacionLeida = () => useMarkNotificationRead("guardian");
export const useEliminarNotificacion = () => useDeleteNotification("guardian");
export const useEliminarNotificaciones = () => useDeleteNotifications("guardian");
