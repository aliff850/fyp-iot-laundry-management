"""Read-only check of live recorded demo rows and the protected Pi statistics API."""
import os
import json
import importlib.util
import sqlite3
import sys
import time
from pathlib import Path

import pymysql
from pymysql.cursors import DictCursor

ROOT = Path(__file__).resolve().parents[1]
GATEWAY_ROOT = ROOT.parent if ROOT.name.startswith("staging-") else ROOT
sys.path.insert(0, str(GATEWAY_ROOT))
from rehearse_cycle_migration import config  # noqa: E402

values = config(GATEWAY_ROOT / ".env")
os.environ.update(values)
dashboard_spec = importlib.util.spec_from_file_location("spinsense_live_dashboard", GATEWAY_ROOT / "dashboard" / "dashboard.py")
dashboard = importlib.util.module_from_spec(dashboard_spec)
dashboard_spec.loader.exec_module(dashboard)
import gateway_config  # noqa: E402


def main():
    conn = pymysql.connect(host=values.get("SPINSENSE_DB_HOST", "localhost"),
        user=values["SPINSENSE_DB_USER"], password=values["SPINSENSE_DB_PASSWORD"],
        database="edge_iot", cursorclass=DictCursor,
        init_command="SET time_zone = '+00:00'")
    try:
        identity = gateway_config.get_stored_gateway_credentials(values["SPINSENSE_CREDENTIALS_FILE"])
        binding = gateway_config.load_gateway_db_state(conn, identity[0])
        with conn.cursor() as cur:
            cur.execute("""SELECT program_id,outcome,COUNT(*),SUM(running_seconds),SUM(price_myr)
                FROM machine_cycles WHERE gateway_id=%s AND source_id='washer-sim-01'
                GROUP BY program_id,outcome ORDER BY program_id,outcome""", (binding["gateway_id"],))
            rows = cur.fetchall()
        print("Stored cycle groups:", rows)
        client = dashboard.app.test_client()
        with client.session_transaction() as session:
            session["staff"] = True
            session["staff_expires_at"] = time.time() + 60
        response = client.get("/api/dashboard/machines/washer-sim-01/statistics?period=week")
        if response.status_code != 200:
            raise RuntimeError(f"Statistics API returned HTTP {response.status_code}")
        print("Statistics summary:", response.json["summary"])
        print("Malaysia-day buckets:", len(response.json["series"]))
        print("Individual cycle events:", len(response.json["events"]))
        if response.json.get("timezone") != "Asia/Kuala_Lumpur":
            raise RuntimeError("Statistics timezone does not match Malaysia day grouping")
        if client.get("/api/dashboard/machines/washer-sim-01/statistics?dataset=demo").status_code != 400:
            raise RuntimeError("Removed generated-example API still responds")
        sim = config(GATEWAY_ROOT / "simulator-washer.env")
        with sqlite3.connect(sim["SIMULATOR_STATE_FILE"]) as state_db:
            state = json.loads(state_db.execute("SELECT payload FROM machine_state WHERE id=1").fetchone()[0])
            pending = state_db.execute("SELECT COUNT(*) FROM cycle_events WHERE delivered=0").fetchone()[0]
        print("Simulator state:", state["state"])
        print("Unacknowledged cycle events:", pending)
        print("Saved program durations:", {key: item["duration_seconds"] for key, item in state["programs"].items()})
    finally:
        conn.close()


if __name__ == "__main__":
    main()
