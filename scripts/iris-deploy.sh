#!/bin/bash
# Pull based deploy. A systemd timer runs this every few minutes as the
# "deploy" user (see infra/systemd). Nothing connects to the server: it asks
# GitHub which release is the latest one and, if it is new, deploys it.
#
# The release has to be marked as "latest" by a person, and its images have
# to be signed by our release workflow. If the new version does not come up
# healthy, the previous one is started again.
set -euo pipefail

readonly REPO="${IRIS_REPO:-danorasys/project-iris}"
readonly APP_DIR="${IRIS_APP_DIR:-/opt/iris}"
# Same as "name:" in docker-compose.prod.yml. It's how the script finds the
# containers and the network of IRIS, so both have to match.
readonly PROJECT="iris"
readonly STATE_DIR="${IRIS_STATE_DIR:-/var/lib/iris-deploy}"
readonly IMAGE_PREFIX="ghcr.io/${REPO}"
readonly SERVICES=(identity-service classroom-service content-service notification-service api-gateway web)
# Services of docker-compose.prod.yml, split by who builds the image.
readonly APP_SERVICES=("${SERVICES[@]}")
readonly THIRD_PARTY_SERVICES=(postgres redis garage garage-volume garage-init reverse-proxy)
readonly TAG_PATTERN='^v[0-9]+\.[0-9]+\.[0-9]+$'
readonly OIDC_ISSUER="https://token.actions.githubusercontent.com"

log() {
    echo "iris-deploy: $*"
}

# Optional, a Discord style webhook set in /etc/iris-deploy.env.
notify() {
    [[ -n "${IRIS_NOTIFY_URL:-}" ]] || return 0
    curl -fsS --max-time 10 -H 'Content-Type: application/json' \
        -d "{\"content\": \"IRIS deploy: $1\"}" "$IRIS_NOTIFY_URL" >/dev/null || true
}

read_state() {
    local file="$STATE_DIR/$1"
    if [[ -f "$file" ]]; then cat "$file"; fi
}

# The latest release that is not a pre-release or a draft.
latest_release_tag() {
    curl -fs --max-time 20 -H 'Accept: application/vnd.github+json' \
        "https://api.github.com/repos/${REPO}/releases/latest" | jq -r '.tag_name'
}

# Every image must be signed by the release workflow of this repo, for this
# exact tag. An image built anywhere else fails here.
verify_images() {
    local tag="$1" service
    for service in "${SERVICES[@]}"; do
        cosign verify "${IMAGE_PREFIX}/${service}:${tag}" \
            --certificate-identity "https://github.com/${REPO}/.github/workflows/release.yml@refs/tags/${tag}" \
            --certificate-oidc-issuer "$OIDC_ISSUER" >/dev/null 2>&1 || {
            log "signature check failed for ${service}:${tag}"
            return 1
        }
    done
}

# The compose file and the Caddyfile come from the same tag as the images.
checkout_tag() {
    git -C "$APP_DIR" fetch --quiet --tags --force origin
    git -C "$APP_DIR" checkout --quiet --detach "refs/tags/$1"
}

compose() {
    docker compose -p "$PROJECT" -f "$APP_DIR/docker-compose.prod.yml" --env-file "$APP_DIR/.env.production" "$@"
}

# Containers of the project that this version doesn't start: services that
# were removed or moved to a profile, and orphans. If they stay running they
# keep the network busy, and compose can't recreate it when its settings
# change (that once left the whole site down). The data is in volumes, so
# removing the containers loses nothing.
remove_stray_containers() {
    local active name service
    active=$(compose config --services) || return 1
    while read -r name service; do
        [[ -n "$name" ]] || continue
        grep -qxF "$service" <<<"$active" && continue
        log "removing ${name}, it is not part of this version"
        docker stop -t 30 "$name" >/dev/null && docker rm "$name" >/dev/null || return 1
    done < <(docker ps -a --filter "label=com.docker.compose.project=${PROJECT}" \
        --format '{{.Names}} {{.Label "com.docker.compose.service"}}')
}

