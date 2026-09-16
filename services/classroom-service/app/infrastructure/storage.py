# Implements the ObjectStorage port with boto3 against S3/MinIO.
#
# boto3 is synchronous, so it runs in a separate thread via asyncio.to_thread
# to avoid blocking the event loop.

from __future__ import annotations

import asyncio

import boto3
from botocore.client import Config


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
            config=Config(signature_version="s3v4"),
        )

    async def subir(self, key: str, contenido: bytes, content_type: str) -> str:
        await asyncio.to_thread(
            self._client.put_object,
            Bucket=self._bucket,
            Key=key,
            Body=contenido,
            ContentType=content_type,
        )
        return f"{self._public_url}/{self._bucket}/{key}"
