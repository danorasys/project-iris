#!/bin/bash
# Forced command of the "deploy" SSH key. The CI sends a commit SHA and sshd
# hands it to this script in SSH_ORIGINAL_COMMAND. Nothing else is trusted.
set -euo pipefail

main() {
    local tag="${SSH_ORIGINAL_COMMAND:-latest}"
    if ! [[ "$tag" =~ ^([0-9a-f]{40}|latest)$ ]]; then
        echo "Invalid tag: $tag" >&2
        return 1
    fi

    cd /opt/iris
    git fetch --quiet origin

    # Use the same commit as the images, so a rollback also gets the compose
    # file that matches them.
    if [[ "$tag" == "latest" ]]; then
        git checkout --quiet main
        git merge --ff-only --quiet origin/main
    else
        git checkout --quiet --detach "$tag"
    fi

    export IMAGE_TAG="$tag"
    local compose=(docker compose -f docker-compose.prod.yml --env-file .env.production)
    "${compose[@]}" pull
    "${compose[@]}" up -d --wait --wait-timeout 180
    docker image prune -af --filter "until=72h"

    echo "Deploy OK, tag=$tag"
}

# Same line on purpose: bash reads the file as it runs, and git may replace
# this script during the checkout above.
main; exit $?
