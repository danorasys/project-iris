#!/bin/bash
# Checks our Dockerfiles for risky settings (running as root, secrets in a
# layer, ADD from a URL and so on) with the same rules of trivy.yaml. The CI
# runs it on every change and it works the same on your machine.
set -euo pipefail

readonly TRIVY_IMAGE="aquasec/trivy:0.74.0"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"
if [[ "$(uname -s)" == MINGW* ]]; then
    export MSYS_NO_PATHCONV=1
    root="$(pwd -W)"
fi

# Each Dockerfile on its own, scanning whole folders would also walk local
# virtualenvs and node_modules and take minutes.
failed=0
for dockerfile in apps/web/Dockerfile services/*/Dockerfile; do
    echo "== $dockerfile"
    docker run --rm \
        -v "$root:/repo:ro" \
        -v trivy-cache:/root/.cache \
        -v "$root/trivy.yaml:/config/trivy.yaml:ro" \
        -v "$root/.trivyignore.yaml:/config/.trivyignore.yaml:ro" \
        "$TRIVY_IMAGE" config --config /config/trivy.yaml --quiet \
        --misconfig-scanners dockerfile "/repo/$dockerfile" || failed=1
done
exit "$failed"
