# What counts as progress in a lesson, and how an activity is graded. Pure
# functions, used by ProgressService (HU-46, HU-47).

from __future__ import annotations

from uuid import UUID

from app.application.lesson_rules import extra_missing
from app.domain.entities import Activity, ContentBlock, Extra, Lesson
from app.domain.exceptions import ActivityChanged


# The pages of a lesson or an extra, each with its blocks in order. A page is
# every block with the same page_index, and the numbers can have gaps.
def pages(blocks: list[ContentBlock]) -> list[list[ContentBlock]]:
    by_page: dict[int, list[ContentBlock]] = {}
    for block in blocks:
        by_page.setdefault(block.page_index, []).append(block)
    return [sorted(by_page[index], key=lambda b: b.order_index) for index in sorted(by_page)]


def page_count(blocks: list[ContentBlock]) -> int:
    return len({block.page_index for block in blocks})


# The extras a kid gets: complete ones (an incomplete one isn't shown to
# anybody) for everyone or for that kid.
def extras_for(lesson: Lesson, student_id: UUID) -> list[Extra]:
    return [
        extra
        for extra in sorted(lesson.extras, key=lambda e: e.order_index)
        if not extra_missing(extra) and (extra.for_everyone or student_id in extra.student_ids)
    ]


# How much of a part is done, from 0 to 100. Every page counts one step, and
# the activity one more once it was tried at least once: it's formative, the
# score is in the record of tries, not here.
def percent_done(pages_seen: int, total_pages: int, has_activity: bool, tried: bool) -> int:
    steps = total_pages + (1 if has_activity else 0)
    if steps == 0:
        return 0
    done = min(pages_seen, total_pages) + (1 if has_activity and tried else 0)
    return round(100 * done / steps)


# Whether one answer is right, while the kid is still doing the activity
# (HU-63). The question and the option must be in the activity as it is
# now; if not, it changed under the kid.
def check_answer(activity: Activity, question_id: UUID, option_id: UUID) -> bool:
    question = next((q for q in activity.questions if q.id == question_id), None)
    chosen = next((o for o in question.options if o.id == option_id), None) if question else None
    if chosen is None:
        raise ActivityChanged()
    return chosen.is_correct


# Grades the answers (question id -> option id) against the activity as it
# is now. They must answer every question once with one of its options; if
# not, the activity changed under the kid (or they skipped one).
def grade(activity: Activity, answers: dict[UUID, UUID]) -> list[bool]:
    questions = sorted(activity.questions, key=lambda q: q.order_index)
    if set(answers) != {q.id for q in questions}:
        raise ActivityChanged()
    results: list[bool] = []
    for question in questions:
        chosen = next((o for o in question.options if o.id == answers[question.id]), None)
        if chosen is None:
            raise ActivityChanged()
        results.append(chosen.is_correct)
    return results
