#!/bin/bash
# Builds the six images on your machine and scans them with the same rules
# as the CI. Handy before a push, the CI runs the same scan anyway.
#
#   scripts/ci/scan-images.sh            all images
#   scripts/ci/scan-images.sh web        only one
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

build() {
    case "$1" in
        web) docker build --pull -q -f apps/web/Dockerfile --target runtime -t "iris-$1:local" . ;;
        *) docker build --pull -q -t "iris-$1:local" "services/$1" ;;
    esac
}

services=("$@")
if [[ ${#services[@]} -eq 0 ]]; then
    services=(identity-service classroom-service content-service notification-service api-gateway web)
fi

failed=()
for service in "${services[@]}"; do
    echo "== $service"
    if ! build "$service" >/dev/null || ! scripts/ci/trivy-scan.sh "iris-$service:local"; then
        failed+=("$service")
    fi
done

if [[ ${#failed[@]} -gt 0 ]]; then
    echo "Failed: ${failed[*]}" >&2
    exit 1
fi
echo "All images passed."
