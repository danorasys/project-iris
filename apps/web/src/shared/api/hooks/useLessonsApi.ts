// TanStack Query hooks for `content-service`, under the gateway's `/content`
// prefix: the units of a classroom, their lessons and everything inside a
// lesson (pages, activity, extras). See ADR 0013.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Activity,
  AnswerCheck,
  AttemptResult,
  ClassroomContentSummary,
  ContentBlockInput,
  Extra,
  ExtraKind,
  Lesson,
  LessonDetail,
  LessonProgress,
  PageProgress,
  PlayLesson,
  Unit,
  UnitWithLessons,
} from "@iris/shared-types";
import { apiFetch, apiUpload } from "@/shared/api/httpClient";

export const lessonKeys = {
  summary: ["content", "summary"] as const,
  units: (classroomId: string) => ["units", "classroom", classroomId] as const,
  detail: (lessonId: string) => ["lessons", lessonId] as const,
  play: (lessonId: string) => ["lessons", lessonId, "play"] as const,
  // The kid's own progress in each class (notes on their list of lessons).
  myProgress: (classroomId: string) => ["progress", "me", classroomId] as const,
  myProgressAll: ["progress", "me"] as const,
};

/** `GET /content/teachers/me/content-summary`: units and lessons (published
 * and drafts) of each classroom of the teacher, for the Inicio. */
export function useContentSummary() {
  return useQuery({
    queryKey: lessonKeys.summary,
    queryFn: () => apiFetch<ClassroomContentSummary[]>("/content/teachers/me/content-summary"),
  });
}

/** `GET /content/classrooms/{classroom_id}/units`: the units with their lessons. */
export function useClassroomUnits(classroomId: string | undefined) {
  return useQuery({
    queryKey: lessonKeys.units(classroomId ?? ""),
    queryFn: () => apiFetch<UnitWithLessons[]>(`/content/classrooms/${classroomId}/units`),
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

// --- a kid playing a lesson (HU-46, HU-47) ---------------------------------------

/** `GET /content/lessons/{id}/play`: the pages, the questions without their
 * answers, the extras for this kid and how far they already got. */
export function useLessonPlay(lessonId: string | undefined) {
  return useQuery({
    queryKey: lessonKeys.play(lessonId ?? ""),
    queryFn: () => apiFetch<PlayLesson>(`/content/lessons/${lessonId}/play`),
    enabled: Boolean(lessonId),
    // Fresh every time it opens: where the kid left it may have changed.
    gcTime: 0,
  });
}

interface ReachPageVariables {
  lessonId: string;
  /** From 1. */
  page: number;
  extraId?: string | null;
}

/** `PUT /content/lessons/{id}/progress`: the kid is on this page, the one
 * they come back to. Their progress (the furthest page) never goes back. */
export function useReachPage() {
  return useMutation({
    mutationFn: ({ lessonId, page, extraId }: ReachPageVariables) =>
      apiFetch<PageProgress>(`/content/lessons/${lessonId}/progress`, {
        method: "PUT",
        body: { page, extra_id: extraId ?? null },
      }),
  });
}

interface CheckAnswerVariables {
  lessonId: string;
  extraId?: string | null;
  questionId: string;
  optionId: string;
}

/** `POST /content/lessons/{id}/answer-checks`: whether one answer is right,
 * to show it right away (HU-63). Keeps nothing on the server. */
export function useCheckAnswer() {
  return useMutation({
    mutationFn: ({ lessonId, extraId, questionId, optionId }: CheckAnswerVariables) =>
      apiFetch<AnswerCheck>(`/content/lessons/${lessonId}/answer-checks`, {
        method: "POST",
        body: { extra_id: extraId ?? null, question_id: questionId, option_id: optionId },
      }),
  });
}

/** `GET /content/classrooms/{id}/progress`: the kid's own progress in one
 * of their classes, the same their family sees. */
export function useMyClassProgress(classroomId: string | undefined) {
  return useQuery({
    queryKey: lessonKeys.myProgress(classroomId ?? ""),
    queryFn: () => apiFetch<LessonProgress[]>(`/content/classrooms/${classroomId}/progress`),
    enabled: Boolean(classroomId),
  });
}

interface SubmitAttemptVariables {
  lessonId: string;
  extraId?: string | null;
  answers: { question_id: string; option_id: string }[];
}

/** `POST /content/lessons/{id}/attempts`: the server grades the try and
 * keeps it. 409 `actividad_cambio` if the teacher changed the activity. */
export function useSubmitAttempt() {
  return useMutation({
    mutationFn: ({ lessonId, extraId, answers }: SubmitAttemptVariables) =>
      apiFetch<AttemptResult>(`/content/lessons/${lessonId}/attempts`, {
        method: "POST",
        body: { extra_id: extraId ?? null, answers },
      }),
  });
}

// After a change, the units list of the classroom and the counts of the
// Inicio are refreshed.
function useRefreshClassroom() {
  const queryClient = useQueryClient();
  return (classroomId: string) => {
    void queryClient.invalidateQueries({ queryKey: lessonKeys.units(classroomId) });
    void queryClient.invalidateQueries({ queryKey: lessonKeys.summary });
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
