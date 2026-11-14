"""Read-only preflight for the approved washer on the paired Pi."""
import os
from pathlib import Path

import pymysql
from pymysql.cursors import DictCursor

ROOT = Path(__file__).resolve().parent
values = {}
for line in (ROOT / ".env").read_text().splitlines():
    if "=" in line and not line.lstrip().startswith("#"):
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"')
os.environ.update(values)
import gateway_config


def main():
    conn = pymysql.connect(host=values.get("SPINSENSE_DB_HOST", "localhost"),
        user=values["SPINSENSE_DB_USER"], password=values["SPINSENSE_DB_PASSWORD"],
        database="edge_iot", cursorclass=DictCursor, init_command="SET time_zone = '+00:00'")
    try:
        stored = gateway_config.get_stored_gateway_credentials()
        state = gateway_config.load_gateway_db_state(conn, stored[0] if stored else None)
        if state.get("status") != "active" or state.get("branch_id") != "dbf2290f-9cc3-4c9b-85fc-b9496f0840f6":
            raise RuntimeError("Gateway is not active on the intended branch")
        with conn.cursor() as cur:
            cur.execute("""SELECT source_id FROM device_registry WHERE gateway_id=%s AND source_id='washer-sim-01'
                AND status='active' AND source_kind='simulated' AND device_type='washer'""", (state["gateway_id"],))
            if not cur.fetchone():
                raise RuntimeError("Washer is not an approved simulator on this gateway")
            cur.execute("SHOW TABLES LIKE 'machine_commands'")
            if not cur.fetchone():
                raise RuntimeError("Live command table missing")
            cur.execute("""SELECT COUNT(*) AS total_rows, MAX(gateway_receipt_at) AS latest_receipt
                FROM sensor_telemetry WHERE gateway_id=%s AND source_id='washer-sim-01'
                AND quarantine_reason IS NULL""", (state["gateway_id"],))
            telemetry = cur.fetchone()
            cur.execute("""SELECT SUM(is_synced=1) AS acknowledged, SUM(is_synced=0) AS pending
                FROM sensor_telemetry WHERE gateway_id=%s AND source_id='washer-sim-01'
                AND quarantine_reason IS NULL""", (state["gateway_id"],))
            delivery = cur.fetchone()
        print("Paired branch, approved washer and live command table verified")
        print(f"Approved washer observations: {telemetry['total_rows']}; latest receipt: {telemetry['latest_receipt'] or 'none'} UTC")
        print(f"Cloud-acknowledged: {delivery['acknowledged'] or 0}; pending: {delivery['pending'] or 0}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
