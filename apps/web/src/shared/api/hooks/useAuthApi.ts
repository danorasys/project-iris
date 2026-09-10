import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  DocumentType,
  GuardianRegistrationRequest,
  RelationshipType,
  StudentProfile,
  StudentProfileLoginRequest,
  LoginRequest,
  TeacherRegistrationRequest,
  TokensAuth,
  UpdateStudentAvatarRequest,
} from "@iris/shared-types";
import { apiFetch } from "@/shared/api/httpClient";

/**
 * TanStack Query hooks for the registration/login flows of the auth screens
 * (`/login/*`). Every registration/login mutation uses `auth: false`.
 * They're public endpoints with no session to attach yet, and `apiFetch`
 * already knows not to send `Authorization` in that case.
 */

export function useRegistrarTutor() {
  return useMutation({
    mutationFn: (body: GuardianRegistrationRequest) =>
      apiFetch<TokensAuth>("/identity/auth/guardians", { method: "POST", body, auth: false }),
  });
}

export function useRegistrarDocente() {
  return useMutation({
    mutationFn: (body: TeacherRegistrationRequest) =>
      apiFetch<TokensAuth>("/identity/auth/teachers", { method: "POST", body, auth: false }),
  });
}

export function useLogin() {
  return useMutation({
    mutationFn: (body: LoginRequest) =>
      apiFetch<TokensAuth>("/identity/auth/login", { method: "POST", body, auth: false }),
  });
}

export function useLoginPerfilEstudiante() {
  return useMutation({
    mutationFn: (body: StudentProfileLoginRequest) =>
      apiFetch<TokensAuth>("/identity/auth/students/profile", { method: "POST", body, auth: false }),
  });
}

/** Student profiles for the authenticated tutor. Only enabled once there's
 * an active tutor session (the student's "Ya soy Mirador" branch). */
export function useEstudiantesDeTutor(habilitado: boolean) {
  return useQuery({
    queryKey: ["guardian", "students"],
    queryFn: () => apiFetch<StudentProfile[]>("/identity/guardians/me/students"),
    enabled: habilitado,
  });
}

/** Registration catalogs, fetched from the API instead of hardcoded, so the
 * options shown match whatever identity-service currently has seeded.
 * `staleTime: Infinity`, these are fixed catalogs that don't change during
 * a session. */
export function useDocumentTypes() {
  return useQuery({
    queryKey: ["document-types"],
    queryFn: () => apiFetch<DocumentType[]>("/identity/catalogs/document-types", { auth: false }),
    staleTime: Infinity,
  });
}

export function useRelationshipTypes() {
  return useQuery({
    queryKey: ["relationship-types"],
    queryFn: () => apiFetch<RelationshipType[]>("/identity/catalogs/relationship-types", { auth: false }),
    staleTime: Infinity,
  });
}

/** The logged-in student picks their own avatar right after calibrating.
 * Authenticated as the student itself, no id in the payload, the backend
 * resolves it from the JWT. */
export function useActualizarMiAvatar() {
  return useMutation({
    mutationFn: (body: UpdateStudentAvatarRequest) =>
      apiFetch<StudentProfile>("/identity/students/me/avatar", { method: "PATCH", body }),
  });
}
