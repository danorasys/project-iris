#!/bin/bash
# Forced command for the "deploy" user's SSH key (see ~deploy/.ssh/authorized_keys
# on the VPS and the "deploy" job in .github/workflows/ci.yml). The SSH client
# (GitHub Actions) requests to run "<git-sha>" as a command, but the
# authorized_keys entry ignores that and always runs this script instead —
# the requested command survives in $SSH_ORIGINAL_COMMAND, which is the only
# thing this script trusts it for: picking which image tag to pull.
set -euo pipefail

TAG="${SSH_ORIGINAL_COMMAND:-latest}"
if ! [[ "$TAG" =~ ^([0-9a-f]{40}|latest)$ ]]; then
    echo "Invalid tag requested: $TAG" >&2
    exit 1
fi

cd /opt/iris
git pull --ff-only

export IMAGE_TAG="$TAG"
docker compose -f docker-compose.prod.yml --env-file .env.production pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
docker image prune -af --filter "until=72h"

for _ in $(seq 1 10); do
    if curl -fsS https://iris.bucaramanga.upb.edu.co/api/health/live > /dev/null; then
        echo "Deploy OK, tag=$TAG"
        exit 0
    fi
    sleep 3
done

echo "Health check failed after deploying tag=$TAG" >&2
exit 1
