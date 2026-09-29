#!/bin/bash
# Daily backup of the Garage buckets (logos, lesson images, avatars). A
# systemd timer runs it as the "deploy" user (see infra/systemd). Each run
# leaves one compressed file and deletes the ones older than KEEP_DAYS.
#
# The copy stays on this same server, so it covers deleted or broken files,
# not a lost disk. Copying BACKUP_DIR to another machine covers that too.
set -euo pipefail

readonly APP_DIR="${IRIS_APP_DIR:-/opt/iris}"
readonly ENV_FILE="${IRIS_ENV_FILE:-$APP_DIR/.env.production}"
readonly BACKUP_DIR="${IRIS_MEDIA_BACKUP_DIR:-/var/backups/iris-media}"
readonly KEEP_DAYS="${IRIS_MEDIA_BACKUP_KEEP_DAYS:-14}"
readonly NETWORK="${IRIS_DOCKER_NETWORK:-iris_default}"
readonly RCLONE_IMAGE="rclone/rclone:1.75.1"

log() {
    echo "iris-backup-media: $*"
}

setting() {
    local value
    value="$(grep -E "^$1=" "$ENV_FILE" | cut -d= -f2-)"
    [[ -n "$value" ]] || { log "missing $1 in $ENV_FILE"; exit 1; }
    echo "$value"
}

# The work folder lives next to the backups, not in /tmp: the systemd unit
# has its own private /tmp that Docker can't see.
umask 077
work="$(mktemp -d "$BACKUP_DIR/.work-XXXXXX")"
trap 'rm -rf "$work"' EXIT

# The admin key goes in a file only this user can read, never on the
# command line, where other users could see it with ps.
cat > "$work/rclone.env" <<EOF
RCLONE_CONFIG_GARAGE_TYPE=s3
RCLONE_CONFIG_GARAGE_PROVIDER=Other
RCLONE_CONFIG_GARAGE_ENDPOINT=http://garage:3900
RCLONE_CONFIG_GARAGE_REGION=$(setting S3_REGION)
RCLONE_CONFIG_GARAGE_FORCE_PATH_STYLE=true
RCLONE_CONFIG_GARAGE_ACCESS_KEY_ID=$(setting STORAGE_ADMIN_ACCESS_KEY)
RCLONE_CONFIG_GARAGE_SECRET_ACCESS_KEY=$(setting STORAGE_ADMIN_SECRET_KEY)
EOF
mkdir "$work/files"

for bucket in "$(setting CLASSROOM_S3_BUCKET)" "$(setting CONTENT_S3_BUCKET)" "$(setting IDENTITY_S3_BUCKET)"; do
    docker run --rm --network "$NETWORK" --env-file "$work/rclone.env" \
        --user "$(id -u):$(id -g)" -e HOME=/backup -v "$work/files:/backup" \
        "$RCLONE_IMAGE" copy "garage:$bucket" "/backup/$bucket" --quiet
done

# Written under a temporary name first, so a half written file never looks
# like a finished backup.
cd "$BACKUP_DIR"
name="media-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
tar -czf "$name.partial" -C "$work/files" .
mv "$name.partial" "$name"
find . -maxdepth 1 -name 'media-*.tar.gz' -mtime +"$KEEP_DAYS" -delete

log "saved $name ($(du -h "$name" | cut -f1))"
