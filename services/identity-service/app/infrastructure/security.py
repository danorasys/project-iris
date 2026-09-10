from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from uuid import UUID

import bcrypt
from jose import JWTError, jwt

from app.domain.exceptions import InvalidToken


class BcryptPasswordHasher:
    """Implements the PasswordHasher port. Used for both guardian/teacher
    passwords and the student PIN. Hashed the same way, never stored plain."""

    # A bcrypt hash of a fixed placeholder value, never a real credential. Only
    # used as a stand-in to check against when there's no real hash, so that
    # check still costs a real bcrypt comparison. Fixed instead of generated on
    # every startup so it costs nothing to read.
    DUMMY_HASH = "$2b$12$CkV/Ty2FZKTghpbtd/8eTurfDfOg2PUw37bam0n4R3hBZ96naESBK"

    def hash(self, valor_plano: str) -> str:
        return bcrypt.hashpw(valor_plano.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    def verificar(self, valor_plano: str, hash_guardado: str) -> bool:
        try:
            return bcrypt.checkpw(valor_plano.encode("utf-8"), hash_guardado.encode("utf-8"))
        except ValueError:
            return False

    @property
    def dummy_hash(self) -> str:
        return self.DUMMY_HASH


class JoseTokenIssuer:
    """Implements the TokenIssuer port with JWT. Access tokens last 15 minutes,
    refresh tokens 7 days."""

    def __init__(self, secret: str, algorithm: str, access_ttl_min: int, refresh_ttl_days: int) -> None:
        self._secret = secret
        self._algorithm = algorithm
        self._access_ttl = timedelta(minutes=access_ttl_min)
        self._refresh_ttl = timedelta(days=refresh_ttl_days)

    def emitir_access_token(self, subject_id: UUID, role: str, extra: dict[str, str]) -> str:
        now = datetime.now(timezone.utc)
        payload = {
            "sub": str(subject_id),
            "role": role,
            "type": "access",
            "iat": now,
            "exp": now + self._access_ttl,
            **extra,
        }
        return jwt.encode(payload, self._secret, algorithm=self._algorithm)

    def emitir_refresh_token(self, subject_id: UUID, role: str) -> tuple[str, str]:
        now = datetime.now(timezone.utc)
        jti = str(uuid.uuid4())
        payload = {
            "sub": str(subject_id),
            "role": role,
            "type": "refresh",
            "jti": jti,
            "iat": now,
            "exp": now + self._refresh_ttl,
        }
        return jwt.encode(payload, self._secret, algorithm=self._algorithm), jti

    def decodificar(self, token: str) -> dict[str, object]:
        try:
            payload: dict[str, object] = jwt.decode(token, self._secret, algorithms=[self._algorithm])
        except JWTError as exc:
            raise InvalidToken() from exc
        return payload

    @property
    def refresh_ttl_seconds(self) -> int:
        return int(self._refresh_ttl.total_seconds())
