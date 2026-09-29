// API paths of the private images. The backend only returns file names, not
// URLs, because these images need the user's session (see useAuthImage).

/** `GET /classrooms/{classroom_id}/logo/{logo_file}`: the classroom's teacher
 * and its accepted students. */
export function classroomLogoPath(classroomId: string, logoFile: string): string {
  return `/classrooms/${encodeURIComponent(classroomId)}/logo/${encodeURIComponent(logoFile)}`;
}

/** `GET /content/lessons/{lesson_id}/images/{image_file}`: same access rule as the lesson. */
export function lessonImagePath(lessonId: string, imageFile: string): string {
  return `/content/lessons/${encodeURIComponent(lessonId)}/images/${encodeURIComponent(imageFile)}`;
}
