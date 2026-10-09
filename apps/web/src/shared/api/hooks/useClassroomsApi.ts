// TanStack Query hooks for `classroom-service`, through the gateway under
// the `/classrooms` prefix. All remote state for classrooms, enrollments and
// requests lives here. Pages never call `apiFetch` directly or replicate
// caching/revalidation by hand.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Classroom,
  ClassroomArea,
  ClassroomColor,
  ClassroomPreview,
  ClassStatistics,
  ClassroomWithStudents,
  EnrollmentRequest,
  FamilyClassroom,
  FamilyClassroomDetail,
  LessonProgress,
  MessageRecipient,
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
  familyClass: (enrollmentId: string) => ["aulas", "familia", enrollmentId] as const,
  familyProgress: (enrollmentId: string) => ["aulas", "familia", enrollmentId, "progreso"] as const,
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

/** `GET /classrooms/family`. The classes of the guardian's kids and every
 * request with how it went (pending, accepted, rejected), newest first. Like
 * the rest of the parents' portal it needs the portal's 2FA access open; a
 * closed one comes back as `acceso_portal_requerido`. */
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

// ---------------------------------------------------------------------------
// The kid's classes from the parents' portal (EP-07). Only the guardian types
// a class code; the kid never does (ADR 0016).
// ---------------------------------------------------------------------------

/** `POST /classrooms/family/lookup`. The class behind a code and its
 * teacher, before asking to join (HU-40). A POST so the code stays out of
 * URLs. 404 `codigo_ingreso_invalido` when no class has it. */
export function useClassroomLookup() {
  return useMutation({
    mutationFn: (enrollment_code: string) =>
      apiFetch<ClassroomPreview>("/classrooms/family/lookup", { method: "POST", body: { enrollment_code } }),
  });
}

interface RequestEnrollmentVariables {
  studentId: string;
  enrollmentCode: string;
}

/** `POST /classrooms/family/requests`. Asks the teacher to let the kid in.
 * 409 `ya_inscrito_o_pendiente` if there's already one waiting or accepted. */
export function useRequestEnrollment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ studentId, enrollmentCode }: RequestEnrollmentVariables) =>
      apiFetch<{ enrollment_id: string; classroom_id: string; status: string }>("/classrooms/family/requests", {
        method: "POST",
        body: { student_id: studentId, enrollment_code: enrollmentCode },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: classroomKeys.family }),
  });
}

/** `GET /classrooms/family/{enrollment_id}`. The space of a class the kid
 * is in, with its teacher's profile (HU-42, HU-97). */
export function useFamilyClassroom(enrollmentId: string | null) {
  return useQuery({
    queryKey: classroomKeys.familyClass(enrollmentId ?? ""),
    queryFn: () => apiFetch<FamilyClassroomDetail>(`/classrooms/family/${enrollmentId}`),
    enabled: Boolean(enrollmentId),
    retry: false,
  });
}

/** `GET /classrooms/family/{enrollment_id}/progress`. How far the kid got
 * in each lesson of the class, regular and extra, and every try at the
 * activities (HU-46, HU-47). */
export function useFamilyProgress(enrollmentId: string | null) {
  return useQuery({
    queryKey: classroomKeys.familyProgress(enrollmentId ?? ""),
    queryFn: () => apiFetch<LessonProgress[]>(`/classrooms/family/${enrollmentId}/progress`),
    enabled: Boolean(enrollmentId),
    retry: false,
  });
}

/** `DELETE /classrooms/family/{enrollment_id}`. Takes the kid out of the
 * class (HU-49), cancels a request still waiting or clears a rejected one. */
export function useLeaveClassroom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enrollmentId: string) => apiFetch<void>(`/classrooms/family/${enrollmentId}`, { method: "DELETE" }),
    onSuccess: (_nothing, enrollmentId) => {
      queryClient.removeQueries({ queryKey: classroomKeys.familyClass(enrollmentId) });
      void queryClient.invalidateQueries({ queryKey: classroomKeys.family });
    },
  });
}

interface TeacherMessageVariables {
  enrollmentId: string;
  subject: string;
  body: string;
  /** To answer inside a conversation (HU-51). */
  threadId?: string | null;
}

/** `POST /classrooms/family/{enrollment_id}/messages`. A message to the
 * teacher of the class, kept in their tray (HU-48). */
export function useSendTeacherMessage() {
  return useMutation({
    mutationFn: ({ enrollmentId, subject, body, threadId }: TeacherMessageVariables) =>
      apiFetch<void>(`/classrooms/family/${enrollmentId}/messages`, {
        method: "POST",
        body: { subject, body, thread_id: threadId ?? null },
      }),
  });
}

interface FamilyMessageVariables {
  classroomId: string;
  enrollmentId: string;
  recipient: MessageRecipient;
  subject: string;
  body: string;
  /** To answer inside a conversation (HU-51). */
  threadId?: string | null;
}

/** `POST /classrooms/{id}/students/{enrollment_id}/messages` (HU-77): the
 * teacher writes to a kid of the class or to their guardian. It reaches
 * their tray, and a copy the teacher's, through notification-service: a
 * moment later, so the teacher's tray is asked again after a little. */
export function useSendFamilyMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ classroomId, enrollmentId, recipient, subject, body, threadId }: FamilyMessageVariables) =>
      apiFetch<void>(`/classrooms/${classroomId}/students/${enrollmentId}/messages`, {
        method: "POST",
        body: { recipient, subject, body, thread_id: threadId ?? null },
      }),
    onSuccess: () => {
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: ["notifications", "teacher"] }), 1_000);
    },
  });
}

/** `GET /classrooms/{id}/statistics` (HU-86, HU-87): how each kid of the
 * class is doing in every published lesson, and the totals. */
export function useClassStatistics(classroomId: string) {
  return useQuery({
    queryKey: [...classroomKeys.detail(classroomId), "statistics"] as const,
    queryFn: () => apiFetch<ClassStatistics>(`/classrooms/${classroomId}/statistics`),
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
