"""One-time four-cycle Pi demo through the local MariaDB -> MQTT command path."""
import json
import sqlite3
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pymysql
from pymysql.cursors import DictCursor

ROOT = Path(__file__).resolve().parent
GATEWAY_ROOT = ROOT.parent if ROOT.name.startswith("staging-") else ROOT
sys.path.insert(0, str(GATEWAY_ROOT))
import gateway_config  # noqa: E402
from rehearse_cycle_migration import BACKUP, config  # noqa: E402

SOURCE = "washer-sim-01"
MARKER = BACKUP / "demo-completed.json"


def connection(values):
    return pymysql.connect(host=values.get("SPINSENSE_DB_HOST", "localhost"),
        user=values["SPINSENSE_DB_USER"], password=values["SPINSENSE_DB_PASSWORD"],
        database="edge_iot", cursorclass=DictCursor, autocommit=True,
        init_command="SET time_zone = '+00:00'")


def queue_and_wait(conn, gateway_id, action, arguments):
    command_id = str(uuid.uuid4())
    with conn.cursor() as cur:
        cur.execute("""INSERT INTO machine_commands
            (command_id,gateway_id,source_id,action,arguments_json,status,actor,issued_at,expires_at)
            VALUES (%s,%s,%s,%s,%s,'queued','local demo',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6)+INTERVAL 30 SECOND)""",
            (command_id, gateway_id, SOURCE, action, json.dumps(arguments)))
    conn.commit()
    deadline = time.monotonic() + 25
    while time.monotonic() < deadline:
        conn.ping(reconnect=True)
        with conn.cursor() as cur:
            cur.execute("SELECT status,reason FROM machine_commands WHERE command_id=%s", (command_id,))
            result = cur.fetchone()
        if result["status"] == "succeeded":
            return command_id
        if result["status"] in {"failed", "expired", "unknown"}:
            raise RuntimeError(f"Demo command {action} ended {result['status']}; stop and inspect")
        time.sleep(0.5)
    raise RuntimeError(f"Demo command {action} lacks a result; stop and inspect")


def wait_for_completed(conn, gateway_id, previous_count):
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        conn.ping(reconnect=True)
        with conn.cursor() as cur:
            cur.execute("""SELECT COUNT(*) AS n FROM machine_cycles
                WHERE gateway_id=%s AND source_id=%s AND outcome='completed'""", (gateway_id, SOURCE))
            count = cur.fetchone()["n"]
            if count > previous_count:
                cur.execute("""SELECT cycle_id,program_id,price_myr,target_seconds,running_seconds
                    FROM machine_cycles WHERE gateway_id=%s AND source_id=%s AND outcome='completed'
                    ORDER BY finished_at DESC LIMIT 1""", (gateway_id, SOURCE))
                return cur.fetchone()
        time.sleep(0.5)
    raise RuntimeError("Completed cycle did not reach MariaDB; stop and inspect")


def main():
    if MARKER.exists():
        raise RuntimeError("Demo already completed; will not create duplicate demonstration cycles")
    values = config(GATEWAY_ROOT / ".env")
    sim = config(GATEWAY_ROOT / "simulator-washer.env")
    with sqlite3.connect(sim["SIMULATOR_STATE_FILE"]) as sqlite:
        row = sqlite.execute("SELECT payload FROM machine_state WHERE id=1").fetchone()
    state = json.loads(row[0])
    if state["source_id"] != SOURCE or state["state"] != "IDLE":
        raise RuntimeError("Approved washer simulator must be idle before the demo")
    originals = state.get("programs")
    if not isinstance(originals, dict) or not {"quick", "standard"} <= set(originals):
        raise RuntimeError("Updated simulator programs are not yet active")
    original_selected = state["settings"]["program_id"]
    conn = connection(values)
    try:
        stored = gateway_config.get_stored_gateway_credentials(values["SPINSENSE_CREDENTIALS_FILE"])
        binding = gateway_config.load_gateway_db_state(conn, stored[0] if stored else None)
        if binding.get("status") != "active" or not binding.get("branch_id"):
            raise RuntimeError("Gateway is not active")
        gateway_id = binding["gateway_id"]
        with conn.cursor() as cur:
            cur.execute("""SELECT source_id FROM device_registry WHERE gateway_id=%s AND source_id=%s
                AND status='active' AND source_kind='simulated' AND device_type='washer'""",
                (gateway_id, SOURCE))
            if not cur.fetchone():
                raise RuntimeError("Demo washer is not an approved simulator")
            cur.execute("SELECT COUNT(*) AS n FROM machine_commands WHERE gateway_id=%s AND actor='local demo'", (gateway_id,))
            if cur.fetchone()["n"]:
                raise RuntimeError("Demo was already started; inspect its existing commands before retrying")
            cur.execute("SELECT COUNT(*) AS n FROM machine_cycles WHERE gateway_id=%s AND source_id=%s AND outcome='completed'", (gateway_id, SOURCE))
            count = cur.fetchone()["n"]
        events = []
        for program_id, duration in (("quick", 6), ("standard", 9)):
            settings = {**originals[program_id], "duration_seconds": duration}
            queue_and_wait(conn, gateway_id, "set_settings", settings)
            for _ in range(2):
                queue_and_wait(conn, gateway_id, "start", {})
                event = wait_for_completed(conn, gateway_id, count)
                count += 1
                events.append({"cycle_id": event["cycle_id"], "program_id": event["program_id"],
                    "price_myr": str(event["price_myr"]), "running_seconds": event["running_seconds"]})
                print(f"Recorded {event['program_id']} cycle {event['cycle_id']} ({event['running_seconds']} running seconds)")
        for program_id in ("quick", "standard"):
            queue_and_wait(conn, gateway_id, "set_settings", originals[program_id])
        if original_selected == "quick":
            queue_and_wait(conn, gateway_id, "set_settings", originals["quick"])
        MARKER.write_text(json.dumps({"recorded_at": datetime.now(timezone.utc).isoformat(),
            "gateway_id": gateway_id, "source_id": SOURCE, "events": events}, indent=2))
        MARKER.chmod(0o600)
        print("Four completed simulator cycles recorded and original programs restored")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
