#!/bin/bash
# Prints the Postgres image of the compose files, so the CI can test the
# migrations on that exact version, and checks it is safe to deploy.
#
# infra/postgres/MAJOR holds the major version the data really is on. If the
# compose files ask for another major (Dependabot suggesting a new one, for
# example) this fails on purpose: that change needs the data migration of
# scripts/pg-upgrade.sh, and MAJOR is updated in the same change after it.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

image_of() {
    grep -oE 'image: postgres:[^[:space:]]+' "$1" | head -n 1 | cut -d' ' -f2
}

prod_image="$(image_of docker-compose.prod.yml)"
dev_image="$(image_of docker-compose.yml)"
expected_major="$(grep -vE '^\s*(#|$)' infra/postgres/MAJOR | head -n 1 | tr -d '[:space:]')"

if [[ -z "$prod_image" || -z "$dev_image" ]]; then
    echo "::error::No postgres image found in the compose files." >&2
    exit 1
fi
if [[ "$prod_image" != "$dev_image" ]]; then
    echo "::error::docker-compose.yml uses $dev_image but docker-compose.prod.yml uses $prod_image. Keep them the same." >&2
    exit 1
fi

# Printed before the major check, so the migrations still get tested on the
# new version and the pull request shows if the code works with it.
echo "$prod_image"

major="$(sed -E 's/^postgres:([0-9]+).*/\1/' <<<"$prod_image")"
if [[ "$major" != "$expected_major" ]]; then
    echo "::error::Postgres $expected_major -> $major is a major upgrade. The new version can not read the current data. Plan it with scripts/pg-upgrade.sh (its header has the steps) and set infra/postgres/MAJOR to $major in this same change." >&2
    exit 1
fi
