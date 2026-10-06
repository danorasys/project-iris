// TanStack Query hooks for `content-service`, under the gateway's `/content`
// prefix: the units of a classroom, their lessons and everything inside a
// lesson (pages, activity, extras). See ADR 0013.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Activity,
  ContentBlockInput,
  Extra,
  ExtraKind,
  Lesson,
  LessonDetail,
  Unit,
  UnitWithLessons,
} from "@iris/shared-types";
import { apiFetch, apiUpload } from "@/shared/api/httpClient";

export const lessonKeys = {
  units: (classroomId: string) => ["units", "classroom", classroomId] as const,
  byClassroom: (classroomId: string) => ["lessons", "classroom", classroomId] as const,
  detail: (lessonId: string) => ["lessons", lessonId] as const,
};

/** `GET /content/classrooms/{classroom_id}/units`: the units with their lessons. */
export function useClassroomUnits(classroomId: string | undefined) {
  return useQuery({
    queryKey: lessonKeys.units(classroomId ?? ""),
    queryFn: () => apiFetch<UnitWithLessons[]>(`/content/classrooms/${classroomId}/units`),
    enabled: Boolean(classroomId),
  });
}

/** `GET /content/classrooms/{classroom_id}/lessons`: every lesson, without units. */
export function useClassroomLessons(classroomId: string | undefined) {
  return useQuery({
    queryKey: lessonKeys.byClassroom(classroomId ?? ""),
    queryFn: () => apiFetch<Lesson[]>(`/content/classrooms/${classroomId}/lessons`),
    enabled: Boolean(classroomId),
  });
}

/** `GET /content/lessons/{lesson_id}` */
export function useLessonDetail(lessonId: string | undefined) {
  return useQuery({
    queryKey: lessonKeys.detail(lessonId ?? ""),
    queryFn: () => apiFetch<LessonDetail>(`/content/lessons/${lessonId}`),
    enabled: Boolean(lessonId),
  });
}

// After a change, the units list and the flat list of the classroom are refreshed.
function useRefreshClassroom() {
  const queryClient = useQueryClient();
  return (classroomId: string) => {
    void queryClient.invalidateQueries({ queryKey: lessonKeys.units(classroomId) });
    void queryClient.invalidateQueries({ queryKey: lessonKeys.byClassroom(classroomId) });
  };
}

// The saved lesson goes straight into the cache, so the editor shows what's
// missing to publish it without asking again.
function useStoreLesson() {
  const queryClient = useQueryClient();
  const refresh = useRefreshClassroom();
  return (lesson: LessonDetail) => {
    queryClient.setQueryData(lessonKeys.detail(lesson.id), lesson);
    refresh(lesson.classroom_id);
  };
}

// --- units ------------------------------------------------------------------------

export interface UnitBody {
  title: string;
  guiding_question: string;
}

/** `POST /content/classrooms/{classroom_id}/units` */
export function useCreateUnit(classroomId: string) {
  const refresh = useRefreshClassroom();
  return useMutation({
    mutationFn: (body: UnitBody) =>
      apiFetch<Unit>(`/content/classrooms/${classroomId}/units`, { method: "POST", body }),
    onSuccess: () => refresh(classroomId),
  });
}

/** `PATCH /content/units/{unit_id}` */
export function useUpdateUnit(classroomId: string) {
  const refresh = useRefreshClassroom();
  return useMutation({
    mutationFn: ({ unitId, body }: { unitId: string; body: Partial<UnitBody> }) =>
      apiFetch<Unit>(`/content/units/${unitId}`, { method: "PATCH", body }),
    onSuccess: () => refresh(classroomId),
  });
}

/** `PUT /content/classrooms/{classroom_id}/units/order`: every unit, once. */
export function useReorderUnits(classroomId: string) {
  const refresh = useRefreshClassroom();
  return useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch<Unit[]>(`/content/classrooms/${classroomId}/units/order`, { method: "PUT", body: { ids } }),
    onSuccess: () => refresh(classroomId),
  });
}

/** `DELETE /content/units/{unit_id}`. Only an empty unit (409 otherwise). */
export function useDeleteUnit(classroomId: string) {
  const refresh = useRefreshClassroom();
  return useMutation({
    mutationFn: (unitId: string) => apiFetch<void>(`/content/units/${unitId}`, { method: "DELETE" }),
    onSuccess: () => refresh(classroomId),
  });
}

// --- lessons ----------------------------------------------------------------------

export interface NewLessonBody {
  title: string;
  purpose: string;
  learning_goal: string;
}

/** `POST /content/units/{unit_id}/lessons`. Created as a draft at the end of its unit. */
export function useCreateLesson() {
  const store = useStoreLesson();
  return useMutation({
    mutationFn: ({ unitId, body }: { unitId: string; body: NewLessonBody }) =>
      apiFetch<LessonDetail>(`/content/units/${unitId}/lessons`, { method: "POST", body }),
    onSuccess: store,
  });
}

/** `PUT /content/units/{unit_id}/lessons/order`: every lesson of the unit, once. */
export function useReorderLessons(classroomId: string) {
  const refresh = useRefreshClassroom();
  return useMutation({
    mutationFn: ({ unitId, ids }: { unitId: string; ids: string[] }) =>
      apiFetch<Lesson[]>(`/content/units/${unitId}/lessons/order`, { method: "PUT", body: { ids } }),
    onSuccess: () => refresh(classroomId),
  });
}

