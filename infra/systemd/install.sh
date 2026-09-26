#!/bin/bash
# Installs the pull based deploy on the server. Run it once as root, from the
# repo folder:  sudo infra/systemd/install.sh
# Run it again after changing scripts/iris-deploy.sh or the unit files, the
# installed copy is root owned on purpose so the "deploy" user can not change
# what runs.
set -euo pipefail

readonly COSIGN_VERSION="v3.1.3"
# From cosign_checksums.txt of that release.
readonly COSIGN_SHA256="4629c757b7618056f8ddd7e2625ae9fdd94c0372a65049520bc7d9df9efc7f71"
readonly DEPLOY_USER="deploy"
readonly STATE_DIR="/var/lib/iris-deploy"

if [[ "$(id -u)" -ne 0 ]]; then
    echo "Run this as root (sudo)." >&2
    exit 1
fi

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

for tool in docker git curl jq flock; do
    command -v "$tool" >/dev/null || { echo "Missing tool: $tool" >&2; exit 1; }
done

# cosign, checked against the published hash before it is installed.
if ! command -v cosign >/dev/null; then
    tmp="$(mktemp)"
    curl -fsSL -o "$tmp" "https://github.com/sigstore/cosign/releases/download/${COSIGN_VERSION}/cosign-linux-amd64"
    echo "${COSIGN_SHA256}  ${tmp}" | sha256sum --check --status || {
        rm -f "$tmp"
        echo "cosign hash does not match, not installing it." >&2
        exit 1
    }
    install -m 0755 -o root -g root "$tmp" /usr/local/bin/cosign
    rm -f "$tmp"
fi

install -m 0755 -o root -g root "$repo_dir/scripts/iris-deploy.sh" /usr/local/sbin/iris-deploy
install -m 0644 -o root -g root "$repo_dir/infra/systemd/iris-deploy.service" /etc/systemd/system/iris-deploy.service
install -m 0644 -o root -g root "$repo_dir/infra/systemd/iris-deploy.timer" /etc/systemd/system/iris-deploy.timer
install -d -m 0755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$STATE_DIR"

systemctl daemon-reload
systemctl enable --now iris-deploy.timer

echo "Installed. Next runs:"
systemctl list-timers iris-deploy.timer --no-pager
