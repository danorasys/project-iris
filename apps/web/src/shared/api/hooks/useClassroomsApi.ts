// TanStack Query hooks for `classroom-service`, through the gateway under
// the `/classrooms` prefix. All remote state for classrooms, enrollments and
// requests lives here. Pages never call `apiFetch` directly or replicate
// caching/revalidation by hand.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Classroom,
  ClassroomArea,
  ClassroomColor,
  ClassroomWithStudents,
  EnrollmentRequest,
  FamilyClassroom,
  TeacherClassroom,
} from "@iris/shared-types";
import { apiFetch, apiUpload } from "@/shared/api/httpClient";

/** Centralized query keys, also reused by `useNotifications.ts` for the
 * per-classroom fallback polling. */
export const classroomKeys = {
  todas: ["aulas"] as const,
  mias: ["aulas", "mias"] as const,
  detail: (classroomId: string) => ["aulas", classroomId] as const,
  requests: (classroomId: string) => ["aulas", classroomId, "solicitudes"] as const,
  family: ["aulas", "familia"] as const,
};

// The list also brings each classroom's pending requests, so asking for it
// now and then keeps the portal's notice up to date with one request.
const TEACHER_CLASSROOMS_REFRESH_MS = 30_000;

/** `GET /classrooms`. Classrooms owned by the authenticated teacher, each
 * with how many join requests are waiting (`pending_requests`). */
export function useTeacherClassrooms(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: classroomKeys.todas,
    queryFn: () => apiFetch<TeacherClassroom[]>("/classrooms", { background: true }),
    enabled: options?.enabled,
    refetchInterval: TEACHER_CLASSROOMS_REFRESH_MS,
  });
}

/** `GET /classrooms/mine`. Classrooms where the student profile is accepted. */
export function useStudentClassrooms() {
  return useQuery({
    queryKey: classroomKeys.mias,
    queryFn: () => apiFetch<Classroom[]>("/classrooms/mine"),
  });
}

// A teacher's answer reaches the family as a notification too, so a slow
// refresh is enough here.
const FAMILY_CLASSROOMS_REFRESH_MS = 60_000;

/** `GET /classrooms/family`. The classes of the guardian's kids, the ones
 * they're in and the requests still waiting, newest first. Like the rest of
 * the parents' portal it needs the portal's 2FA access open; a closed one
 * comes back as `acceso_portal_requerido`. */
export function useFamilyClassrooms() {
  return useQuery({
    queryKey: classroomKeys.family,
    queryFn: () => apiFetch<FamilyClassroom[]>("/classrooms/family", { background: true }),
    refetchInterval: FAMILY_CLASSROOMS_REFRESH_MS,
    retry: false,
  });
}

/** `GET /classrooms/{classroom_id}`. Details plus enrolled students. */
export function useClassroomDetail(classroomId: string | undefined) {
  return useQuery({
    queryKey: classroomKeys.detail(classroomId ?? ""),
    queryFn: () => apiFetch<ClassroomWithStudents>(`/classrooms/${classroomId}`),
    enabled: Boolean(classroomId),
  });
}

interface CrearAulaBody {
  name: string;
  description: string;
  color: ClassroomColor;
  area: ClassroomArea;
  /** Required with area "other", null with any other area. */
  area_other: string | null;
  grade: number;
}

/** `POST /classrooms`. Creates a new classroom (teacher). */
export function useCreateClassroom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CrearAulaBody) => apiFetch<Classroom>("/classrooms", { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: classroomKeys.todas });
    },
  });
}

interface UpdateClassroomVariables {
  classroomId: string;
  body: Partial<CrearAulaBody>;
}

/** `PATCH /classrooms/{classroom_id}`. Edits name, description or color. */
export function useUpdateClassroom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ classroomId, body }: UpdateClassroomVariables) =>
      apiFetch<Classroom>(`/classrooms/${classroomId}`, { method: "PATCH", body }),
    onSuccess: (_aula, variables) => {
      void queryClient.invalidateQueries({ queryKey: classroomKeys.todas });
      void queryClient.invalidateQueries({ queryKey: classroomKeys.detail(variables.classroomId) });
    },
  });
}

