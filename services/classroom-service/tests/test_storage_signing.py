# Checks the signature the adapter builds for Caddy. That Garage really
# accepts it is checked end to end against the real stack.

from __future__ import annotations

import re

from app.infrastructure.storage import S3ObjectStorage


def _storage() -> S3ObjectStorage:
    return S3ObjectStorage(
        endpoint_url="http://garage:3900/", access_key="GKtest", secret_key="secret", bucket="iris-test",
        region="us-east-1",
    )


def test_signs_a_get_of_the_key_in_the_bucket() -> None:
    signed = _storage().sign_download("folder/file.png")

    assert signed.path == "/iris-test/folder/file.png"
    # Hash of the empty body, what Garage checks against the signature.
    assert signed.content_sha256 == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    assert re.fullmatch(r"\d{8}T\d{6}Z", signed.amz_date)
    # Scoped to this key, region and S3, and covering the host Caddy uses.
    assert signed.authorization.startswith(f"AWS4-HMAC-SHA256 Credential=GKtest/{signed.amz_date[:8]}/us-east-1/s3/")
    assert "SignedHeaders=host;x-amz-content-sha256;x-amz-date" in signed.authorization
    assert re.search(r"Signature=[0-9a-f]{64}$", signed.authorization)


def test_odd_characters_in_the_key_are_escaped_in_the_path() -> None:
    signed = _storage().sign_download("folder/my file?.png")

    assert signed.path == "/iris-test/folder/my%20file%3F.png"
