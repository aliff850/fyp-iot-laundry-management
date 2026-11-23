"""Read-only deployment preflight for the staged Pi dashboard.

Loads the existing protected service environment without printing its values.
Run from /home/aliff850/edge_gateway with the dashboard service's Python.
"""

import os
import secrets
import sys
import time
from pathlib import Path


def main() -> None:
    env_file = Path.cwd() / ".env"
    if not env_file.is_file():
        raise RuntimeError("Existing edge gateway .env was not found")
    for line in env_file.read_text(encoding="utf-8").splitlines():
        if not line or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        if key.strip() and key.strip() not in os.environ:
            os.environ[key.strip()] = value
    sys.path.insert(0, str(Path(__file__).parent))
    import dashboard

    try:
        snapshot = dashboard._dashboard_snapshot()
    except Exception as error:
        print(f"Dashboard snapshot failed: {type(error).__name__}")
        raise SystemExit(1) from None
    types = [device["type"] for device in snapshot["devices"]]
    freshness = [device["observation"]["freshness"] if device["observation"] else "unknown"
                 for device in snapshot["devices"]]
    print(f"gateway={snapshot['gateway']['status']} devices={len(types)}")
    print(f"types={','.join(types) or 'none'} freshness={','.join(freshness) or 'none'}")
    for device in snapshot["devices"]:
        sample = device["observation"]
        if sample:
            print(f"{device['source_id']}: sample_at={sample['sample_at']} received_at={sample['received_at']}")
    print(f"sync={'available' if snapshot['sync'] is not None else 'unavailable'}")
    dashboard.app.config["SECRET_KEY"] = secrets.token_hex(32)
    dashboard.STAFF_USERNAME = "preflight"
    dashboard.STAFF_PASSWORD_HASH = "preflight-process-only"
    client = dashboard.app.test_client()
    with client.session_transaction() as signed:
        signed["staff"] = True
        signed["staff_expires_at"] = time.time() + 60
    paths = ("/", "/machines", "/lpg-safety", "/api/dashboard/overview",
             "/api/dashboard/machines", "/api/dashboard/lpg-safety", "/api/dashboard/history")
    statuses = [client.get(path).status_code for path in paths]
    print(f"local_routes={','.join(map(str, statuses))}")
    if any(status != 200 for status in statuses):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
