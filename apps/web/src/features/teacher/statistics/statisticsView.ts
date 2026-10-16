import type { ClassStatistics, KidInLesson, LessonStatistics } from "@iris/shared-types";
import { fullName as joinName } from "@/features/utils/fullName";
import { searchable } from "../classrooms/tilePages";

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

/** A unit of the class with its published lessons, and how the kids are
 * doing in it: the average of its lessons, and of every kid in every lesson
 * how many completed it and how many passed its activity. */
export interface UnitStatistics {
  unitId: string;
  title: string;
  lessons: LessonStatistics[];
  averagePercent: number;
  completed: number;
  passed: number;
  /** Every kid in every lesson of the unit. */
  pairs: number;
}

/** The lessons grouped by their unit, in the order of the class (the server
 * sends them by unit and then by lesson). */
export function byUnit(statistics: ClassStatistics): UnitStatistics[] {
  const units: UnitStatistics[] = [];
  for (const lesson of statistics.lessons) {
    let unit = units.find((u) => u.unitId === lesson.unit_id);
    if (!unit) {
      unit = {
        unitId: lesson.unit_id,
        title: lesson.unit_title,
        lessons: [],
        averagePercent: 0,
        completed: 0,
        passed: 0,
        pairs: 0,
      };
      units.push(unit);
    }
    unit.lessons.push(lesson);
    unit.completed += lesson.completed;
    unit.passed += lesson.passed;
    unit.pairs += lesson.kids.length;
  }
  // Every lesson has the same kids, so the average of the lessons is the
  // average of every kid in every lesson.
  for (const unit of units) {
    const total = unit.lessons.reduce((sum, lesson) => sum + lesson.average_percent, 0);
    unit.averagePercent = Math.round(total / unit.lessons.length);
  }
  return units;
}

/** The kids of a lesson by how far they got, the furthest first; the same
 * percent keeps the order they came in. */
export function byProgress(kids: KidInLesson[]): KidInLesson[] {
  return [...kids].sort((a, b) => b.percent - a.percent);
}

/** How many kids a card shows, the furthest first; "Ver todos" has the rest. */
export const KIDS_SHOWN = 5;

/** A kid's full name (the avatar helps tell them apart too). */
export function fullName(kid: { first_name: string; last_name?: string | null }): string {
  return joinName(kid.first_name, kid.last_name);
}

/** The kids whose name has what was typed, without minding accents. */
export function findKids<T extends { first_name: string; last_name: string }>(kids: T[], query: string): T[] {
  const wanted = searchable(query.trim());
  return wanted ? kids.filter((kid) => searchable(fullName(kid)).includes(wanted)) : kids;
}

/** One lesson as one kid did it; null when the kid isn't in its numbers. */
export interface KidLesson {
  lesson: LessonStatistics;
  result: KidInLesson | null;
}

export interface KidUnit {
  unitId: string;
  title: string;
  lessons: KidLesson[];
  averagePercent: number;
}

/** Everything one kid did in the class, by unit (the results of a student,
 * one by one): their lessons, how many they completed, how many activities
 * they passed out of the ones there are, and how many tries they made. */
export function kidResults(statistics: ClassStatistics, studentId: string) {
  const units = byUnit(statistics).map((unit): KidUnit => {
    const lessons = unit.lessons.map((lesson) => ({
      lesson,
      result: lesson.kids.find((kid) => kid.student_id === studentId) ?? null,
    }));
    const total = lessons.reduce((sum, { result }) => sum + (result?.percent ?? 0), 0);
    return { unitId: unit.unitId, title: unit.title, lessons, averagePercent: Math.round(total / lessons.length) };
  });
  const all = units.flatMap((unit) => unit.lessons);
  return {
    units,
    lessons: all.length,
    completed: all.filter(({ result }) => result?.percent === 100).length,
    withActivity: all.filter(({ lesson }) => lesson.has_activity).length,
    passed: all.filter(({ result }) => result?.passed).length,
    tries: all.reduce((sum, { result }) => sum + (result?.tries ?? 0), 0),
  };
}
