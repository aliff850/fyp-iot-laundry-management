"""One guarded local simulator START/STOP check through the normal command path."""
import json
import sqlite3
import sys
import time
import uuid
from pathlib import Path

import pymysql
from pymysql.cursors import DictCursor

ROOT = Path(__file__).resolve().parents[1]
GATEWAY_ROOT = ROOT.parent if ROOT.name.startswith("staging-") else ROOT
sys.path.insert(0, str(GATEWAY_ROOT))
import gateway_config  # noqa: E402


def config(path):
    values = {}
    for line in path.read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"')
    return values


def command(conn, gateway_id, action):
    command_id = str(uuid.uuid4())
    with conn.cursor() as cur:
        cur.execute("""INSERT INTO machine_commands
            (command_id,gateway_id,source_id,action,arguments_json,status,actor,issued_at,expires_at)
            VALUES (%s,%s,'washer-sim-01',%s,'{}','queued','local verification',
            UTC_TIMESTAMP(6),UTC_TIMESTAMP(6)+INTERVAL 30 SECOND)""",
            (command_id, gateway_id, action))
    conn.commit()
    for _ in range(40):
        time.sleep(0.25)
        with conn.cursor() as cur:
            cur.execute("SELECT status FROM machine_commands WHERE command_id=%s", (command_id,))
            status = cur.fetchone()["status"]
        if status == "succeeded":
            return
        if status in {"failed", "expired", "unknown"}:
            raise RuntimeError(f"{action} command ended {status}; inspect the simulator")
    raise RuntimeError(f"{action} command lacks a result")


def main():
    values = config(GATEWAY_ROOT / ".env")
    sim = config(GATEWAY_ROOT / "simulator-washer.env")
    with sqlite3.connect(sim["SIMULATOR_STATE_FILE"]) as db:
        state = json.loads(db.execute("SELECT payload FROM machine_state WHERE id=1").fetchone()[0])
    if state["state"] != "IDLE" or state["source_id"] != "washer-sim-01":
        raise RuntimeError("Washer simulator must be idle")
    conn = pymysql.connect(host=values.get("SPINSENSE_DB_HOST", "localhost"),
        user=values["SPINSENSE_DB_USER"], password=values["SPINSENSE_DB_PASSWORD"],
        database="edge_iot", cursorclass=DictCursor, autocommit=True,
        init_command="SET time_zone = '+00:00'")
    try:
        identity = gateway_config.get_stored_gateway_credentials(values["SPINSENSE_CREDENTIALS_FILE"])
        binding = gateway_config.load_gateway_db_state(conn, identity[0])
        if binding.get("status") != "active":
            raise RuntimeError("Gateway is not active")
        gateway_id = binding["gateway_id"]
        with conn.cursor() as cur:
            cur.execute("""SELECT source_id FROM device_registry WHERE gateway_id=%s
                AND source_id='washer-sim-01' AND status='active' AND source_kind='simulated'""", (gateway_id,))
            if not cur.fetchone():
                raise RuntimeError("Approved washer simulator missing")
            cur.execute("""SELECT COUNT(*) AS n FROM machine_cycles WHERE gateway_id=%s
                AND source_id='washer-sim-01' AND outcome='completed'""", (gateway_id,))
            completed_before = cur.fetchone()["n"]
        command(conn, gateway_id, "start")
        time.sleep(4)
        command(conn, gateway_id, "stop")
        for _ in range(40):
            with conn.cursor() as cur:
                cur.execute("""SELECT c.cycle_id,c.running_seconds,c.outcome,d.local_date,d.running_seconds AS daily_seconds
                    FROM machine_cycles c LEFT JOIN machine_cycle_daily_runtime d
                      ON d.gateway_id=c.gateway_id AND d.cycle_id=c.cycle_id
                    WHERE c.gateway_id=%s AND c.source_id='washer-sim-01' AND c.outcome='stopped'
                    ORDER BY c.finished_at DESC LIMIT 1""", (gateway_id,))
                row = cur.fetchone()
            if row and row["daily_seconds"] is not None:
                break
            time.sleep(0.25)
        if not row or not 1 <= row["running_seconds"] < 30 or row["daily_seconds"] != row["running_seconds"]:
            raise RuntimeError("Stopped cycle or daily allocation did not reach MariaDB")
        with conn.cursor() as cur:
            cur.execute("""SELECT COUNT(*) AS n FROM machine_cycles WHERE gateway_id=%s
                AND source_id='washer-sim-01' AND outcome='completed'""", (gateway_id,))
            if cur.fetchone()["n"] != completed_before:
                raise RuntimeError("STOP incorrectly incremented completed cycles")
        print(f"STOP persisted {row['running_seconds']} running seconds on Malaysia date {row['local_date']}; completed cycles unchanged")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
