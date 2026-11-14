"""Read-only status of the physical washer terminal cutover."""
import json
from datetime import datetime, timezone
from pathlib import Path

import pymysql
from pymysql.cursors import DictCursor


def main():
    values = {}
    for line in (Path(__file__).resolve().parent / ".env").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"')
    conn = pymysql.connect(
        host=values.get("SPINSENSE_DB_HOST", "localhost"),
        user=values["SPINSENSE_DB_USER"], password=values["SPINSENSE_DB_PASSWORD"],
        database=values.get("SPINSENSE_DB_NAME", "edge_iot"),
        cursorclass=DictCursor, init_command="SET time_zone = '+00:00'",
    )
    try:
        with conn.cursor() as cursor:
            cursor.execute("""SELECT p.source_id,p.sequence,p.last_seen_at,p.state_payload
                FROM machine_presence p JOIN device_registry d
                ON d.gateway_id=p.gateway_id AND d.source_id=p.source_id
                WHERE p.source_id='washer-sim-01' AND d.status='active'
                ORDER BY p.last_seen_at DESC LIMIT 1""")
            presence = cursor.fetchone()
            cursor.execute("""SELECT COUNT(*) AS total, MAX(gateway_receipt_at) AS latest
                FROM sensor_telemetry WHERE source_id='washer-sim-01'
                AND quarantine_reason IS NULL""")
            history = cursor.fetchone()
            cursor.execute("""SELECT action,status,reason,issued_at,result_at
                FROM machine_commands WHERE source_id='washer-sim-01'
                ORDER BY issued_at DESC LIMIT 3""")
            commands = cursor.fetchall()
            cursor.execute("""SELECT program_id,outcome,running_seconds,started_at,finished_at
                FROM machine_cycles WHERE source_id='washer-sim-01'
                ORDER BY finished_at DESC LIMIT 2""")
            cycles = cursor.fetchall()
        if presence:
            age = (datetime.now(timezone.utc).replace(tzinfo=None) - presence["last_seen_at"]).total_seconds()
            state = json.loads(presence["state_payload"]).get("state", "unknown")
            print(f"presence: state={state}, age_seconds={age:.1f}, sequence={presence['sequence']}")
        else:
            print("presence: absent")
        print(f"trusted washer history: rows={history['total']}, latest={history['latest']}")
        for command in commands:
            print("command: action={action}, status={status}, reason={reason}, issued={issued_at}, result={result_at}".format(**command))
        for cycle in cycles:
            print("cycle: program={program_id}, outcome={outcome}, seconds={running_seconds}, started={started_at}, finished={finished_at}".format(**cycle))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
