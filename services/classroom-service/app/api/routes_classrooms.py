from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Path, Response, UploadFile, status

from app.api.deps import (
    CurrentUser,
    get_classroom_service,
    require_logo_reader,
    require_portal_guardian,
    require_role,
)
from app.api.media import media_response
from app.api.schemas import (
    ClassroomPreviewResponse,
    ClassStatisticsOut,
    ClassroomResponse,
    ClassroomWithStudentsResponse,
    CreateClassroomRequest,
    EnrolledStudentResponse,
    EnrollmentResponse,
    FamilyClassroomDetailResponse,
    FamilyClassroomResponse,
    FamilyEnrollmentRequest,
    FamilyMessageRequest,
    LessonProgressOut,
    LookupClassroomRequest,
    RequestResponse,
    ResolveRequestBody,
    ResolveResponse,
    TeacherClassroomResponse,
    TeacherExperienceOut,
    TeacherMessageRequest,
    TeacherProfileOut,
    TeacherStudyOut,
    UpdateClassroomRequest,
)
from app.application.classroom_service import ClassroomService
from app.application.dtos import FamilyClassroom, UpdateClassroomData
from app.domain.entities import Classroom, TeacherPublicProfile
from app.domain.exceptions import InvalidFile

router = APIRouter(prefix="/classrooms", tags=["classrooms"])

ClassroomServiceDep = Annotated[ClassroomService, Depends(get_classroom_service)]
TeacherDep = Annotated[CurrentUser, Depends(require_role("teacher"))]
StudentDep = Annotated[CurrentUser, Depends(require_role("student"))]
LogoReaderDep = Annotated[CurrentUser, Depends(require_logo_reader)]
GuardianPortalDep = Annotated[CurrentUser, Depends(require_portal_guardian)]

# Same shape as the names this service creates (32 hex chars and an
# extension), anything else is rejected before touching the database.
LogoFileName = Annotated[str, Path(pattern=r"^[0-9a-f]{32}\.[a-z0-9]{1,5}$")]

# Only the user's browser may cache the logo, never a shared cache.
_LOGO_CACHE = "private, max-age=3600"


def _classroom_response(classroom: Classroom) -> ClassroomResponse:
    return ClassroomResponse(
        id=classroom.id,
        teacher_id=classroom.teacher_id,
        name=classroom.name,
        description=classroom.description,
        logo_file=classroom.logo_file,
        color=classroom.color,  # type: ignore[arg-type]  # the CHECK in the database keeps it in the list
        area=classroom.area,  # type: ignore[arg-type]  # same, ck_classrooms_area
        area_other=classroom.area_other,
        grade=classroom.grade,
        enrollment_code=classroom.enrollment_code,
        created_at=classroom.created_at,
        has_teacher=classroom.has_teacher,
    )


def _teacher_out(teacher: TeacherPublicProfile | None) -> TeacherProfileOut | None:
    if teacher is None:
        return None
    return TeacherProfileOut(
        first_name=teacher.first_name,
        last_name=teacher.last_name,
        institution=teacher.institution,
        about=teacher.about,
        studies=[TeacherStudyOut(**s.__dict__) for s in teacher.studies],
        experiences=[TeacherExperienceOut(**e.__dict__) for e in teacher.experiences],
    )


def _family_response(f: FamilyClassroom) -> FamilyClassroomResponse:
    return FamilyClassroomResponse(
        enrollment_id=f.enrollment_id,
        student_id=f.student_id,
        student_first_name=f.student_first_name,
        status=f.status,  # type: ignore[arg-type]  # the service only stores these three
        requested_at=f.requested_at,
        resolved_at=f.resolved_at,
        classroom_id=f.classroom.id,
        name=f.classroom.name,
        description=f.classroom.description,
        logo_file=f.classroom.logo_file,
        color=f.classroom.color,  # type: ignore[arg-type]  # the CHECK in the database keeps it in the list
        area=f.classroom.area,  # type: ignore[arg-type]  # same, ck_classrooms_area
        area_other=f.classroom.area_other,
        grade=f.classroom.grade,
        teacher_name=f.teacher_name,
        published_lessons=f.published_lessons,
        published_units=f.published_units,
        has_teacher=f.classroom.has_teacher,
    )


