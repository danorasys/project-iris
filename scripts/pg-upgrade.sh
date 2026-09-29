#!/bin/bash
# Moves the IRIS Postgres data to a new major version (dump and restore).
# The old volume is never touched, so going back is just deploying the
# previous release again.
#
#   bash scripts/pg-upgrade.sh --env-file .env.production
#
# Before, in the repo: the change that moves the compose files to the new
# image also sets infra/postgres/MAJOR to the new major (the CI stays red
# until both match) and the defaults below, then it is released as usual.
#
# Steps on the server (the release with the new Postgres is NOT marked as
# latest yet, or the auto deploy would start it on an empty volume):
#   1. sudo systemctl stop iris-deploy.timer
#   2. sudo -u deploy git -C /opt/iris fetch --tags
#      sudo -u deploy git -C /opt/iris checkout --detach vX.Y.Z
#   3. docker stop $(docker ps -q --filter label=com.docker.compose.project=iris)
#   4. cd /opt/iris && sudo -u deploy bash scripts/pg-upgrade.sh --env-file .env.production
#   5. Mark vX.Y.Z as latest on GitHub, then
#      sudo systemctl start iris-deploy.service   (deploys and health checks)
#      sudo systemctl start iris-deploy.timer
#   If something fails, mark the previous release as latest and start the
#   timer again. It still uses the old volume.
#
# Options (defaults in brackets):
#   --env-file FILE      where POSTGRES_USER and POSTGRES_PASSWORD are [.env]
#   --from-volume NAME   volume with the current data [iris_pgdata]
#   --to-volume NAME     new volume, must not exist yet [iris_postgres-data]
#   --from-image IMAGE   current version [postgres:16-alpine]
#   --to-image IMAGE     new version [postgres:18-alpine]
#   --backup-dir DIR     where the dump is kept [$HOME/iris-backups]
set -euo pipefail

env_file=".env"
from_volume="iris_pgdata"
to_volume="iris_postgres-data"
from_image="postgres:16-alpine"
to_image="postgres:18-alpine"
backup_dir="$HOME/iris-backups"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --env-file) env_file="$2"; shift 2 ;;
        --from-volume) from_volume="$2"; shift 2 ;;
        --to-volume) to_volume="$2"; shift 2 ;;
        --from-image) from_image="$2"; shift 2 ;;
        --to-image) to_image="$2"; shift 2 ;;
        --backup-dir) backup_dir="$2"; shift 2 ;;
        *) echo "Unknown option: $1" >&2; exit 2 ;;
    esac
done

readonly old_box="iris-pg-upgrade-old"
readonly new_box="iris-pg-upgrade-new"
readonly copy_volume="iris-pg-upgrade-copy"
readonly databases=(identity_db classroom_db content_db notification_db)

log() { echo "pg-upgrade: $*"; }
fail() { echo "pg-upgrade: ERROR: $*" >&2; exit 1; }

# --- checks before touching anything ---

[[ -f "$env_file" ]] || fail "env file $env_file not found"
docker volume inspect "$from_volume" >/dev/null 2>&1 || fail "volume $from_volume does not exist"
if docker volume inspect "$to_volume" >/dev/null 2>&1; then
    fail "volume $to_volume already exists, refusing to overwrite it"
fi
# Nobody may be writing while we copy, or the copy would miss those writes.
if [[ -n "$(docker ps -q --filter "volume=$from_volume")" ]]; then
    fail "a running container still uses $from_volume, stop the stack first"
fi

# Only the two values Postgres needs go to the temporary containers, in a
# private file that is removed on exit. The password is never printed.
creds="$(mktemp)"
chmod 600 "$creds"
cleanup() {
    docker rm -f "$old_box" "$new_box" >/dev/null 2>&1 || true
    docker volume rm "$copy_volume" >/dev/null 2>&1 || true
    rm -f "$creds"
}
trap cleanup EXIT
grep -E '^(POSTGRES_USER|POSTGRES_PASSWORD)=' "$env_file" >"$creds" || true
[[ "$(wc -l <"$creds")" -eq 2 ]] || fail "$env_file must define POSTGRES_USER and POSTGRES_PASSWORD"
pg_user="$(grep '^POSTGRES_USER=' "$creds" | cut -d= -f2-)"
# Docker Desktop on Windows needs the Windows form of the temporary path.
creds_for_docker="$creds"
if [[ "$(uname -s)" == MINGW* ]]; then
    export MSYS_NO_PATHCONV=1
    creds_for_docker="$(cygpath -w "$creds")"
