// TanStack Query hooks for `content-service`. One route note, the gateway
// prefix is `/content`, but the actual resource path doesn't carry
// "content" in it. We just follow the contract as it is.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ContentBlock, LessonStatus, Lesson, LessonDetail } from "@iris/shared-types";
import { apiFetch, apiUpload } from "@/shared/api/httpClient";
import { classroomKeys } from "./useClassroomsApi";

export const lessonKeys = {
  byClassroom: (classroomId: string) => ["lessons", "classroom", classroomId] as const,
  detail: (lessonId: string) => ["lessons", lessonId] as const,
};

export interface ContentBlockInput {
  type: "texto" | "imagen";
  content?: string;
  image_url?: string;
  order_index: number;
}

/** `GET /content/classrooms/{classroom_id}/lessons` */
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

interface CreateLessonBody {
  title: string;
  blocks: ContentBlockInput[];
}

/** `POST /content/classrooms/{classroom_id}/lessons`. Creates the lesson as a draft. */
export function useCreateLesson(classroomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateLessonBody) =>
      apiFetch<LessonDetail>(`/content/classrooms/${classroomId}/lessons`, { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: lessonKeys.byClassroom(classroomId) });
      void queryClient.invalidateQueries({ queryKey: classroomKeys.detail(classroomId) });
    },
  });
}

interface UpdateLessonBody {
  title?: string;
  status?: LessonStatus;
  blocks?: ContentBlockInput[];
}

interface UpdateLessonVariables {
  lessonId: string;
  body: UpdateLessonBody;
}

/** `PATCH /content/lessons/{lesson_id}`. Sending `blocks` replaces the
 * whole set, always send the complete array when editing. */
export function useUpdateLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lessonId, body }: UpdateLessonVariables) =>
      apiFetch<LessonDetail>(`/content/lessons/${lessonId}`, { method: "PATCH", body }),
    onSuccess: (lesson) => {
      void queryClient.invalidateQueries({ queryKey: lessonKeys.detail(lesson.id) });
      void queryClient.invalidateQueries({ queryKey: lessonKeys.byClassroom(lesson.classroom_id) });
    },
  });
}

interface UploadLessonImageVariables {
  lessonId: string;
  file: File;
}

/** `POST /content/lessons/{lesson_id}/images`. Uploads an image and
 * returns the URL to insert as a block. */
export function useUploadLessonImage() {
  return useMutation({
    mutationFn: ({ lessonId, file }: UploadLessonImageVariables) => {
      const formData = new FormData();
      formData.append("file", file);
      return apiUpload<{ image_url: string }>(`/content/lessons/${lessonId}/images`, formData);
    },
  });
}

export type { ContentBlock };
