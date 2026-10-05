# Files on Garage (S3 compatible). boto3 is synchronous, so it runs in a
# thread to not block the event loop. The bucket is private: downloads are
# only signed here and Caddy serves them, after the service checked access.
# The tests use FakeObjectStorage instead.

from __future__ import annotations

import asyncio
from urllib.parse import quote

import boto3
from botocore.auth import S3SigV4Auth
from botocore.awsrequest import AWSRequest
from botocore.client import Config
from botocore.credentials import Credentials
from botocore.exceptions import ClientError

from app.domain.entities import SignedDownload
from app.domain.exceptions import StorageFull


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
        # Caddy fetches from this same address (garage:3900), and the
        # signature covers the host, so both have to match.
        self._endpoint_url = endpoint_url.rstrip("/")
        self._region = region
        self._credentials = Credentials(access_key, secret_key)
        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
            # Garage only understands path style URLs (/<bucket>/<key>).
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )

    async def upload(self, key: str, content: bytes, content_type: str) -> None:
        try:
            await asyncio.to_thread(
                self._client.put_object,
                Bucket=self._bucket,
                Key=key,
                Body=content,
                ContentType=content_type,
            )
        except ClientError as exc:
            # Garage answers a full bucket with AccessDenied, only the message
            # tells it apart from a real permission problem.
            if "quota" in exc.response.get("Error", {}).get("Message", "").lower():
                raise StorageFull() from exc
            raise

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self._client.delete_object, Bucket=self._bucket, Key=key)

    async def delete_prefix(self, prefix: str) -> None:
        await asyncio.to_thread(self._delete_prefix_sync, prefix)

    # One by one: a lesson has few images, and it works the same on every S3.
    def _delete_prefix_sync(self, prefix: str) -> None:
        paginator = self._client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self._bucket, Prefix=prefix):
            for item in page.get("Contents", []):
                self._client.delete_object(Bucket=self._bucket, Key=item["Key"])

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
