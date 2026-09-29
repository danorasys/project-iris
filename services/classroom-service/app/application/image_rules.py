# What counts as a valid uploaded image. The browser says which type it is,
# but that's just a header anyone can fake, so the first bytes of the file
# have to match it too.

from __future__ import annotations

# SVG is left out on purpose: it can carry a <script> tag.
EXTENSION_BY_CONTENT_TYPE = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif"}


def matches_declared_type(content_type: str, content: bytes) -> bool:
    if content_type == "image/png":
        return content.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "image/jpeg":
        return content.startswith(b"\xff\xd8\xff")
    if content_type == "image/gif":
        return content.startswith((b"GIF87a", b"GIF89a"))
    if content_type == "image/webp":
        return content[:4] == b"RIFF" and content[8:12] == b"WEBP"
    return False
