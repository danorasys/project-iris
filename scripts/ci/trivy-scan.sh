#!/bin/bash
# Scans one image with the shared rules of trivy.yaml. The workflows and the
# local script both call this, so a scan gives the same answer everywhere.
#
#   scripts/ci/trivy-scan.sh ghcr.io/danorasys/project-iris/web@sha256:...
#   scripts/ci/trivy-scan.sh iris-web:local
#   scripts/ci/trivy-scan.sh iris-web:local report.sarif
#
# With a second argument it also writes a full report (every severity, fixed
# or not) as SARIF, the format the GitHub Security tab reads. That report
# never fails the run, only the scan with the trivy.yaml rules does.
# For private registries set TRIVY_USERNAME and TRIVY_PASSWORD first.
set -euo pipefail

readonly TRIVY_IMAGE="aquasec/trivy:0.74.0"

if [[ $# -lt 1 || $# -gt 2 ]]; then
    echo "Usage: $0 <image-ref> [report.sarif]" >&2
    exit 2
fi
image_ref="$1"
sarif_path="${2:-}"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# Git Bash on Windows rewrites paths like /config, so that is turned off and
# host folders are passed to Docker in Windows form.
host_path() {
    if [[ "$(uname -s)" == MINGW* ]]; then (cd "$1" && pwd -W); else (cd "$1" && pwd); fi
}
if [[ "$(uname -s)" == MINGW* ]]; then
    export MSYS_NO_PATHCONV=1
fi
root="$(host_path "$root")"

# Credentials go in only when both are set. Passing them by name keeps the
# value out of the process list.
auth=()
if [[ -n "${TRIVY_USERNAME:-}" && -n "${TRIVY_PASSWORD:-}" ]]; then
    auth=(-e TRIVY_USERNAME -e TRIVY_PASSWORD)
fi

# The docker socket lets it scan images that were only built locally, the
# named volume keeps the vulnerability database between runs.
trivy() {
    docker run --rm \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -v trivy-cache:/root/.cache \
        -v "$root/trivy.yaml:/config/trivy.yaml:ro" \
        -v "$root/.trivyignore.yaml:/config/.trivyignore.yaml:ro" \
        "${auth[@]}" \
        "$@"
}

# The report goes first, so it exists even when the scan below fails.
# Trivy runs twice on purpose: "trivy convert" can not apply ignore-unfixed,
# so the blocking rules can not come from the saved report.
db_flags=()
if [[ -n "$sarif_path" ]]; then
    out_dir="$(dirname "$sarif_path")"
    mkdir -p "$out_dir"
    trivy -v "$(host_path "$out_dir"):/out" "$TRIVY_IMAGE" image --config /config/trivy.yaml \
        --severity UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL --ignore-unfixed=false --exit-code 0 \
        --format sarif --output "/out/$(basename "$sarif_path")" --quiet "$image_ref"
    # The second run keeps the database the report used, so both judge the
    # image with exactly the same data.
    db_flags=(--skip-db-update --skip-java-db-update)
fi

trivy "$TRIVY_IMAGE" image --config /config/trivy.yaml --no-progress "${db_flags[@]}" "$image_ref"
