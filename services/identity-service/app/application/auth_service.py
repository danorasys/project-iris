"""Auth use cases.

Pure orchestration. No SQLAlchemy, jose or bcrypt imports here, only the
ports defined in app.domain.ports.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Callable
from uuid import UUID

from app.application.dtos import (
    ConsentData,
    FirstStudentData,
    GuardianData,
    IssuedTokens,
    TeacherData,
)
from app.domain.entities import Consent, Guardian, Person, Student, Teacher
from app.domain.exceptions import (
    AttemptLimitExceeded,
    DocumentNumberAlreadyRegistered,
    EmailAlreadyRegistered,
    InvalidCredentials,
    InvalidDocumentType,
    InvalidPin,
    InvalidRelationshipType,
    InvalidToken,
    ResourceNotFound,
)
from app.domain.ports import PasswordHasher, RateLimiter, TokenBlacklist, TokenIssuer, UnitOfWork

UowFactory = Callable[[], "UnitOfWork"]


class AuthService:
    def __init__(
        self,
        uow_factory: UowFactory,
        password_hasher: PasswordHasher,
        token_issuer: TokenIssuer,
        rate_limiter: RateLimiter,
        blacklist: TokenBlacklist,
        rate_limit_login_max: int,
        rate_limit_login_window_sec: int,
        rate_limit_pin_max: int,
        rate_limit_pin_window_sec: int,
        refresh_ttl_seconds: int,
    ) -> None:
        self._uow_factory = uow_factory
        self._hasher = password_hasher
        self._tokens = token_issuer
        self._rate_limiter = rate_limiter
        self._blacklist = blacklist
        self._rate_limit_login_max = rate_limit_login_max
        self._rate_limit_login_window_sec = rate_limit_login_window_sec
        self._rate_limit_pin_max = rate_limit_pin_max
        self._rate_limit_pin_window_sec = rate_limit_pin_window_sec
        self._refresh_ttl_seconds = refresh_ttl_seconds

    async def register_guardian(
        self,
        guardian_data: GuardianData,
        student_data: FirstStudentData,
        consent_data: ConsentData,
    ) -> tuple[Person, Guardian, Student, IssuedTokens]:
        """Creates person, guardian, student and consent in a single
        transaction. A student never registers itself, a guardian always does it."""
        async with self._uow_factory() as uow:
            if await uow.people.get_by_email(guardian_data.email) is not None:
                raise EmailAlreadyRegistered()
            if await uow.people.get_by_document_number(guardian_data.document_number) is not None:
                raise DocumentNumberAlreadyRegistered()
            if await uow.document_types.get_by_id(guardian_data.document_type_id) is None:
                raise InvalidDocumentType()
            if await uow.relationship_types.get_by_id(guardian_data.relationship_type_id) is None:
                raise InvalidRelationshipType()

            now = datetime.now(timezone.utc)
            person = Person(
                id=uuid.uuid4(),
                first_name=guardian_data.first_name,
                last_name=guardian_data.last_name,
                email=guardian_data.email,
                hash_password=self._hasher.hash(guardian_data.password),
                created_at=now,
                document_type_id=guardian_data.document_type_id,
                document_number=guardian_data.document_number,
                document_issued_at=guardian_data.document_issued_at,
                phone_country_code=guardian_data.phone_country_code,
                phone_number=guardian_data.phone_number,
                date_of_birth=guardian_data.date_of_birth,
            )
            guardian = Guardian(
                id=uuid.uuid4(),
                person_id=person.id,
                relationship_type_id=guardian_data.relationship_type_id,
            )
            student = Student(
                id=uuid.uuid4(),
                guardian_id=guardian.id,
                first_name=student_data.first_name,
                last_name=student_data.last_name,
                date_of_birth=student_data.date_of_birth,
                hash_pin=self._hasher.hash(student_data.pin),
                avatar=student_data.avatar,
                support_condition=student_data.support_condition,
            )
            consent_entity = Consent(
                id=uuid.uuid4(),
                guardian_id=guardian.id,
                student_id=student.id,
                policy_version=consent_data.policy_version,
                granted_at=now,
                authorizes_support_condition=consent_data.authorizes_support_condition,
            )

            # Flush after each insert. These models carry the FK as a plain UUID
            # instead of an ORM object reference, so SQLAlchemy can't infer insert
            # order on its own. Without the flush, the order isn't guaranteed and
            # can violate the FK on real Postgres. SQLite in tests won't catch it,
            # it doesn't enforce FKs.
            await uow.people.add(person)
            await uow.flush()
            await uow.guardians.add(guardian)
            await uow.flush()
            await uow.students.add(student)
            await uow.flush()
            await uow.consents.add(consent_entity)
            await uow.commit()

        tokens = self._issue_token_pair(person.id, "guardian")
        return person, guardian, student, tokens

    async def register_teacher(self, data: TeacherData) -> tuple[Person, Teacher, IssuedTokens]:
        async with self._uow_factory() as uow:
            if await uow.people.get_by_email(data.email) is not None:
                raise EmailAlreadyRegistered()
            if await uow.people.get_by_document_number(data.document_number) is not None:
                raise DocumentNumberAlreadyRegistered()
            if await uow.document_types.get_by_id(data.document_type_id) is None:
                raise InvalidDocumentType()

            person = Person(
                id=uuid.uuid4(),
                first_name=data.first_name,
                last_name=data.last_name,
                email=data.email,
                hash_password=self._hasher.hash(data.password),
                created_at=datetime.now(timezone.utc),
                document_type_id=data.document_type_id,
                document_number=data.document_number,
                # Teacher registration doesn't have the country-flag selector
                # guardians do (see TeacherRegistrationRequest.phone): it only
                # ever collected a 10-digit local number, which was always
                # implicitly Colombian. Splitting the column doesn't change
                # that behavior, it just makes the assumption explicit here
                # instead of leaving it undocumented in a bare digit string.
                phone_country_code="57",
                phone_number=data.phone,
                date_of_birth=data.date_of_birth,
            )
            teacher = Teacher(id=uuid.uuid4(), person_id=person.id, institution=data.institution)

            await uow.people.add(person)
            await uow.teachers.add(teacher)
            await uow.commit()

        tokens = self._issue_token_pair(person.id, "teacher")
        return person, teacher, tokens

    async def login(self, email: str, password: str, client_ip: str) -> tuple[Person, str, IssuedTokens]:
        limit_key = f"login:{client_ip}:{email.lower()}"
        if not await self._rate_limiter.permitir(limit_key, self._rate_limit_login_max, self._rate_limit_login_window_sec):
            raise AttemptLimitExceeded()

        async with self._uow_factory() as uow:
            person = await uow.people.get_by_email(email)
            # Runs the same bcrypt check either way, even when there's no matching
            # email. Skipping it when person is None would make a missing email
            # respond faster than a wrong password, and that timing gap is enough
            # to tell an attacker which emails are registered.
            hash_to_check = person.hash_password if person is not None else self._hasher.dummy_hash
            password_matches = self._hasher.verificar(password, hash_to_check)
            if person is None or not password_matches:
                raise InvalidCredentials()

            guardian = await uow.guardians.get_by_person_id(person.id)
            role = "guardian" if guardian is not None else "teacher"

        tokens = self._issue_token_pair(person.id, role)
        return person, role, tokens

    async def login_student_profile(self, student_id: UUID, pin: str) -> tuple[Student, IssuedTokens]:
        limit_key = f"pin:{student_id}"
        if not await self._rate_limiter.permitir(limit_key, self._rate_limit_pin_max, self._rate_limit_pin_window_sec):
            raise AttemptLimitExceeded()

        async with self._uow_factory() as uow:
            student = await uow.students.get_by_id(student_id)
            if student is None:
                raise ResourceNotFound("Perfil de estudiante no encontrado.")
            if not self._hasher.verificar(pin, student.hash_pin):
                raise InvalidPin()

        tokens = self._issue_token_pair(student.id, "student", extra={"guardian_id": str(student.guardian_id)})
        return student, tokens

    async def refresh(self, refresh_token: str) -> IssuedTokens:
        claims = self._tokens.decodificar(refresh_token)
        if claims.get("type") != "refresh":
            raise InvalidToken()
        jti = claims.get("jti")
        if not isinstance(jti, str) or await self._blacklist.esta_invalidado(jti):
            raise InvalidToken()

        await self._blacklist.invalidar(jti, self._refresh_ttl_seconds)
        subject_id = UUID(str(claims["sub"]))
        role = str(claims["role"])
        extra = {"guardian_id": str(claims["guardian_id"])} if "guardian_id" in claims else {}
        return self._issue_token_pair(subject_id, role, extra=extra)

    async def logout(self, refresh_token: str) -> None:
        claims = self._tokens.decodificar(refresh_token)
        jti = claims.get("jti")
        if isinstance(jti, str):
            await self._blacklist.invalidar(jti, self._refresh_ttl_seconds)

    async def validate_access_token(self, access_token: str) -> dict[str, object]:
        claims = self._tokens.decodificar(access_token)
        if claims.get("type") != "access":
            raise InvalidToken()
        return claims

    def _issue_token_pair(self, subject_id: UUID, role: str, extra: dict[str, str] | None = None) -> IssuedTokens:
        access = self._tokens.emitir_access_token(subject_id, role, extra or {})
        refresh, _jti = self._tokens.emitir_refresh_token(subject_id, role)
        return IssuedTokens(access_token=access, refresh_token=refresh)
