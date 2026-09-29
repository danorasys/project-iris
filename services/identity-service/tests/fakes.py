# Test double for the storage port, so tests never need a real Garage.

from __future__ import annotations

from app.domain.entities import SignedDownload


class FakeObjectStorage:
    def sign_download(self, key: str) -> SignedDownload:
        return SignedDownload(
            path=f"/test-bucket/{key}", authorization="AWS4-HMAC-SHA256 test", amz_date="20260101T000000Z",
            content_sha256="UNSIGNED-PAYLOAD",
        )
