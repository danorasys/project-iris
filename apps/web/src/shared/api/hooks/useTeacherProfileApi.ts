// Hooks for the teacher's profile (about me, studies and experience).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ChangePasswordRequest,
  TeacherAccount,
  TeacherProfile,
  UpdateTeacherAccountRequest,
} from "@iris/shared-types";
import { apiFetch } from "@/shared/api/httpClient";

const profileKey = ["teacher-profile", "me"] as const;

export function useMiPerfilDocente() {
  return useQuery({
    queryKey: profileKey,
    queryFn: () => apiFetch<TeacherProfile>("/identity/teachers/me/profile"),
  });
}

/** Saves the whole profile, what the server answers becomes the cached one.
 * Like the personal data, it goes with the truthful declaration, and the
 * server records which parts changed. */
export function useGuardarMiPerfilDocente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profile: TeacherProfile) =>
      apiFetch<TeacherProfile>("/identity/teachers/me/profile", {
        method: "PUT",
        body: { ...profile, truthful_declaration: true },
      }),
    onSuccess: (saved) => queryClient.setQueryData(profileKey, saved),
  });
}

const accountKey = ["teacher-account", "me"] as const;

/** `GET /teachers/me`: the teacher's own account (name, document, contact,
 * institution), for the sidebar and Mi perfil. */
export function useMyTeacherAccount() {
  return useQuery({
    queryKey: accountKey,
    queryFn: () => apiFetch<TeacherAccount>("/identity/teachers/me"),
  });
}

/** `PATCH /teachers/me` (HU-71). What the server saved becomes the cached
 * account, so the sidebar shows the new name right away. */
export function useUpdateMyTeacherAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateTeacherAccountRequest) =>
      apiFetch<TeacherAccount>("/identity/teachers/me", { method: "PATCH", body }),
    onSuccess: (saved) => queryClient.setQueryData(accountKey, saved),
  });
}

/** `DELETE /teachers/me` (HU-92): the teacher's personal data goes, their
 * classes stay for their kids. Asks for the password again. */
export function useDeleteTeacherAccount() {
  return useMutation({
    mutationFn: (password: string) => apiFetch<void>("/identity/teachers/me", { method: "DELETE", body: { password } }),
  });
}

/** `POST /teachers/me/password` (HU-72): the current password and a fresh
 * 2FA code together. The server closes every session after it. */
export function useChangeMyTeacherPassword() {
  return useMutation({
    mutationFn: (body: ChangePasswordRequest) =>
      apiFetch<void>("/identity/teachers/me/password", { method: "POST", body }),
  });
}