@router.post("", response_model=ClassroomResponse, status_code=status.HTTP_201_CREATED)
async def create_classroom(payload: CreateClassroomRequest, user: TeacherDep, classrooms: ClassroomServiceDep) -> ClassroomResponse:
    classroom = await classrooms.create_classroom(
        user.subject_id,
        payload.name,
        payload.description,
        payload.area,
        payload.grade,
        payload.color,
        payload.area_other,
    )
    return _classroom_response(classroom)


@router.get("", response_model=list[TeacherClassroomResponse])
async def list_classrooms(user: TeacherDep, classrooms: ClassroomServiceDep) -> list[TeacherClassroomResponse]:
    """The teacher's classrooms, newest first, each with how many join
    requests are waiting and how many students it has."""
    result = await classrooms.list_teacher_classrooms(user.subject_id)
    return [
        TeacherClassroomResponse(
            **_classroom_response(item.classroom).model_dump(),
            pending_requests=item.pending_requests,
            student_count=item.student_count,
        )
        for item in result
    ]


@router.get("/mine", response_model=list[ClassroomResponse])
async def list_my_classrooms(user: StudentDep, classrooms: ClassroomServiceDep) -> list[ClassroomResponse]:
    result = await classrooms.list_my_classrooms(user.subject_id)
    return [_classroom_response(c) for c in result]


# ---------------------------------------------------------------------------
# Parents' portal (EP-07). All behind the portal's 2FA code, and only about
# the guardian's own kids.
# ---------------------------------------------------------------------------


@router.get("/family", response_model=list[FamilyClassroomResponse])
async def list_family_classrooms(user: GuardianPortalDep, classrooms: ClassroomServiceDep) -> list[FamilyClassroomResponse]:
    """The classes of the guardian's kids and every request with how it
    went (pending, accepted or rejected), newest first."""
    result = await classrooms.list_family_classrooms(user.subject_id)
    return [_family_response(f) for f in result]


@router.post("/family/lookup", response_model=ClassroomPreviewResponse)
async def preview_classroom(
    payload: LookupClassroomRequest, user: GuardianPortalDep, classrooms: ClassroomServiceDep
) -> ClassroomPreviewResponse:
    """The class behind a code and its teacher, before asking to join
    (HU-40). A POST so the code never ends up in a URL or a log. 404 if no
    class has it, 429 after too many tries."""
    preview = await classrooms.preview_classroom(user.subject_id, payload.enrollment_code)
    c = preview.classroom
    return ClassroomPreviewResponse(
        classroom_id=c.id,
        name=c.name,
        description=c.description,
        logo_file=c.logo_file,
        color=c.color,  # type: ignore[arg-type]  # the CHECK in the database keeps it in the list
        area=c.area,  # type: ignore[arg-type]  # same, ck_classrooms_area
        area_other=c.area_other,
        grade=c.grade,
        teacher=_teacher_out(preview.teacher),
        published_lessons=preview.published_lessons,
        published_units=preview.published_units,
    )


@router.post("/family/requests", response_model=EnrollmentResponse, status_code=status.HTTP_201_CREATED)
async def request_enrollment(
    payload: FamilyEnrollmentRequest, user: GuardianPortalDep, classrooms: ClassroomServiceDep
) -> EnrollmentResponse:
    """Asks the teacher to let one of the guardian's kids in. 409 if there's
    already a pending or accepted one; a rejected one can be asked again."""
    enrollment = await classrooms.request_enrollment(user.subject_id, payload.student_id, payload.enrollment_code)
    return EnrollmentResponse(enrollment_id=enrollment.id, classroom_id=enrollment.classroom_id, status=enrollment.status)


