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
readonly STATE_DIR="${IRIS_STATE_DIR:-/var/lib/iris-deploy}"
readonly IMAGE_PREFIX="ghcr.io/${REPO}"
readonly SERVICES=(identity-service classroom-service content-service notification-service api-gateway web)
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
    docker compose -f "$APP_DIR/docker-compose.prod.yml" --env-file "$APP_DIR/.env.production" "$@"
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

# Starts the given version and waits until it is healthy. Every step returns
# on its own because this runs inside an "if", where "set -e" does not apply.
apply_version() {
    local tag="$1"
    checkout_tag "$tag" || return 1
    export IMAGE_TAG="$tag"
    compose pull --quiet || return 1
    compose up -d --wait --wait-timeout 180 || return 1
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
