#!/bin/bash
# Deletes release candidates (images whose only tags are sha-<commit>) older
# than KEEP_DAYS from GHCR. A released image also has a vX.Y.Z tag, so it is
# never selected. Untagged versions (signatures, SBOMs) are left alone.
# Needs GH_TOKEN with packages:write. DRY_RUN=true only lists them.
set -euo pipefail

readonly KEEP_DAYS="${KEEP_DAYS:-30}"
readonly DRY_RUN="${DRY_RUN:-true}"
readonly SERVICES=(identity-service classroom-service content-service notification-service api-gateway web)

owner="${GITHUB_REPOSITORY%%/*}"
repo="${GITHUB_REPOSITORY##*/}"
# Packages live under /users or /orgs depending on who owns the repo.
if [[ "$(gh api "users/$owner" --jq .type)" == "Organization" ]]; then
    scope="orgs/$owner"
else
    scope="users/$owner"
fi
cutoff="$(date -u -d "-${KEEP_DAYS} days" +%Y-%m-%dT%H:%M:%SZ)"

total=0
for service in "${SERVICES[@]}"; do
    package="${repo}%2F${service}"
    ids=$(gh api --paginate "$scope/packages/container/$package/versions" --jq "
        .[]
        | select(.created_at < \"$cutoff\")
        | select((.metadata.container.tags | length) > 0)
        | select(all(.metadata.container.tags[]; startswith(\"sha-\")))
        | .id")

    for id in $ids; do
        total=$((total + 1))
        if [[ "$DRY_RUN" == "true" ]]; then
            echo "would delete $service version $id"
        else
            gh api --method DELETE "$scope/packages/container/$package/versions/$id" >/dev/null
            echo "deleted $service version $id"
        fi
    done
done

echo "$total old candidates $([[ "$DRY_RUN" == "true" ]] && echo "found (dry run)" || echo "deleted")."