# Removes every container of the project and its network, so the next
# start is from scratch. Volumes (the data) are never touched. Postgres
# gets time to close cleanly.
reset_project() {
    local ids
    mapfile -t ids < <(docker ps -aq --filter "label=com.docker.compose.project=${PROJECT}")
    if ((${#ids[@]} > 0)); then
        docker stop -t 60 "${ids[@]}" >/dev/null || return 1
        docker rm "${ids[@]}" >/dev/null || return 1
    fi
    docker network rm "${PROJECT}_default" >/dev/null 2>&1 || true
}

# The deploy and backup scripts and their units are copies installed by
# install.sh, the deploy user can't change what it runs. This only warns
# when the deployed release brings new versions of them.
check_installed_copies() {
    local tag="$1" pair stale=()
    # Same files install.sh installs, keep both lists in sync.
    local pairs=(
        "scripts/iris-deploy.sh:/usr/local/sbin/iris-deploy"
        "scripts/iris-backup-media.sh:/usr/local/sbin/iris-backup-media"
        "infra/systemd/iris-deploy.service:/etc/systemd/system/iris-deploy.service"
        "infra/systemd/iris-deploy.timer:/etc/systemd/system/iris-deploy.timer"
        "infra/systemd/iris-backup-media.service:/etc/systemd/system/iris-backup-media.service"
        "infra/systemd/iris-backup-media.timer:/etc/systemd/system/iris-backup-media.timer"
    )
    for pair in "${pairs[@]}"; do
        cmp -s "$APP_DIR/${pair%%:*}" "${pair#*:}" || stale+=("${pair#*:}")
    done
    ((${#stale[@]} == 0)) && return 0
    log "${tag} brings new versions of: ${stale[*]}"
    log "install them with: sudo bash ${APP_DIR}/infra/systemd/install.sh"
    notify "${tag} changes how the server deploys or backs up. Run on the server: sudo bash ${APP_DIR}/infra/systemd/install.sh"
}

# Containers healthy, then the site through Caddy and the gateway readiness.
health_check() {
    local domain
    domain=$(grep -E '^DOMAIN=' "$APP_DIR/.env.production" | cut -d= -f2-)
    for _ in $(seq 1 12); do
        if curl -fsS --max-time 5 -o /dev/null --resolve "${domain}:443:127.0.0.1" "https://${domain}/" &&
            compose exec -T api-gateway python -c \
                "import urllib.request; urllib.request.urlopen('http://localhost:8000/health/ready')" >/dev/null 2>&1; then
            return 0
        fi
        sleep 5
    done
    return 1
}

# Starts the containers of the checked out version. Stray containers go
# first, and if the start fails it is tried once more from scratch.
start_containers() {
    local tag="$1"
    remove_stray_containers || return 1
    if ! compose up -d --wait --wait-timeout 180 --remove-orphans; then
        # Some changes, like the network settings, can't be applied on top of
        # the running containers and leave them half connected. One more try
        # from clean containers.
        log "start failed, trying ${tag} again from clean containers"
        reset_project || return 1
        compose up -d --wait --wait-timeout 180 --remove-orphans || return 1
    fi
}

# Starts the given version and waits until it is healthy. Every step returns
# on its own because this runs inside an "if", where "set -e" does not apply.
apply_version() {
    local tag="$1"
    checkout_tag "$tag" || return 1
    export IMAGE_TAG="$tag"
    # Our images must download, they are the release. Third party images are
    # only refreshed when their registry answers: if it doesn't, the copy the
    # server already has is used.
    compose pull --quiet "${APP_SERVICES[@]}" || return 1
    compose pull --quiet --ignore-pull-failures "${THIRD_PARTY_SERVICES[@]}" \
        || log "could not refresh some third party images, using the local ones"
    start_containers "$tag" || return 1
    # The Caddy files are mounted, so "up" doesn't restart Caddy when only they
    # changed. Reload them; a broken config fails here and Caddy keeps the old one.
    compose exec -T reverse-proxy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile || return 1
    health_check
}

main() {
    mkdir -p "$STATE_DIR"
    # Only one run at a time, a slow deploy must not overlap with the next tick.
    exec 9>"$STATE_DIR/lock"
    flock -n 9 || exit 0

    local desired current failed
    # A GitHub or network hiccup is not a deploy failure, try again next tick.
    desired=$(latest_release_tag) || { log "could not read the latest release"; exit 0; }
    if ! [[ "$desired" =~ $TAG_PATTERN ]]; then
        log "latest release has an unexpected tag, ignoring it"
        exit 0
    fi

    current=$(read_state current)
    failed=$(read_state failed)
    [[ "$desired" == "$current" ]] && exit 0
    # This version already failed and was rolled back, wait for a new release.
    [[ "$desired" == "$failed" ]] && exit 0

    log "new release ${desired} (running: ${current:-none})"

    # Not marked as failed: the check can fail only because Sigstore was
    # unreachable for a moment, so it is tried again on the next tick. The
    # notification goes out once per version.
    if ! verify_images "$desired"; then
        if [[ "$(read_state notified)" != "$desired" ]]; then
            notify "${desired} rejected, the images are not signed by our release workflow."
            echo "$desired" >"$STATE_DIR/notified"
        fi
        exit 1
    fi

    if apply_version "$desired"; then
        echo "$current" >"$STATE_DIR/previous"
        echo "$desired" >"$STATE_DIR/current"
        rm -f "$STATE_DIR/failed"
        # Old images stay a week so a rollback does not need to download them.
        docker image prune -af --filter "until=168h" >/dev/null
        log "deployed ${desired}"
        notify "${desired} deployed."
        check_installed_copies "$desired"
        return 0
    fi

    echo "$desired" >"$STATE_DIR/failed"
    log "${desired} did not come up healthy"
    if [[ -n "$current" ]]; then
        log "going back to ${current}"
        if apply_version "$current"; then
            notify "${desired} failed, went back to ${current}."
        else
            notify "${desired} failed and the rollback to ${current} failed too. Needs a person."
        fi
    else
        notify "${desired} failed and there is no previous version to go back to."
    fi
    return 1
}

main "$@"
