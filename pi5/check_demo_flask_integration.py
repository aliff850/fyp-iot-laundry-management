"""Exercise Pi checkout HTML and QR through Flask against isolated MariaDB only."""
import os
import sys
import importlib.util
import re
from pathlib import Path

import pymysql
from pymysql.cursors import DictCursor
from jinja2 import FileSystemLoader


def main():
    root = Path(__file__).resolve().parent
    gateway_root = root.parent if root.name.startswith("staging-") else root
    sys.path.insert(0, str(gateway_root))
    values = {}
    for line in (gateway_root / ".env").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"')
    os.environ.update(values)
    import demo_checkout
    dashboard_file = root / "dashboard/dashboard.py"
    spec = importlib.util.spec_from_file_location("staged_demo_dashboard", dashboard_file)
    dashboard = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(dashboard)
    dashboard.app.jinja_loader = FileSystemLoader(str(root / "dashboard"))

    def test_db():
        return pymysql.connect(host=values.get("SPINSENSE_DB_HOST", "localhost"),
            user=values["SPINSENSE_DB_USER"], password=values["SPINSENSE_DB_PASSWORD"],
            database="edge_iot_demo_test_20261113", cursorclass=DictCursor,
            init_command="SET time_zone = '+00:00'")

    with test_db() as conn, conn.cursor() as cursor:
        cursor.execute("""UPDATE sensor_telemetry SET gateway_receipt_at=UTC_TIMESTAMP(6),
            recorded_at=UTC_TIMESTAMP(6) WHERE source_id='washer-sim-01'
            AND id=(SELECT chosen FROM (SELECT MAX(id) AS chosen FROM sensor_telemetry
                WHERE source_id='washer-sim-01' AND quarantine_reason IS NULL) s)""")
        cursor.execute("""UPDATE machine_commands SET expires_at=UTC_TIMESTAMP(6)-INTERVAL 1 SECOND
            WHERE actor='demo checkout' AND status='queued'""")
        conn.commit()
    dashboard.get_db_connection = test_db
    dashboard.LOCAL_CONTROLS_ENABLED = True
    dashboard.STAFF_USERNAME = "test-staff"
    dashboard.STAFF_PASSWORD_HASH = "test-only-hash"
    dashboard.app.secret_key = "test-only-session-secret"
    client = dashboard.app.test_client()
    with test_db() as conn:
        binding = dashboard._demo_binding(conn)
        token, _ = demo_checkout.create(conn, binding["gateway_id"], "washer-sim-01", "quick")
    with client.session_transaction() as state:
        state["staff"] = True
        state["staff_expires_at"] = 9999999999
        state["staff_csrf"] = "test-csrf"
    page = client.get("/demo/checkout/" + token)
    if page.status_code != 200 or b"qr.svg" not in page.data:
        raise RuntimeError(f"Checkout HTML failed: HTTP {page.status_code}")
    qr = client.get("/demo/checkout/" + token + "/qr.svg")
    if qr.status_code != 200 or b"<svg" not in qr.data:
        raise RuntimeError(f"QR rendering failed: HTTP {qr.status_code}")
    csrf = re.search(rb'name="csrf_token" value="([a-f0-9]+)"', page.data).group(1).decode()
    unauthenticated_phone = dashboard.app.test_client()
    invalid = unauthenticated_phone.post("/demo/checkout/" + token, data={"csrf_token": "invalid"})
    if invalid.status_code != 403:
        raise RuntimeError(f"Invalid form token was not denied: HTTP {invalid.status_code}")
    confirmation = unauthenticated_phone.post("/demo/checkout/" + token,
                                              data={"csrf_token": csrf}, headers={"Origin": "null"})
    if confirmation.status_code != 303:
        raise RuntimeError(f"Checkout confirmation failed: HTTP {confirmation.status_code}")
    print("Isolated QR returned 200; invalid form denied; cookie-free phone confirmation returned 303")


if __name__ == "__main__":
    main()
