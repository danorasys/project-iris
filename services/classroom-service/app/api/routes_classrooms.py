from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, UploadFile, status

from app.api.deps import CurrentUser, get_classroom_service, require_role
from app.api.schemas import (
    ClassroomResponse,
    ClassroomWithStudentsResponse,
    CreateClassroomRequest,
    EnrolledStudentResponse,
    EnrollmentResponse,
    EnrollRequest,
    RequestResponse,
    ResolveRequestBody,
    ResolveResponse,
    UpdateClassroomRequest,
)
from app.application.classroom_service import ClassroomService
from app.application.dtos import UpdateClassroomData
from app.domain.entities import Classroom
from app.domain.exceptions import InvalidFile

router = APIRouter(prefix="/classrooms", tags=["classrooms"])

ClassroomServiceDep = Annotated[ClassroomService, Depends(get_classroom_service)]
TeacherDep = Annotated[CurrentUser, Depends(require_role("teacher"))]
StudentDep = Annotated[CurrentUser, Depends(require_role("student"))]


def _classroom_response(classroom: Classroom) -> ClassroomResponse:
    return ClassroomResponse(
        id=classroom.id,
        teacher_id=classroom.teacher_id,
        name=classroom.name,
        description=classroom.description,
        logo_url=classroom.logo_url,
        enrollment_code=classroom.enrollment_code,
        created_at=classroom.created_at,
    )


@router.post("", response_model=ClassroomResponse, status_code=status.HTTP_201_CREATED)
async def create_classroom(payload: CreateClassroomRequest, user: TeacherDep, classrooms: ClassroomServiceDep) -> ClassroomResponse:
    classroom = await classrooms.create_classroom(user.subject_id, payload.name, payload.description)
    return _classroom_response(classroom)


@router.get("", response_model=list[ClassroomResponse])
async def list_classrooms(user: TeacherDep, classrooms: ClassroomServiceDep) -> list[ClassroomResponse]:
    result = await classrooms.list_teacher_classrooms(user.subject_id)
    return [_classroom_response(c) for c in result]


@router.get("/mine", response_model=list[ClassroomResponse])
async def list_my_classrooms(user: StudentDep, classrooms: ClassroomServiceDep) -> list[ClassroomResponse]:
    result = await classrooms.list_my_classrooms(user.subject_id)
    return [_classroom_response(c) for c in result]


@router.post("/enroll", response_model=EnrollmentResponse, status_code=status.HTTP_201_CREATED)
async def enroll(payload: EnrollRequest, user: StudentDep, classrooms: ClassroomServiceDep) -> EnrollmentResponse:
    enrollment = await classrooms.enroll_in_classroom(user.subject_id, payload.enrollment_code)
    return EnrollmentResponse(enrollment_id=enrollment.id, classroom_id=enrollment.classroom_id, status=enrollment.status)


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
                avatar=s.avatar,
                status=s.status,
            )
            for s in detail.students
        ],
    )


@router.patch("/{classroom_id}", response_model=ClassroomResponse)
async def update_classroom(
    classroom_id: UUID, payload: UpdateClassroomRequest, user: TeacherDep, classrooms: ClassroomServiceDep
) -> ClassroomResponse:
    classroom = await classrooms.update_classroom(
        classroom_id, user.subject_id, UpdateClassroomData(name=payload.name, description=payload.description)
    )
    return _classroom_response(classroom)


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
    classroom = await classrooms.upload_logo(classroom_id, user.subject_id, contenido, file.content_type, file.filename)
    return _classroom_response(classroom)


@router.get("/{classroom_id}/requests", response_model=list[RequestResponse])
async def list_requests(classroom_id: UUID, user: TeacherDep, classrooms: ClassroomServiceDep) -> list[RequestResponse]:
    requests = await classrooms.list_requests(classroom_id, user.subject_id)
    return [
        RequestResponse(
            enrollment_id=r.enrollment_id,
            student_id=r.student_id,
            student_first_name=r.student_first_name,
            student_avatar=r.student_avatar,
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
