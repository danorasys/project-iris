import { useCallback, useRef } from "react";
import { useReachPage } from "@/shared/api/hooks/useLessonsApi";

/** Tells the server the page the kid is on (in the lesson or an extra), so
 * they come back there (HU-62). One save at a time, only the newest one
 * waits, and a failed save is retried on the next page turn. */
export function useReachedPages(lessonId: string, startedAt: Record<string, number>) {
  const reach = useReachPage();
  // Per part ("" is the lesson): the page the server has, and one waiting.
  const sent = useRef<Record<string, number>>({ ...startedAt });
  const waiting = useRef<Record<string, number>>({});
  const busy = useRef(false);

  const flush = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      for (let next = Object.entries(waiting.current)[0]; next; next = Object.entries(waiting.current)[0]) {
        const [part, page] = next;
        delete waiting.current[part];
        try {
          await reach.mutateAsync({ lessonId, page, extraId: part || null });
          sent.current[part] = page;
        } catch {
          // Not saved: the next page turn sends it again.
        }
      }
    } finally {
      busy.current = false;
    }
  }, [lessonId, reach]);

  return useCallback(
    (extraId: string | null, page: number) => {
      const part = extraId ?? "";
      if (waiting.current[part] === undefined && sent.current[part] === page) return;
      waiting.current[part] = page;
      void flush();
    },
    [flush],
  );
}