export interface LessonChanges {
  unit_id?: string;
  title?: string;
  purpose?: string;
  learning_goal?: string;
  /** The whole set of pages, it replaces the saved one. */
  blocks?: ContentBlockInput[];
}

/** `PATCH /content/lessons/{lesson_id}`. A published lesson only saves complete. */
export function useUpdateLesson() {
  const store = useStoreLesson();
  return useMutation({
    mutationFn: ({ lessonId, body }: { lessonId: string; body: LessonChanges }) =>
      apiFetch<LessonDetail>(`/content/lessons/${lessonId}`, { method: "PATCH", body }),
    onSuccess: store,
  });
}

/** `PUT /content/lessons/{lesson_id}/activity`: the questions, replaced whole. */
export function useSetActivity() {
  const store = useStoreLesson();
  return useMutation({
    mutationFn: ({ lessonId, activity }: { lessonId: string; activity: Activity }) =>
      apiFetch<LessonDetail>(`/content/lessons/${lessonId}/activity`, { method: "PUT", body: activity }),
    onSuccess: store,
  });
}

/** `POST /content/lessons/{lesson_id}/publish`. 422 `leccion_incompleta` lists what's missing. */
export function usePublishLesson() {
  const store = useStoreLesson();
  return useMutation({
    mutationFn: (lessonId: string) =>
      apiFetch<LessonDetail>(`/content/lessons/${lessonId}/publish`, { method: "POST" }),
    onSuccess: store,
  });
}

/** `DELETE /content/lessons/{lesson_id}`, with everything inside it. */
export function useDeleteLesson(classroomId: string) {
  const queryClient = useQueryClient();
  const refresh = useRefreshClassroom();
  return useMutation({
    mutationFn: (lessonId: string) => apiFetch<void>(`/content/lessons/${lessonId}`, { method: "DELETE" }),
    onSuccess: (_, lessonId) => {
      queryClient.removeQueries({ queryKey: lessonKeys.detail(lessonId) });
      refresh(classroomId);
    },
  });
}

// --- extras ------------------------------------------------------------------------

// An extra changed: the lesson in the cache gets the new version of it.
function useStoreExtra(lessonId: string) {
  const queryClient = useQueryClient();
  return (extra: Extra | null, removedId?: string) => {
    queryClient.setQueryData<LessonDetail>(lessonKeys.detail(lessonId), (lesson) => {
      if (!lesson) return lesson;
      const others = lesson.extras.filter((item) => item.id !== (extra?.id ?? removedId));
      const extras = extra ? [...others, extra] : others;
      return { ...lesson, extras: extras.sort((a, b) => a.order_index - b.order_index) };
    });
  };
}

export interface NewExtraBody {
  kind: ExtraKind;
  title: string;
  for_everyone: boolean;
  student_ids: string[];
}

/** `POST /content/lessons/{lesson_id}/extras` */
export function useAddExtra(lessonId: string) {
  const store = useStoreExtra(lessonId);
  return useMutation({
    mutationFn: (body: NewExtraBody) =>
      apiFetch<Extra>(`/content/lessons/${lessonId}/extras`, { method: "POST", body }),
    onSuccess: (extra) => store(extra),
  });
}

export interface ExtraChanges {
  title?: string;
  for_everyone?: boolean;
  student_ids?: string[];
  blocks?: ContentBlockInput[];
}

/** `PATCH /content/lessons/{lesson_id}/extras/{extra_id}` */
export function useUpdateExtra(lessonId: string) {
  const store = useStoreExtra(lessonId);
  return useMutation({
    mutationFn: ({ extraId, body }: { extraId: string; body: ExtraChanges }) =>
      apiFetch<Extra>(`/content/lessons/${lessonId}/extras/${extraId}`, { method: "PATCH", body }),
    onSuccess: (extra) => store(extra),
  });
}

/** `PUT /content/lessons/{lesson_id}/extras/{extra_id}/activity` */
export function useSetExtraActivity(lessonId: string) {
  const store = useStoreExtra(lessonId);
  return useMutation({
    mutationFn: ({ extraId, activity }: { extraId: string; activity: Activity }) =>
      apiFetch<Extra>(`/content/lessons/${lessonId}/extras/${extraId}/activity`, { method: "PUT", body: activity }),
    onSuccess: (extra) => store(extra),
  });
}

/** `DELETE /content/lessons/{lesson_id}/extras/{extra_id}` */
export function useDeleteExtra(lessonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (extraId: string) =>
      apiFetch<void>(`/content/lessons/${lessonId}/extras/${extraId}`, { method: "DELETE" }),
    // The others moved up, so the lesson is read again.
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: lessonKeys.detail(lessonId) }),
  });
}

// --- images ------------------------------------------------------------------------

/** `POST /content/lessons/{lesson_id}/images`. Returns the file name for an image block. */
export function useUploadLessonImage() {
  return useMutation({
    mutationFn: ({ lessonId, file }: { lessonId: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      return apiUpload<{ image_file: string }>(`/content/lessons/${lessonId}/images`, formData);
    },
  });
}