@router.get("/family/{enrollment_id}", response_model=FamilyClassroomDetailResponse)
async def get_family_classroom(
    enrollment_id: UUID, user: GuardianPortalDep, classrooms: ClassroomServiceDep
) -> FamilyClassroomDetailResponse:
    """The space of a class the kid is in (HU-42) with its teacher's
    profile (HU-97). 409 while the request still waits."""
    detail = await classrooms.get_family_classroom(user.subject_id, enrollment_id)
    return FamilyClassroomDetailResponse(
        **_family_response(detail.family).model_dump(), teacher=_teacher_out(detail.teacher)
    )


@router.get("/family/{enrollment_id}/progress", response_model=list[LessonProgressOut])
async def get_family_progress(
    enrollment_id: UUID, user: GuardianPortalDep, classrooms: ClassroomServiceDep
) -> list[LessonProgressOut]:
    """How far the kid got in each lesson of the class, regular and extra,
    and every try at the activities (HU-46, HU-47). 409 while the request
    still waits, 503 if content-service didn't answer."""
    lessons = await classrooms.get_family_progress(user.subject_id, enrollment_id)
    return [LessonProgressOut.model_validate(lesson) for lesson in lessons]


@router.delete("/family/{enrollment_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def leave_classroom(enrollment_id: UUID, user: GuardianPortalDep, classrooms: ClassroomServiceDep) -> None:
    """Takes the kid out of the class (HU-49), cancels a request still
    waiting, or clears a rejected one off the list. The teacher hears about
    the first two."""
    await classrooms.leave_classroom(user.subject_id, enrollment_id)


@router.post("/family/{enrollment_id}/messages", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def send_message(
    enrollment_id: UUID, payload: TeacherMessageRequest, user: GuardianPortalDep, classrooms: ClassroomServiceDep
) -> None:
    """A message to the teacher of the class (HU-48), kept in their tray."""
    await classrooms.send_message(user.subject_id, enrollment_id, payload.subject, payload.body, payload.thread_id)


@router.get("/{classroom_id}", response_model=ClassroomWithStudentsResponse)
async def get_classroom(classroom_id: UUID, user: TeacherDep, classrooms: ClassroomServiceDep) -> ClassroomWithStudentsResponse:
    detail = await classrooms.get_classroom_with_students(classroom_id, user.subject_id)
    return ClassroomWithStudentsResponse(
        **_classroom_response(detail.classroom).model_dump(),
        students=[
            EnrolledStudentResponse(
                enrollment_id=s.enrollment_id,
                student_id=s.student_id,
                first_name=s.first_name,
                avatar_id=s.avatar_id,
                status=s.status,
                guardian_name=s.guardian_name,
                guardian_email=s.guardian_email,
                guardian_phone=s.guardian_phone,
            )
            for s in detail.students
        ],
    )


@router.patch("/{classroom_id}", response_model=ClassroomResponse)
async def update_classroom(
    classroom_id: UUID, payload: UpdateClassroomRequest, user: TeacherDep, classrooms: ClassroomServiceDep
) -> ClassroomResponse:
    classroom = await classrooms.update_classroom(
        classroom_id,
        user.subject_id,
        UpdateClassroomData(
            name=payload.name,
            description=payload.description,
            color=payload.color,
            area=payload.area,
            area_other=payload.area_other,
            grade=payload.grade,
        ),
    )
    return _classroom_response(classroom)


@router.delete("/{classroom_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_classroom(classroom_id: UUID, user: TeacherDep, classrooms: ClassroomServiceDep) -> None:
    """Deletes the classroom with its lessons, enrollments and logo. 503 if
    the lessons couldn't be deleted, then nothing is deleted."""
    await classrooms.delete_classroom(classroom_id, user.subject_id)


@router.delete("/{classroom_id}/students/{enrollment_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def remove_student(
    classroom_id: UUID, enrollment_id: UUID, user: TeacherDep, classrooms: ClassroomServiceDep
) -> None:
    """Takes a student out of the classroom. Their guardian gets a notification."""
    await classrooms.remove_student(classroom_id, enrollment_id, user.subject_id)


@router.post(
    "/{classroom_id}/students/{enrollment_id}/messages", status_code=status.HTTP_204_NO_CONTENT, response_model=None
)
async def send_family_message(
    classroom_id: UUID,
    enrollment_id: UUID,
    payload: FamilyMessageRequest,
    user: TeacherDep,
    classrooms: ClassroomServiceDep,
) -> None:
    """A message to a kid of the class or to their guardian (HU-77), kept in
    their tray. 503 mensaje_no_enviado if it couldn't go out."""
    await classrooms.send_family_message(
        classroom_id,
        enrollment_id,
        user.subject_id,
        payload.recipient,
        payload.subject,
        payload.body,
        payload.thread_id,
    )


@router.get("/{classroom_id}/statistics", response_model=ClassStatisticsOut)
async def get_statistics(classroom_id: UUID, user: TeacherDep, classrooms: ClassroomServiceDep) -> ClassStatisticsOut:
    """The statistics of the class (HU-86, HU-87): how far each kid got in
    every published lesson, who passed, the best and the lowest scores, and
    the totals. 503 estadisticas_no_disponibles without content-service."""
    return ClassStatisticsOut.model_validate(await classrooms.get_statistics(classroom_id, user.subject_id))


@router.post("/{classroom_id}/logo", response_model=ClassroomResponse)
async def upload_logo(
    classroom_id: UUID,
    user: TeacherDep,
    classrooms: ClassroomServiceDep,
    file: Annotated[UploadFile, File()],
) -> ClassroomResponse:
    if file.content_type is None:
        raise InvalidFile("El archivo debe ser una imagen.")
    contenido = await file.read()
    classroom = await classrooms.upload_logo(classroom_id, user.subject_id, contenido, file.content_type)
    return _classroom_response(classroom)


@router.delete("/{classroom_id}/logo", response_model=ClassroomResponse)
async def remove_logo(classroom_id: UUID, user: TeacherDep, classrooms: ClassroomServiceDep) -> ClassroomResponse:
    """Takes the uploaded image out, the avatar goes back to the initials."""
    classroom = await classrooms.remove_logo(classroom_id, user.subject_id)
    return _classroom_response(classroom)


@router.get(
    "/{classroom_id}/logo/{file_name}",
    response_class=Response,
    responses={200: {"content": {"image/*": {}}}, 404: {"description": "No existe o no tienes acceso."}},
)
async def get_logo(
    classroom_id: UUID, file_name: LogoFileName, user: LogoReaderDep, classrooms: ClassroomServiceDep
) -> Response:
    signed = await classrooms.get_logo(classroom_id, file_name, user.subject_id, user.role)
    return media_response(signed, _LOGO_CACHE)


@router.get("/{classroom_id}/requests", response_model=list[RequestResponse])
async def list_requests(classroom_id: UUID, user: TeacherDep, classrooms: ClassroomServiceDep) -> list[RequestResponse]:
    requests = await classrooms.list_requests(classroom_id, user.subject_id)
    return [
        RequestResponse(
            enrollment_id=r.enrollment_id,
            student_id=r.student_id,
            student_first_name=r.student_first_name,
            student_avatar_id=r.student_avatar_id,
            guardian_name=r.guardian_name,
            guardian_contact=r.guardian_contact,
            requested_at=r.requested_at,
        )
        for r in requests
    ]


@router.post("/{classroom_id}/requests/{enrollment_id}/resolve", response_model=ResolveResponse)
async def resolve_request(
    classroom_id: UUID,
    enrollment_id: UUID,
    payload: ResolveRequestBody,
    user: TeacherDep,
    classrooms: ClassroomServiceDep,
) -> ResolveResponse:
    enrollment = await classrooms.resolve_request(classroom_id, enrollment_id, user.subject_id, payload.decision)
    return ResolveResponse(enrollment_id=enrollment.id, status=enrollment.status)
