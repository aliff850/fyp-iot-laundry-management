"""One controlled START→STOP exercise for the approved simulated washer."""
import json
import os
import sqlite3
import sys
import time
import uuid
from pathlib import Path

import pymysql
from pymysql.cursors import DictCursor

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
values = {}
for line in (ROOT / ".env").read_text().splitlines():
    if "=" in line and not line.lstrip().startswith("#"):
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"')
os.environ.update(values)
import gateway_config
from simulator_core import defaults


def db():
    return pymysql.connect(host=values.get("SPINSENSE_DB_HOST", "localhost"),
        user=values["SPINSENSE_DB_USER"], password=values["SPINSENSE_DB_PASSWORD"],
        database="edge_iot", cursorclass=DictCursor, autocommit=True,
        init_command="SET time_zone = '+00:00'")


def wait_for(command_id):
    deadline = time.monotonic() + 12
    while time.monotonic() < deadline:
        with db() as conn, conn.cursor() as cur:
            cur.execute("SELECT status, reason FROM machine_commands WHERE command_id=%s", (command_id,))
            row = cur.fetchone()
        if row and row["status"] in ("succeeded", "failed", "expired", "unknown"):
            return row["status"], row["reason"]
        time.sleep(0.5)
    return "pending", None


def queue(gateway_id, action, arguments=None):
    command_id = str(uuid.uuid4())
    with db() as conn, conn.cursor() as cur:
        cur.execute("""INSERT INTO machine_commands
            (command_id,gateway_id,source_id,action,arguments_json,issued_at,expires_at)
            VALUES (%s,%s,'washer-sim-01',%s,%s,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6)+INTERVAL 30 SECOND)""",
            (command_id, gateway_id, action, json.dumps(arguments or {})))
    return command_id


def main():
    with db() as conn, conn.cursor() as cur:
        stored = gateway_config.get_stored_gateway_credentials()
        state = gateway_config.load_gateway_db_state(conn, stored[0] if stored else None)
        if state.get("status") != "active" or state.get("branch_id") != "dbf2290f-9cc3-4c9b-85fc-b9496f0840f6":
            raise RuntimeError("Wrong gateway binding")
        gateway_id = state["gateway_id"]
        cur.execute("""SELECT source_id FROM device_registry WHERE gateway_id=%s
            AND source_id='washer-sim-01' AND status='active' AND source_kind='simulated' AND device_type='washer'""",
            (gateway_id,))
        if not cur.fetchone():
            raise RuntimeError("Washer is not an approved simulator")
        cur.execute("""SELECT data_payload FROM sensor_telemetry WHERE gateway_id=%s
            AND source_id='washer-sim-01' AND quarantine_reason IS NULL
            AND gateway_receipt_at>=UTC_TIMESTAMP(6)-INTERVAL 15 SECOND
            ORDER BY gateway_receipt_at DESC,id DESC LIMIT 1""", (gateway_id,))
        sample = cur.fetchone()
        if not sample or json.loads(sample["data_payload"]).get("state") != "idle":
            raise RuntimeError("Washer is not freshly idle")
        cur.execute("""SELECT COUNT(*) AS pending FROM machine_commands WHERE gateway_id=%s
            AND source_id='washer-sim-01' AND status IN ('queued','published')
            AND expires_at>UTC_TIMESTAMP(6)""", (gateway_id,))
        if cur.fetchone()["pending"]:
            raise RuntimeError("Another command is in progress")
    start_id = queue(gateway_id, "start")
    start_status, _ = wait_for(start_id)
    print(f"START result: {start_status}")
    if start_status != "succeeded":
        raise RuntimeError("START was not confirmed; inspect before further commands")
    stop_id = queue(gateway_id, "stop")
    stop_status, _ = wait_for(stop_id)
    print(f"STOP result: {stop_status}")
    if stop_status != "succeeded":
        raise RuntimeError("STOP was not confirmed; the short simulated cycle can finish automatically")
    changed = {**defaults("washer"), "price_myr": "6.50", "duration_seconds": 45}
    edit_status, _ = wait_for(queue(gateway_id, "set_settings", changed))
    print(f"SETTINGS result: {edit_status}")
    if edit_status != "succeeded":
        raise RuntimeError("Settings edit was not confirmed")
    state_file = Path("/var/lib/spinsense/machines/washer-sim-01.sqlite")
    with sqlite3.connect(f"file:{state_file}?mode=ro", uri=True) as local:
        saved = json.loads(local.execute("SELECT payload FROM machine_state WHERE id=1").fetchone()[0])
    if saved["settings"]["price_myr"] != "6.50" or saved["settings"]["duration_seconds"] != 45:
        raise RuntimeError("Settings result did not persist in simulator")
    restore_status, _ = wait_for(queue(gateway_id, "set_settings", defaults("washer")))
    if restore_status != "succeeded":
        raise RuntimeError("Default settings were not restored")
    fault_status, _ = wait_for(queue(gateway_id, "inject_fault", {"fault_code": "SIM_DOOR"}))
    clear_status, _ = wait_for(queue(gateway_id, "clear_fault"))
    print(f"FAULT/CLEAR results: {fault_status}/{clear_status}")
    if fault_status != "succeeded" or clear_status != "succeeded":
        raise RuntimeError("Fault transition was not confirmed")


if __name__ == "__main__":
    main()
