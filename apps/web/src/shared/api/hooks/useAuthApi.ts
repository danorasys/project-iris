import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Avatar,
  ChangePasswordRequest,
  DocumentType,
  GuardianProfile,
  GuardianRegistrationRequest,
  RelationshipType,
  StudentDetail,
  StudentProfile,
  StudentProfileLoginRequest,
  LoginRequest,
  PortalChallengeResponse,
  SupportCondition,
  TeacherRegistrationRequest,
  TokensAuth,
  TotpSetupResponse,
  TotpVerifyRequest,
  UpdateGuardianProfileRequest,
  UpdateStudentRequest,
  ChangeStudentPinRequest,
  CheckStudentPinRequest,
} from "@iris/shared-types";
import { apiFetch } from "@/shared/api/httpClient";

/** Hooks for registering and signing in (`/login/*`). Those mutations use
 * `auth: false`: there's no session yet to send. */

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

/** `POST /guardians/me/students` (HU-50): a new kid under the same
 * guardian, with only their own data. Needs the portal's 2FA access. */
export function useAddStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAdditionalStudentBody) =>
      apiFetch<StudentProfile>("/identity/guardians/me/students", { method: "POST", body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["guardian", "students"] }),
  });
}

/** What a new kid needs: the same fields as the first one of the registration. */
export interface CreateAdditionalStudentBody {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  avatar_id: number;
  pin: string;
  support_condition_ids: number[];
  support_condition_other: string | null;
  additional_support_need: string | null;
}

/** `DELETE /guardians/me` (HU-91): the guardian, their kids and their
 * consents, everywhere in IRIS. Asks for the password again. */
export function useDeleteGuardianAccount() {
  return useMutation({
    mutationFn: (password: string) =>
      apiFetch<void>("/identity/guardians/me", { method: "DELETE", body: { password } }),
  });
}

/** All the data of one kid. Unlike the list, the server only answers this
 * one with the portal's 2FA access open. */
export function useEstudianteDeTutor(studentId: string) {
  return useQuery({
    queryKey: ["guardian", "students", studentId],
    queryFn: () => apiFetch<StudentDetail>(`/identity/guardians/me/students/${encodeURIComponent(studentId)}`),
  });
}

export function useActualizarEstudianteDeTutor(studentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateStudentRequest) =>
      apiFetch<StudentDetail>(`/identity/guardians/me/students/${encodeURIComponent(studentId)}`, {
        method: "PATCH",
        body,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["guardian", "students", studentId], updated);
      // The list shows the name and the age, so it's asked again.
      void queryClient.invalidateQueries({ queryKey: ["guardian", "students"], exact: true });
    },
  });
}

/** Asks if that is the kid's current PIN. It resolves if it is, and fails
 * with `pin_actual_incorrecto` if not. */
export function useComprobarPinDeEstudiante(studentId: string) {
  return useMutation({
    // The PIN is not kept in memory once the request is done.
    gcTime: 0,
    mutationFn: (body: CheckStudentPinRequest) =>
      apiFetch<void>(`/identity/guardians/me/students/${encodeURIComponent(studentId)}/pin/check`, {
        method: "POST",
        body,
      }),
  });
}

export function useCambiarPinDeEstudiante(studentId: string) {
  return useMutation({
    gcTime: 0,
    mutationFn: (body: ChangeStudentPinRequest) =>
      apiFetch<void>(`/identity/guardians/me/students/${encodeURIComponent(studentId)}/pin`, {
        method: "PUT",
        body,
      }),
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

/** Whose 2FA it is: the guardian's opens the parents' portal, the teacher's
 * opens their panel. Same screens, different routes. */
export type TwoFactorAccount = "guardian" | "teacher";

const TWO_FACTOR_BASE: Record<TwoFactorAccount, string> = {
  guardian: "/identity/guardians/me/2fa",
  teacher: "/identity/teachers/me/2fa",
};

/** Generates a fresh TOTP secret + QR code for the signed-in account.
 * Doesn't enable 2FA by itself — see useVerificarTotp, which is what
 * actually turns it on once the app proves it can produce a valid code. */
export function useConfigurarTotp(account: TwoFactorAccount = "guardian") {
  return useMutation({
    mutationFn: () => apiFetch<TotpSetupResponse>(`${TWO_FACTOR_BASE[account]}/setup`, { method: "POST" }),
  });
}

/** For a teacher the answer is a new access token, the one of a session
 * that already passed the code. A guardian gets nothing back. */
export function useVerificarTotp(account: TwoFactorAccount = "guardian") {
  return useMutation({
    mutationFn: (body: TotpVerifyRequest) =>
      apiFetch<TokensAuth | undefined>(`${TWO_FACTOR_BASE[account]}/verify`, { method: "POST", body }),
  });
}

/** Checks a fresh 2FA code right before letting the guardian into the
 * parents' portal, in case their session was left open on a shared
 * computer. A good code makes the server open the portal for a while. */
export function useConfirmarAccesoPortal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TotpVerifyRequest) =>
      apiFetch<PortalChallengeResponse>("/identity/guardians/me/2fa/challenge", { method: "POST", body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["guardian", "portal-access"] }),
  });
}

/** Closes every session of this account, the current one included. */
export function useCerrarTodasMisSesiones() {
  return useMutation({
    mutationFn: () => apiFetch<void>("/identity/auth/logout-all", { method: "POST" }),
  });
}

/** Asks the server if the portal is open for this guardian right now. It
 * answers with an error (403) when the 2FA code is still needed. */
export function useAccesoPortal() {
  return useQuery({
    queryKey: ["guardian", "portal-access"],
    // The server answers 204 with no body, and a query can't return undefined,
    // so it returns true once the request went through.
    queryFn: async () => {
      await apiFetch<void>("/identity/guardians/me/portal-access");
      return true;
    },
    retry: false,
    gcTime: 0,
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

/** Asks for the current password and a fresh 2FA code together, see
 * GuardianService.change_password in identity-service. */
export function useCambiarMiPassword() {
  return useMutation({
    mutationFn: (body: ChangePasswordRequest) =>
      apiFetch<void>("/identity/guardians/me/password", { method: "POST", body }),
  });
}
