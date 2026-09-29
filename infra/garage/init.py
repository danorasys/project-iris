# Sets up the Garage node through its admin API: the node layout, one bucket
# and one key per service, and a separate key for administrators. It runs on
# every start, skips what already exists and puts the permissions back to
# exactly what's listed here, so any extra access gets removed.
# Only uses the standard library, so it runs on a plain python image.

import json
import os
import sys
import time
import urllib.error
import urllib.request

ADMIN_URL = os.environ.get("GARAGE_ADMIN_URL", "http://garage:3903")
ADMIN_TOKEN = os.environ["GARAGE_ADMIN_TOKEN"]
# Single node, so this only has to be bigger than zero. It doesn't limit the disk.
NODE_CAPACITY_BYTES = 100 * 1024**3

# Each service only reaches its own bucket. identity-service only reads, the
# avatars are uploaded by an administrator with the admin key. The quotas stop
# a single account from filling the disk; <SERVICE>_S3_QUOTA_MB changes the size.
SERVICES = {
    "classroom": {"write": True, "quota_mb": 2 * 1024, "max_objects": 20_000},
    "content": {"write": True, "quota_mb": 20 * 1024, "max_objects": 200_000},
    "identity": {"write": False, "quota_mb": 200, "max_objects": 1_000},
}


def env(name: str) -> str:
    value = os.environ.get(name, "")
    if not value:
        sys.exit(f"garage-init: missing {name}")
    return value


def call(method: str, endpoint: str, body: dict | None = None) -> tuple[int, dict]:
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(
        f"{ADMIN_URL}/v2/{endpoint}",
        data=data,
        method=method,
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        return error.code, {}


def wait_for_garage() -> None:
    for _ in range(30):
        try:
            if call("GET", "GetClusterHealth")[0] == 200:
                return
        except urllib.error.URLError:
            pass
        time.sleep(2)
    sys.exit("garage-init: Garage did not answer in time")


# A half applied permission or quota must stop the start, not go unnoticed.
def must(status: int, what: str) -> None:
    if status != 200:
        sys.exit(f"garage-init: could not {what} (HTTP {status})")


def ensure_layout() -> None:
    _, cluster = call("GET", "GetClusterStatus")
    node_id = cluster["nodes"][0]["id"]
    _, layout = call("GET", "GetClusterLayout")
    if any(role["id"] == node_id for role in layout["roles"]):
        return
    call("POST", "UpdateClusterLayout", {
        "roles": [{"id": node_id, "zone": "dc1", "capacity": NODE_CAPACITY_BYTES, "tags": []}],
    })
    must(call("POST", "ApplyClusterLayout", {"version": layout["version"] + 1})[0], "apply the node layout")
    print("garage-init: node layout applied")


def ensure_key(name: str, access_key: str, secret_key: str) -> None:
    status, key = call("GET", f"GetKeyInfo?id={access_key}&showSecretKey=true")
    if status == 200:
        # Garage can't change the secret of an existing key. If .env has a new
        # one, the services would fail with 403 later, so it's better to stop here.
        if key.get("secretAccessKey") != secret_key:
            sys.exit(f"garage-init: key {name} already exists with another secret, delete it to rotate it")
        return
    status, _ = call("POST", "ImportKey", {"accessKeyId": access_key, "secretAccessKey": secret_key, "name": name})
    must(status, f"import key {name}, check its format in .env.example")
    print(f"garage-init: key {name} imported")


def ensure_bucket(alias: str) -> dict:
    status, bucket = call("GET", f"GetBucketInfo?globalAlias={alias}")
    if status != 200:
        status, bucket = call("POST", "CreateBucket", {"globalAlias": alias})
        must(status, f"create bucket {alias}")
        print(f"garage-init: bucket {alias} created")
        _, bucket = call("GET", f"GetBucketInfo?id={bucket['id']}")
    return bucket


def set_access(bucket: dict, allowed: dict[str, dict[str, bool]]) -> None:
    # allowed maps each access key to its permissions. Nobody is owner, so no
    # key can change bucket settings, and any key not listed loses access.
    for key in bucket.get("keys", []):
        if key["accessKeyId"] not in allowed:
            allowed[key["accessKeyId"]] = {"read": False, "write": False}
    for access_key, perms in allowed.items():
        grant = {p: True for p, on in perms.items() if on}
        revoke = {p: True for p, on in perms.items() if not on} | {"owner": True}
        body = {"bucketId": bucket["id"], "accessKeyId": access_key}
        if grant:
            must(call("POST", "AllowBucketKey", body | {"permissions": grant})[0], f"grant access to {access_key}")
        must(call("POST", "DenyBucketKey", body | {"permissions": revoke})[0], f"revoke access of {access_key}")


def main() -> None:
    wait_for_garage()
    ensure_layout()

    admin_key = env("STORAGE_ADMIN_ACCESS_KEY")
    ensure_key("iris-admin", admin_key, env("STORAGE_ADMIN_SECRET_KEY"))

    for service, rules in SERVICES.items():
        prefix = service.upper()
        access_key = env(f"{prefix}_S3_ACCESS_KEY")
        ensure_key(f"iris-{service}", access_key, env(f"{prefix}_S3_SECRET_KEY"))
        bucket = ensure_bucket(env(f"{prefix}_S3_BUCKET"))
        set_access(bucket, {
            access_key: {"read": True, "write": rules["write"]},
            admin_key: {"read": True, "write": True},
        })
        # Nothing is served straight from Garage, every file goes through
        # the API. This also undoes it if someone turns it on by hand.
        quota_mb = int(os.environ.get(f"{prefix}_S3_QUOTA_MB") or rules["quota_mb"])
        status, _ = call("POST", f"UpdateBucket?id={bucket['id']}", {
            "websiteAccess": {"enabled": False},
            "quotas": {"maxSize": quota_mb * 1024 * 1024, "maxObjects": rules["max_objects"]},
        })
        must(status, f"set the quota of {prefix.lower()}")
    print("garage-init: ready")


if __name__ == "__main__":
    main()
