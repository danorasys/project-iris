from __future__ import annotations

import base64
import uuid
from datetime import datetime, timedelta, timezone
from io import BytesIO
from uuid import UUID

import bcrypt
import pyotp
import qrcode  # type: ignore[import-untyped]  # no bundled type stubs
import jwt
from cryptography.fernet import Fernet, InvalidToken as InvalidFernetToken

from app.domain.exceptions import InvalidToken


# Implements the PasswordHasher port. Used for both guardian/teacher
# passwords and the student PIN. Hashed the same way, never stored plain.
class BcryptPasswordHasher:
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


# Implements the TokenIssuer port with JWT (PyJWT). Access tokens last 15
# minutes, refresh tokens 7 days.
class JwtTokenIssuer:
    def __init__(self, secret: str, algorithm: str, access_ttl_min: int, refresh_ttl_days: int) -> None:
        self._secret = secret
        self._algorithm = algorithm
        self._access_ttl = timedelta(minutes=access_ttl_min)
        self._refresh_ttl = timedelta(days=refresh_ttl_days)

    def emitir_access_token(self, subject_id: UUID, role: str, extra: dict[str, str], sid: str) -> str:
        now = datetime.now(timezone.utc)
        payload = {
            "sub": str(subject_id),
            "role": role,
            "type": "access",
            "sid": sid,
            "iat": now,
            "exp": now + self._access_ttl,
            **extra,
        }
        return jwt.encode(payload, self._secret, algorithm=self._algorithm)

    def emitir_refresh_token(self, subject_id: UUID, role: str, sid: str) -> tuple[str, str]:
        now = datetime.now(timezone.utc)
        jti = str(uuid.uuid4())
        payload = {
            "sub": str(subject_id),
            "role": role,
            "type": "refresh",
            "sid": sid,
            "jti": jti,
            "iat": now,
            "exp": now + self._refresh_ttl,
        }
        return jwt.encode(payload, self._secret, algorithm=self._algorithm), jti

    def decodificar(self, token: str) -> dict[str, object]:
        # Only our algorithm is accepted, and a token without an expiry, issue
        # date or subject is rejected even if the signature is fine.
        try:
            payload: dict[str, object] = jwt.decode(
                token,
                self._secret,
                algorithms=[self._algorithm],
                options={"require": ["exp", "iat", "sub"]},
            )
        except jwt.PyJWTError as exc:
            raise InvalidToken() from exc
        return payload

    @property
    def refresh_ttl_seconds(self) -> int:
        return int(self._refresh_ttl.total_seconds())


# Implements the TotpProvider port with pyotp (RFC 6238) and qrcode.
# Any authenticator app that follows that standard (Google Authenticator,
# Microsoft Authenticator, Authy, 1Password...) can scan what this makes,
# nothing here is tied to one vendor.
class PyotpTotpProvider:
    def generar_secreto(self) -> str:
        return pyotp.random_base32()

    def uri_aprovisionamiento(self, secreto: str, nombre_cuenta: str, emisor: str) -> str:
        return pyotp.TOTP(secreto).provisioning_uri(name=nombre_cuenta, issuer_name=emisor)

    def verificar(self, secreto: str, codigo: str, ventana: int) -> bool:
        return pyotp.TOTP(secreto).verify(codigo, valid_window=ventana)

    def codigo_qr_base64(self, uri_aprovisionamiento: str) -> str:
        img = qrcode.make(uri_aprovisionamiento)
        buffer = BytesIO()
        img.save(buffer, format="PNG")
        encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
        return f"data:image/png;base64,{encoded}"


# Implements the TotpEncryptor port. Encrypted, not hashed: unlike a password
# or PIN, the TOTP secret has to be read back to work out the code the app
# should be showing.
class FernetTotpEncryptor:
    def __init__(self, key: str) -> None:
        self._fernet = Fernet(key.encode("utf-8"))

    def encrypt(self, valor_plano: str) -> str:
        return self._fernet.encrypt(valor_plano.encode("utf-8")).decode("utf-8")

    def decrypt(self, valor_cifrado: str) -> str:
        try:
            return self._fernet.decrypt(valor_cifrado.encode("utf-8")).decode("utf-8")
        except InvalidFernetToken as exc:
            raise InvalidToken("No fue posible leer el secreto TOTP almacenado.") from exc
