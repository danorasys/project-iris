import type { LessonProgress, UnitDba } from "@iris/shared-types";

export interface UnitOfLessons {
  title: string;
  guidingQuestion: string;
  learningGoal: string;
  dba: UnitDba | null;
  lessons: LessonProgress[];
}

/** The units in the order the lessons come (the server sends them by unit,
 * then by lesson), each with its lessons, its guiding question, its goal and its DBA. */
export function lessonsByUnit(lessons: LessonProgress[]): UnitOfLessons[] {
  const units: UnitOfLessons[] = [];
  for (const lesson of lessons) {
    const last = units[units.length - 1];
    if (last && last.title === lesson.unit_title) last.lessons.push(lesson);
    else {
      units.push({
        title: lesson.unit_title,
        guidingQuestion: lesson.unit_guiding_question,
        learningGoal: lesson.unit_learning_goal,
        dba: lesson.unit_dba,
        lessons: [lesson],
      });
    }
  }
  return units;
}
