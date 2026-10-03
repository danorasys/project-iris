// Notification hooks for the teacher and the guardian. They ask
// notification-service's tray (GET /notifications/me, through api-gateway)
// from time to time, same access pattern TanStack Query already uses for
// the rest of the app's data. There is no live push channel, every use case
// here is a human checking their own notifications when it's convenient for
// them, not something that needs to arrive instantly.

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NotificationItem, NotificationPage, EnrollmentRequest } from "@iris/shared-types";
import { apiFetch } from "@/shared/api/httpClient";
import { useAuth } from "@/shared/auth/AuthContext";
import { classroomKeys, useTeacherClassrooms } from "./useClassroomsApi";

const INTERVALO_POLLING_SOLICITUDES_MS = 30_000;
const INTERVALO_POLLING_NOTIFICACIONES_MS = 20_000;
// A guardian's tray changes little, once a minute is plenty.
const INTERVALO_BANDEJA_TUTOR_MS = 60_000;

export interface ToastNotificacion {
  id: string;
  mensaje: string;
}

interface ResultadoNotificacionesDocente {
  /** Total pending requests across all of the teacher's classrooms. */
  totalPendientes: number;
  toasts: ToastNotificacion[];
  descartarToast: (id: string) => void;
}

export function useTeacherNotifications(): ResultadoNotificacionesDocente {
  const { session } = useAuth();
  const esDocente = session?.role === "teacher";
  const queryClient = useQueryClient();
  const [toasts, setToasts] = useState<ToastNotificacion[]>([]);
  // Tracks which notification ids already became a toast in this session,
  // so a notification we haven't marked as read yet (a slow network, a
  // failed PATCH) doesn't turn into a duplicate toast on the next poll.
  const yaMostradasRef = useRef<Set<string>>(new Set());

  const classroomsQuery = useTeacherClassrooms({ enabled: esDocente });
  const classroomIds = useMemo(() => classroomsQuery.data?.map((classroom) => classroom.id) ?? [], [classroomsQuery.data]);

  const solicitudesQueries = useQueries({
    queries: classroomIds.map((classroomId) => ({
      queryKey: classroomKeys.requests(classroomId),
      queryFn: () => apiFetch<EnrollmentRequest[]>(`/classrooms/${classroomId}/requests`),
      enabled: esDocente,
      refetchInterval: INTERVALO_POLLING_SOLICITUDES_MS,
    })),
  });

  const totalPendientes = solicitudesQueries.reduce((total, query) => total + (query.data?.length ?? 0), 0);

  const notificacionesQuery = useQuery({
    queryKey: ["notifications", "mine"],
    // The newest ones are enough to find the new requests.
    queryFn: () => apiFetch<NotificationPage>("/notifications/me?page_size=50"),
    enabled: esDocente,
    refetchInterval: INTERVALO_POLLING_NOTIFICACIONES_MS,
  });

  useEffect(() => {
    const notificaciones = notificacionesQuery.data?.items;
    if (!notificaciones) return;

    const nuevas = notificaciones.filter(
      (n): n is Extract<NotificationItem, { event: "request.created" }> =>
        n.event === "request.created" && !n.read && !yaMostradasRef.current.has(n.id)
    );
    if (nuevas.length === 0) return;

    for (const n of nuevas) yaMostradasRef.current.add(n.id);
    setToasts((actuales) => [
      ...actuales,
      ...nuevas.map((n) => ({ id: n.id, mensaje: `Nueva solicitud de ${n.student_name ?? "un estudiante"}` })),
    ]);

    const classroomIdsConNotificacionNueva = new Set(nuevas.map((n) => n.classroom_id));
    for (const classroomId of classroomIdsConNotificacionNueva) {
      void queryClient.invalidateQueries({ queryKey: classroomKeys.requests(classroomId) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificacionesQuery.data]);

  const descartarToast = (id: string) => {
    setToasts((actuales) => actuales.filter((toast) => toast.id !== id));
    void apiFetch(`/notifications/${id}/read`, { method: "PATCH" }).catch(() => {
      /* not critical, worst case it stays unread server-side and this device just won't re-toast it */
    });
  };

  return { totalPendientes, toasts, descartarToast };
}

const bandejaKeys = {
  all: ["notifications", "guardian"] as const,
  page: (page: number, pageSize: number) => [...bandejaKeys.all, "page", page, pageSize] as const,
};

/** One page of the guardian's tray. The server needs the portal's 2FA
 * access open, a closed one comes back as `acceso_portal_requerido`. */
export function useBandejaNotificaciones(page: number, pageSize: number) {
  return useQuery({
    queryKey: bandejaKeys.page(page, pageSize),
    queryFn: () => apiFetch<NotificationPage>(`/notifications/me?page=${page}&page_size=${pageSize}`),
    refetchInterval: INTERVALO_BANDEJA_TUTOR_MS,
    // Moving to the next page keeps the current one on screen meanwhile.
    placeholderData: (previous) => previous,
  });
}

/** How many unread notifications the guardian has, for the number next to
 * "Notificaciones" in the portal. Only the count is asked, no items. */
export function useNotificacionesSinLeer() {
  return useQuery({
    queryKey: [...bandejaKeys.all, "unread"],
    queryFn: () => apiFetch<NotificationPage>("/notifications/me?page=1&page_size=1"),
    select: (page) => page.unread_count,
    refetchInterval: INTERVALO_BANDEJA_TUTOR_MS,
    // Without the portal open there is nothing to count, no need to retry.
    retry: false,
  });
}

export function useMarcarNotificacionLeida() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<NotificationItem>(`/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bandejaKeys.all }),
  });
}

export function useEliminarNotificacion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/notifications/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bandejaKeys.all }),
  });
}
