"""S3/MinIO object storage.

boto3 is synchronous, so it runs in a separate thread via asyncio.to_thread
to avoid blocking the event loop. Tests use tests.fakes.FakeObjectStorage via
dependency_overrides, there's no MinIO in this dev setup."""

from __future__ import annotations

import asyncio
from uuid import UUID, uuid4

import boto3


class S3ObjectStorage:
    def __init__(
        self,
        endpoint_url: str,
        access_key: str,
        secret_key: str,
        bucket: str,
        region: str,
        public_url: str,
    ) -> None:
        self._bucket = bucket
        self._public_url = public_url.rstrip("/")
        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
        )

    async def upload_image(self, lesson_id: UUID, file_name: str, content_type: str, content: bytes) -> str:
        extension = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else "bin"
        key = f"lessons/{lesson_id}/images/{uuid4().hex}.{extension}"
        await asyncio.to_thread(
            self._client.put_object,
            Bucket=self._bucket,
            Key=key,
            Body=content,
            ContentType=content_type,
        )
        return f"{self._public_url}/{self._bucket}/{key}"
