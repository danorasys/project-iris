// Where each image comes from. Every image goes through the API gateway, the
// storage is never reached directly.

import { API_BASE_URL } from "./httpClient";

/** Full URL of an avatar. Avatars are public (the registration form shows
 * them before an account exists), so a plain <img src> works. */
export function avatarImageUrl(avatarId: number): string {
  return `${API_BASE_URL}/identity/catalogs/avatars/${encodeURIComponent(avatarId)}/image`;
}

// The two below are private: the backend only returns file names and these
// paths are fetched with the user's session (see useAuthImage).

/** `GET /classrooms/{classroom_id}/logo/{logo_file}`: the classroom's teacher
 * and its accepted students. */
export function classroomLogoPath(classroomId: string, logoFile: string): string {
  return `/classrooms/${encodeURIComponent(classroomId)}/logo/${encodeURIComponent(logoFile)}`;
}

/** `GET /content/lessons/{lesson_id}/images/{image_file}`: same access rule as the lesson. */
export function lessonImagePath(lessonId: string, imageFile: string): string {
  return `/content/lessons/${encodeURIComponent(lessonId)}/images/${encodeURIComponent(imageFile)}`;
}