fi

mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
backup="$backup_dir/pg-upgrade-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"

# Starts a throwaway Postgres with no network at all and waits until it answers.
start_box() {
    local name="$1" image="$2" mount="$3"
    docker run -d --name "$name" --network none --env-file "$creds_for_docker" -v "$mount" "$image" >/dev/null
    for _ in $(seq 1 60); do
        if docker exec "$name" pg_isready -U "$pg_user" -q 2>/dev/null; then return 0; fi
        sleep 1
    done
    fail "$name did not start, see: docker logs $name"
}

# Exact row count of every table, one "db.schema.table=count" per line.
row_counts() {
    local box="$1" db
    for db in "${databases[@]}"; do
        docker exec -i "$box" psql -U "$pg_user" -d "$db" -Atq <<'SQL'
SELECT current_database() || '.' || table_schema || '.' || table_name
       || '=' || (xpath('/row/n/text()',
                  query_to_xml(format('SELECT count(*) AS n FROM %I.%I', table_schema, table_name),
                               false, true, '')))[1]::text
FROM information_schema.tables
WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY 1;
SQL
    done
}

# --- 1. dump the current data ---

# Postgres writes a lock file when it starts, even just to read, so it runs on
# a copy of the old volume. The original is only ever mounted read only.
log "copying $from_volume to a temporary volume"
docker volume rm "$copy_volume" >/dev/null 2>&1 || true
docker run --rm --network none --entrypoint cp \
    -v "$from_volume:/from:ro" -v "$copy_volume:/to" "$from_image" -a /from/. /to/

log "starting $from_image on the copy"
# The 16 image keeps its data in /var/lib/postgresql/data.
start_box "$old_box" "$from_image" "$copy_volume:/var/lib/postgresql/data"
old_counts="$(row_counts "$old_box")"

log "dumping everything to $backup"
docker exec "$old_box" pg_dumpall -U "$pg_user" | gzip >"$backup"
chmod 600 "$backup"
gzip -t "$backup" || fail "the backup is not a valid gzip file"
for db in "${databases[@]}"; do
    gzip -dc "$backup" | grep -q "^\\\\connect.* $db\$" || fail "the backup has no data for $db"
done
docker rm -f "$old_box" >/dev/null
docker volume rm "$copy_volume" >/dev/null

# --- 2. restore into the new version ---

# Labels make docker compose treat the volume as its own later on.
docker volume create \
    --label com.docker.compose.project="${to_volume%%_*}" \
    --label com.docker.compose.volume="${to_volume#*_}" \
    "$to_volume" >/dev/null
log "starting $to_image on the new volume $to_volume"
# From 18 on the image keeps its data under /var/lib/postgresql/<version>.
start_box "$new_box" "$to_image" "$to_volume:/var/lib/postgresql"

log "restoring"
restore_log="$(gzip -dc "$backup" | docker exec -i "$new_box" psql -U "$pg_user" -d postgres -q 2>&1 >/dev/null || true)"
# A fresh cluster already has the admin role and a database with its name, so
# those two errors are expected. Anything else stops the upgrade.
unexpected="$(grep 'ERROR' <<<"$restore_log" \
    | grep -v -e "role \"$pg_user\" already exists" -e "database \"$pg_user\" already exists" || true)"
[[ -z "$unexpected" ]] || fail "restore had errors, $to_volume is left for inspection:
$unexpected"

# --- 3. compare ---

new_counts="$(row_counts "$new_box")"
if [[ "$old_counts" != "$new_counts" ]]; then
    diff <(echo "$old_counts") <(echo "$new_counts") >&2 || true
    fail "row counts do not match, $to_volume is left for inspection"
fi

version="$(docker exec "$new_box" psql -U "$pg_user" -d postgres -Atc 'SHOW server_version')"
log "OK: $(wc -l <<<"$new_counts") tables copied with the same row counts to Postgres $version"
log "backup kept at $backup, the old volume $from_volume is untouched"
