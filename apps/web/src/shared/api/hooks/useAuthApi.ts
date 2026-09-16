import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Avatar,
  ChangePasswordRequest,
  ConfirmPasswordRequest,
  DocumentType,
  GuardianProfile,
  GuardianRegistrationRequest,
  RelationshipType,
  StudentProfile,
  StudentProfileLoginRequest,
  LoginRequest,
  SupportCondition,
  TeacherRegistrationRequest,
  TokensAuth,
  TotpSetupResponse,
  TotpVerifyRequest,
  UpdateGuardianProfileRequest,
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

export function useSupportConditions() {
  return useQuery({
    queryKey: ["support-conditions"],
    queryFn: () => apiFetch<SupportCondition[]>("/identity/catalogs/support-conditions", { auth: false }),
    staleTime: Infinity,
  });
}

export function useAvatars() {
  return useQuery({
    queryKey: ["avatars"],
    queryFn: () => apiFetch<Avatar[]>("/identity/catalogs/avatars", { auth: false }),
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

/** Generates a fresh TOTP secret + QR code for the authenticated guardian.
 * Doesn't enable 2FA by itself — see useVerificarTotp, which is what
 * actually turns it on once the app proves it can produce a valid code. */
export function useConfigurarTotp() {
  return useMutation({
    mutationFn: () => apiFetch<TotpSetupResponse>("/identity/guardians/me/2fa/setup", { method: "POST" }),
  });
}

export function useVerificarTotp() {
  return useMutation({
    mutationFn: (body: TotpVerifyRequest) =>
      apiFetch<void>("/identity/guardians/me/2fa/verify", { method: "POST", body }),
  });
}

/** Checks the guardian's password again right before letting them into the
 * parents' portal, in case their session was left open on a shared
 * computer. This does not issue new tokens, since the session is already
 * active — it only proves the person at the keyboard still knows the
 * password. */
export function useConfirmarMiPassword() {
  return useMutation({
    mutationFn: (body: ConfirmPasswordRequest) =>
      apiFetch<void>("/identity/guardians/me/confirm-password", { method: "POST", body }),
  });
}

/** The guardian's own profile, shown in "mi perfil" inside the parents'
 * portal. */
export function useMiPerfilTutor() {
  return useQuery({
    queryKey: ["guardian", "profile"],
    queryFn: () => apiFetch<GuardianProfile>("/identity/guardians/me"),
  });
}

export function useActualizarMiPerfilTutor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateGuardianProfileRequest) =>
      apiFetch<GuardianProfile>("/identity/guardians/me", { method: "PATCH", body }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["guardian", "profile"], updated);
    },
  });
}

/** There's no current-password field here — see the backend's
 * GuardianService.change_password for why that check already happened
 * earlier, when entering the portal. */
export function useCambiarMiPassword() {
  return useMutation({
    mutationFn: (body: ChangePasswordRequest) =>
      apiFetch<void>("/identity/guardians/me/password", { method: "POST", body }),
  });
}
