# The statistics of a class for its teacher (HU-86, HU-87), as pure functions.
# completed = 100 % of the lesson, passed = at least one try passed, best = the
# try with most right answers. Extras don't count, not every kid gets them.

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from app.application import progress_rules as rules
from app.domain.entities import Attempt, Lesson, PageProgress


@dataclass(frozen=True)
class KidInLesson:
    student_id: UUID
    percent: int
    tries: int
    # The best try, or None if they haven't tried.
    best_correct: int | None
    best_total: int | None
    passed: bool


@dataclass(frozen=True)
class LessonStatistics:
    lesson_id: UUID
    title: str
    unit_title: str
    has_activity: bool
    average_percent: int
    completed: int
    in_progress: int
    not_started: int
    # Of the kids, how many passed, and how many tried without passing.
    passed: int
    tried_not_passed: int
    # Best performance first; the ones who haven't tried go last.
    kids: list[KidInLesson]


@dataclass(frozen=True)
class KidInClass:
    student_id: UUID
    average_percent: int
    completed_lessons: int


@dataclass(frozen=True)
class ClassStatistics:
    kids: int
    lessons: list[LessonStatistics]
    # Of every (kid, lesson) pair, the percent that got to 100 %.
    completed_percent: int
    average_percent: int
    by_kid: list[KidInClass]


def _percent(part: int, whole: int) -> int:
    return round(100 * part / whole) if whole else 0


def _rank(kid: KidInLesson) -> tuple[int, float, int]:
    # Tried first, then by the best score, then by how far they got.
    score = (kid.best_correct or 0) / kid.best_total if kid.best_total else 0.0
    return (0 if kid.tries else 1, -score, -kid.percent)


def _kid_in_lesson(lesson: Lesson, student_id: UUID, pages_seen: int, tries: list[Attempt]) -> KidInLesson:
    total_pages = rules.page_count(lesson.blocks)
    has_activity = lesson.activity is not None
    best = max(tries, key=lambda a: (a.correct / a.total if a.total else 0.0, a.correct), default=None)
    return KidInLesson(
        student_id=student_id,
        percent=rules.percent_done(min(pages_seen, total_pages), total_pages, has_activity, bool(tries)),
        tries=len(tries),
        best_correct=best.correct if best else None,
        best_total=best.total if best else None,
        passed=any(a.passed for a in tries),
    )


def summarize(
    lessons: list[Lesson],
    unit_titles: dict[UUID, str],
    student_ids: list[UUID],
    pages: list[PageProgress],
    attempts: list[Attempt],
) -> ClassStatistics:
    # Only the lesson itself (extra_id None) counts, see the top of the file.
    seen = {(p.student_id, p.lesson_id): p.pages_seen for p in pages if p.extra_id is None}
    tries: dict[tuple[UUID, UUID], list[Attempt]] = {}
    for attempt in attempts:
        if attempt.extra_id is None:
            tries.setdefault((attempt.student_id, attempt.lesson_id), []).append(attempt)

    lesson_stats: list[LessonStatistics] = []
    for lesson in lessons:
        kids = [
            _kid_in_lesson(lesson, s, seen.get((s, lesson.id), 0), tries.get((s, lesson.id), [])) for s in student_ids
        ]
        lesson_stats.append(
            LessonStatistics(
                lesson_id=lesson.id,
                title=lesson.title,
                unit_title=unit_titles.get(lesson.unit_id, ""),
                has_activity=lesson.activity is not None,
                average_percent=round(sum(k.percent for k in kids) / len(kids)) if kids else 0,
                completed=sum(1 for k in kids if k.percent == 100),
                in_progress=sum(1 for k in kids if 0 < k.percent < 100),
                not_started=sum(1 for k in kids if k.percent == 0),
                passed=sum(1 for k in kids if k.passed),
                tried_not_passed=sum(1 for k in kids if k.tries and not k.passed),
                kids=sorted(kids, key=_rank),
            )
        )

    by_kid = []
    for student_id in student_ids:
        mine = [k for stat in lesson_stats for k in stat.kids if k.student_id == student_id]
        by_kid.append(
            KidInClass(
                student_id=student_id,
                average_percent=round(sum(k.percent for k in mine) / len(mine)) if mine else 0,
                completed_lessons=sum(1 for k in mine if k.percent == 100),
            )
        )

    pairs = len(student_ids) * len(lessons)
    completed_pairs = sum(stat.completed for stat in lesson_stats)
    all_percents = [k.percent for stat in lesson_stats for k in stat.kids]
    return ClassStatistics(
        kids=len(student_ids),
        lessons=lesson_stats,
        completed_percent=_percent(completed_pairs, pairs),
        average_percent=round(sum(all_percents) / len(all_percents)) if all_percents else 0,
        by_kid=sorted(by_kid, key=lambda k: (-k.average_percent, -k.completed_lessons)),
    )
