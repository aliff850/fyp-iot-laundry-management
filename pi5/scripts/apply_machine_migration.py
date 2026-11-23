"""One-time additive live migration 003, guarded by the private backup."""
from pathlib import Path

import pymysql

ROOT = Path(__file__).resolve().parents[1]
BACKUP = Path("/home/aliff850/edge_backups/machine-controls-20261112/edge_iot-pre-machine.sql")


def main():
    if not BACKUP.is_file() or BACKUP.stat().st_size < 1000:
        raise RuntimeError("Pre-migration live backup is missing")
    values = {}
    for line in (ROOT / ".env").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"')
    if values.get("SPINSENSE_DB_NAME") != "edge_iot":
        raise RuntimeError("Unexpected live database name")
    conn = pymysql.connect(host=values.get("SPINSENSE_DB_HOST", "localhost"),
        user=values["SPINSENSE_DB_USER"], password=values["SPINSENSE_DB_PASSWORD"],
        database="edge_iot", autocommit=True)
    try:
        with conn.cursor() as cur:
            cur.execute("SHOW TABLES LIKE 'machine_commands'")
            if cur.fetchone():
                raise RuntimeError("Live machine command table already exists; inspect before rerunning")
            cur.execute("SELECT COUNT(*) FROM sensor_telemetry")
            before = cur.fetchone()[0]
            sql = (ROOT / "staging-machine-controls-20261112/migrations/003_machine_commands.sql").read_text()
            cur.execute("CREATE TABLE" + sql.split("CREATE TABLE", 1)[1])
            cur.execute("SELECT COUNT(*) FROM sensor_telemetry")
            after = cur.fetchone()[0]
            cur.execute("SHOW COLUMNS FROM machine_commands")
            columns = {row[0] for row in cur.fetchall()}
            if before != after or not {"command_id", "gateway_id", "source_id", "status", "expires_at", "result_at"} <= columns:
                raise RuntimeError("Live migration post-check failed")
            print(f"Live migration 003 passed; telemetry rows preserved: {after}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
