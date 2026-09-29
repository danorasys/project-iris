#!/bin/sh
# Copies the files of an install that used MinIO into the bucket of the
# service that owns them. It runs once (see docs/deployment.md). The paths
# inside each bucket don't change, so the database stays the same.
set -eu

mc alias set old http://minio:9000 "$LEGACY_MINIO_ACCESS_KEY" "$LEGACY_MINIO_SECRET_KEY" >/dev/null
mc alias set new http://garage:3900 "$STORAGE_ADMIN_ACCESS_KEY" "$STORAGE_ADMIN_SECRET_KEY" --api S3v4 --path on >/dev/null

# Copies a folder only if it exists and has something in it.
copy() {
    if [ -n "$(mc ls "old/$1/" 2>/dev/null)" ]; then
        mc mirror --overwrite "old/$1" "new/$2"
    else
        echo "media-migrate: nothing to copy in $1"
    fi
}

copy "$LEGACY_MINIO_BUCKET/classrooms" "$CLASSROOM_S3_BUCKET/classrooms"
copy "$LEGACY_MINIO_BUCKET/lessons" "$CONTENT_S3_BUCKET/lessons"
# The avatars were first in the main bucket and later in a public one.
copy "$LEGACY_MINIO_BUCKET/avatars" "$IDENTITY_S3_BUCKET/avatars"
if [ -n "${LEGACY_MINIO_PUBLIC_BUCKET:-}" ]; then
    copy "$LEGACY_MINIO_PUBLIC_BUCKET/avatars" "$IDENTITY_S3_BUCKET/avatars"
fi
echo "media-migrate: done"