interface UploadClassroomLogoVariables {
  classroomId: string;
  file: File;
}

/** `POST /classrooms/{classroom_id}/logo`. Uploads/replaces the classroom logo. */
export function useUploadClassroomLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ classroomId, file }: UploadClassroomLogoVariables) => {
      const formData = new FormData();
      formData.append("file", file);
      return apiUpload<Classroom>(`/classrooms/${classroomId}/logo`, formData);
    },
    onSuccess: (_aula, variables) => {
      void queryClient.invalidateQueries({ queryKey: classroomKeys.todas });
      void queryClient.invalidateQueries({ queryKey: classroomKeys.detail(variables.classroomId) });
    },
  });
}

/** `DELETE /classrooms/{classroom_id}/logo`. Back to the initials on its color. */
export function useRemoveClassroomLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (classroomId: string) => apiFetch<Classroom>(`/classrooms/${classroomId}/logo`, { method: "DELETE" }),
    onSuccess: (_aula, classroomId) => {
      void queryClient.invalidateQueries({ queryKey: classroomKeys.todas });
      void queryClient.invalidateQueries({ queryKey: classroomKeys.detail(classroomId) });
    },
  });
}

/** `DELETE /classrooms/{classroom_id}`. The classroom with its lessons and enrollments. */
export function useDeleteClassroom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (classroomId: string) => apiFetch<void>(`/classrooms/${classroomId}`, { method: "DELETE" }),
    onSuccess: (_nada, classroomId) => {
      queryClient.removeQueries({ queryKey: classroomKeys.detail(classroomId) });
      void queryClient.invalidateQueries({ queryKey: classroomKeys.todas });
    },
  });
}

interface RemoveStudentVariables {
  classroomId: string;
  enrollmentId: string;
}

/** `DELETE /classrooms/{classroom_id}/students/{enrollment_id}`. Their guardian is told. */
export function useRemoveStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ classroomId, enrollmentId }: RemoveStudentVariables) =>
      apiFetch<void>(`/classrooms/${classroomId}/students/${enrollmentId}`, { method: "DELETE" }),
    onSuccess: (_nada, variables) => {
      void queryClient.invalidateQueries({ queryKey: classroomKeys.detail(variables.classroomId) });
    },
  });
}

interface IngresarAulaResultado {
  enrollment_id: string;
  classroom_id: string;
  status: string;
}

/** `POST /classrooms/enroll`. The student profile tries to join with a code. */
export function useJoinClassroom() {
  return useMutation({
    mutationFn: (enrollment_code: string) =>
      apiFetch<IngresarAulaResultado>("/classrooms/enroll", { method: "POST", body: { enrollment_code } }),
  });
}

/** `GET /classrooms/{classroom_id}/requests`. The classroom's pending requests. */
export function useClassroomRequests(classroomId: string | undefined, options?: { refetchInterval?: number | false }) {
  return useQuery({
    queryKey: classroomKeys.requests(classroomId ?? ""),
    queryFn: () => apiFetch<EnrollmentRequest[]>(`/classrooms/${classroomId}/requests`),
    enabled: Boolean(classroomId),
    refetchInterval: options?.refetchInterval ?? false,
  });
}

interface ResolveRequestVariables {
  classroomId: string;
  enrollmentId: string;
  decision: "aceptar" | "rechazar";
}

/** `POST /classrooms/{classroom_id}/requests/{enrollment_id}/resolve` */
export function useResolveRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ classroomId, enrollmentId, decision }: ResolveRequestVariables) =>
      apiFetch<{ enrollment_id: string; status: string }>(
        `/classrooms/${classroomId}/requests/${enrollmentId}/resolve`,
        { method: "POST", body: { decision } },
      ),
    onSuccess: (_resultado, variables) => {
      void queryClient.invalidateQueries({ queryKey: classroomKeys.requests(variables.classroomId) });
      void queryClient.invalidateQueries({ queryKey: classroomKeys.detail(variables.classroomId) });
      // The pending count of the portal's notice goes down right away.
      void queryClient.invalidateQueries({ queryKey: classroomKeys.todas });
    },
  });
}
