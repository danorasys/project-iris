import type { ClassStatistics, KidInLesson, LessonStatistics } from "@iris/shared-types";

// What the teacher's statistics show, apart from the screen so it can be
// tested on its own (HU-86, HU-87).

/** "2 de 3", the best try of a kid. */
export function scoreText(kid: KidInLesson): string {
  return kid.best_correct !== null && kid.best_total !== null ? `${kid.best_correct} de ${kid.best_total}` : "—";
}

/** The best and the lowest performance in a lesson (HU-86), among the kids
 * who tried its activity: up to three of each, never the same kid in both
 * (with few of them, half and half). The ones who haven't tried go apart.
 * The server already sends them best first. */
export function performance(lesson: LessonStatistics, size = 3) {
  const tried = lesson.kids.filter((kid) => kid.tries > 0);
  const best = tried.slice(0, Math.min(size, Math.ceil(tried.length / 2)));
  const lowest = tried.slice(best.length).slice(-size).reverse();
  const notTried = lesson.kids.filter((kid) => kid.tries === 0);
  return { best, lowest, notTried };
}

/** Of the kids of a lesson, the percent who passed its activity. */
export function passRate(lesson: LessonStatistics): number {
  const kids = lesson.kids.length;
  return kids ? Math.round((100 * lesson.passed) / kids) : 0;
}

/** Every kid in every lesson, by how far they got, for the donut of the class. */
export function classTotals(statistics: ClassStatistics) {
  return statistics.lessons.reduce(
    (totals, lesson) => ({
      completed: totals.completed + lesson.completed,
      inProgress: totals.inProgress + lesson.in_progress,
      notStarted: totals.notStarted + lesson.not_started,
    }),
    { completed: 0, inProgress: 0, notStarted: 0 },
  );
}
