# Answer for an image request: an empty body plus internal headers. Caddy
# reads them, fetches the file from Garage and streams it to the browser (see
# infra/caddy/api.caddy), so the bytes never go through this service. The
# X-Iris-Media* headers never reach the browser, Caddy only copies the rest.

from __future__ import annotations

from fastapi import Response

from app.domain.entities import SignedDownload


def media_response(signed: SignedDownload, cache_control: str) -> Response:
    return Response(
        status_code=200,
        headers={
            "X-Iris-Media": signed.path,
            "X-Iris-Media-Authorization": signed.authorization,
            "X-Iris-Media-Date": signed.amz_date,
            "X-Iris-Media-Sha256": signed.content_sha256,
            "Cache-Control": cache_control,
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": "inline",
            "Content-Security-Policy": "default-src 'none'; sandbox",
        },
    )
