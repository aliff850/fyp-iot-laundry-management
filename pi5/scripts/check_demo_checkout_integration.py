"""Exercise one QR checkout and retry against the isolated restored Pi database only."""
import os
import sys
from pathlib import Path

import pymysql
from pymysql.cursors import DictCursor

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
try:
    import demo_checkout
except ImportError:
    from pi5 import demo_checkout

TEST_DB = "edge_iot_demo_test_20261113"


def main():
    root = Path(__file__).resolve().parents[1]
    gateway_root = root.parent if root.name.startswith("staging-") else root
    values = {}
    for line in (gateway_root / ".env").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"')
    conn = pymysql.connect(host=values.get("SPINSENSE_DB_HOST", "localhost"),
        user=values["SPINSENSE_DB_USER"], password=values["SPINSENSE_DB_PASSWORD"],
        database=TEST_DB, cursorclass=DictCursor, init_command="SET time_zone = '+00:00'")
    try:
        with conn.cursor() as cursor:
            cursor.execute("""SELECT gateway_id FROM device_registry WHERE source_id='washer-sim-01'
                AND status='active' AND source_kind='simulated' LIMIT 1""")
            device = cursor.fetchone()
            if not device:
                raise RuntimeError("Restored test database lacks the approved washer")
            gateway_id = device["gateway_id"]
            cursor.execute("""UPDATE sensor_telemetry SET gateway_receipt_at=UTC_TIMESTAMP(6),
                recorded_at=UTC_TIMESTAMP(6) WHERE gateway_id=%s AND source_id='washer-sim-01'
                AND id=(SELECT chosen FROM (SELECT MAX(id) AS chosen FROM sensor_telemetry
                    WHERE gateway_id=%s AND source_id='washer-sim-01' AND quarantine_reason IS NULL) s)""",
                (gateway_id, gateway_id))
        conn.commit()
        token, checkout_id = demo_checkout.create(conn, gateway_id, "washer-sim-01", "quick")
        assert demo_checkout.read(conn, token)["checkout_id"] == checkout_id
        try:
            demo_checkout.create(conn, gateway_id, "washer-sim-01", "standard")
        except ValueError as error:
            assert str(error) == "A checkout is already active for this machine"
            conn.rollback()
        else:
            raise AssertionError("A second live checkout was created for the same machine")
        command_id = demo_checkout.confirm(conn, token, gateway_id)
        assert demo_checkout.confirm(conn, token, gateway_id) == command_id
        with conn.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) AS n FROM machine_commands WHERE command_id=%s", (command_id,))
            assert cursor.fetchone()["n"] == 1
        print("Isolated MariaDB checkout confirmed once and queued exactly one START command")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
