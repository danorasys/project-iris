# S3/MinIO object storage.
#
# boto3 is synchronous, so it runs in a separate thread via asyncio.to_thread
# to avoid blocking the event loop. Tests use tests.fakes.FakeObjectStorage via
# dependency_overrides, there's no MinIO in this dev setup.
#
# The bucket is private. This adapter never builds public URLs, images are
# read back here and served by the API after an access check.

from __future__ import annotations

import asyncio

import boto3
from botocore.exceptions import ClientError

from app.domain.entities import StoredObject

# What S3/MinIO answer when the key isn't there.
_MISSING_KEY_CODES = {"NoSuchKey", "404", "NotFound"}


class S3ObjectStorage:
    def __init__(
        self,
        endpoint_url: str,
        access_key: str,
        secret_key: str,
        bucket: str,
        region: str,
    ) -> None:
        self._bucket = bucket
        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
        )

    async def upload(self, key: str, content: bytes, content_type: str) -> None:
        await asyncio.to_thread(
            self._client.put_object,
            Bucket=self._bucket,
            Key=key,
            Body=content,
            ContentType=content_type,
        )

    async def download(self, key: str) -> StoredObject | None:
        return await asyncio.to_thread(self._download_sync, key)

    def _download_sync(self, key: str) -> StoredObject | None:
        try:
            response = self._client.get_object(Bucket=self._bucket, Key=key)
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in _MISSING_KEY_CODES:
                return None
            raise
        body = response["Body"]
        try:
            content = body.read()
        finally:
            body.close()
        return StoredObject(content=content, content_type=response.get("ContentType", "application/octet-stream"))
