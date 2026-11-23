"""Back up the live Pi database and report non-secret washer rollout guards."""
import json
import os
import subprocess
from pathlib import Path

import pymysql
from pymysql.cursors import DictCursor


def main():
    root = Path(__file__).resolve().parents[1]
    values = {}
    for line in (root / ".env").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"')
    if values.get("SPINSENSE_DB_NAME") != "edge_iot":
        raise RuntimeError("Expected live edge_iot database")
    conn = pymysql.connect(host=values.get("SPINSENSE_DB_HOST", "localhost"),
        user=values["SPINSENSE_DB_USER"], password=values["SPINSENSE_DB_PASSWORD"],
        database="edge_iot", cursorclass=DictCursor,
        init_command="SET time_zone = '+00:00'")
    try:
        with conn.cursor() as cursor:
            cursor.execute("""SELECT state_payload,last_seen_at FROM machine_presence
                WHERE source_id='washer-sim-01' ORDER BY last_seen_at DESC LIMIT 1""")
            presence = cursor.fetchone()
            cursor.execute("""SELECT COUNT(*) AS count FROM demo_checkouts
                WHERE source_id='washer-sim-01' AND confirmed_at IS NULL
                AND expires_at>UTC_TIMESTAMP(6)""")
            active_checkouts = cursor.fetchone()["count"]
            cursor.execute("""SELECT COUNT(*) AS count FROM machine_commands
                WHERE source_id='washer-sim-01' AND status IN ('queued','published')
                AND expires_at>UTC_TIMESTAMP(6)""")
            pending_commands = cursor.fetchone()["count"]
    finally:
        conn.close()
    state = json.loads(presence["state_payload"] or "{}") if presence else {}
    print(f"washer_state={state.get('state', 'unknown')}")
    print(f"saved_programs={len(state.get('programs') or {})}")
    print(f"active_checkouts={active_checkouts}")
    print(f"pending_commands={pending_commands}")
    if state.get("state") != "idle" or active_checkouts or pending_commands:
        raise RuntimeError("Washer is not safe for program rollout")
    backup = Path("/home/aliff850/edge_backups/program-catalog-20261114")
    backup.mkdir(mode=0o700, parents=True, exist_ok=True)
    state_file = backup / "washer-presence-before.json"
    if not state_file.exists():
        state_file.write_text(json.dumps(state, indent=2))
        state_file.chmod(0o600)
    dump = backup / "edge_iot-before.sql"
    if not dump.exists():
        env = {**os.environ, "MYSQL_PWD": values["SPINSENSE_DB_PASSWORD"]}
        old_umask = os.umask(0o077)
        try:
            with dump.open("xb") as output:
                result = subprocess.run(["mariadb-dump", "--single-transaction", "--user",
                    values["SPINSENSE_DB_USER"], "--host", values.get("SPINSENSE_DB_HOST", "localhost"),
                    "edge_iot"], stdout=output, stderr=subprocess.PIPE, env=env, check=False)
            if result.returncode or dump.stat().st_size < 1000:
                dump.unlink(missing_ok=True)
                raise RuntimeError("Database backup failed")
        finally:
            os.umask(old_umask)
    print(f"backup_bytes={dump.stat().st_size}")


if __name__ == "__main__":
    main()
