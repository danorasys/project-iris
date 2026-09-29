# Signs downloads of the avatar images in Garage (S3 compatible) for Caddy.
# identity-service only reads: its key has no write permission, new avatars
# are uploaded by an administrator.

from __future__ import annotations

from urllib.parse import quote

from botocore.auth import S3SigV4Auth
from botocore.awsrequest import AWSRequest
from botocore.credentials import Credentials

from app.domain.entities import SignedDownload


class S3ObjectStorage:
    def __init__(self, endpoint_url: str, access_key: str, secret_key: str, bucket: str, region: str) -> None:
        self._bucket = bucket
        # Caddy fetches from this same address (garage:3900), and the
        # signature covers the host, so both have to match.
        self._endpoint_url = endpoint_url.rstrip("/")
        self._region = region
        self._credentials = Credentials(access_key, secret_key)

    def sign_download(self, key: str) -> SignedDownload:
        path = f"/{self._bucket}/{quote(key)}"
        request = AWSRequest(method="GET", url=f"{self._endpoint_url}{path}")
        S3SigV4Auth(self._credentials, "s3", self._region).add_auth(request)
        # Caddy has to send back exactly what botocore signed. Over plain http
        # that is the hash of the empty body, not UNSIGNED-PAYLOAD.
        return SignedDownload(
            path=path,
            authorization=request.headers["Authorization"],
            amz_date=request.headers["X-Amz-Date"],
            content_sha256=request.headers["X-Amz-Content-SHA256"],
        )
