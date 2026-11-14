"""Apply migration 004 only after a verified private backup and rehearsal."""
from pathlib import Path
import pymysql

from rehearse_cycle_migration import BACKUP, GATEWAY_ROOT, ROOT, config


def main():
    dump = BACKUP / "edge_iot-pre-cycles.sql"
    state = BACKUP / "washer-pre-cycles.sqlite"
    if not dump.is_file() or dump.stat().st_size < 1000 or not state.is_file():
        raise RuntimeError("Private database and simulator backups are required")
    values = config(GATEWAY_ROOT / ".env")
    if values.get("SPINSENSE_DB_NAME") != "edge_iot":
        raise RuntimeError("Unexpected database name")
    conn = pymysql.connect(host=values.get("SPINSENSE_DB_HOST", "localhost"),
        user=values["SPINSENSE_DB_USER"], password=values["SPINSENSE_DB_PASSWORD"],
        database="edge_iot", autocommit=True)
    try:
        with conn.cursor() as cur:
            cur.execute("SHOW TABLES LIKE 'machine_cycles'")
            if cur.fetchone():
                raise RuntimeError("Cycle table already exists; inspect before applying again")
            cur.execute("SELECT COUNT(*) FROM sensor_telemetry")
            before = cur.fetchone()[0]
            ddl = "CREATE TABLE" + (Path(ROOT / "migrations/004_machine_cycles.sql").read_text().split("CREATE TABLE", 1)[1])
            cur.execute(ddl)
            cur.execute("SELECT COUNT(*) FROM sensor_telemetry")
            after = cur.fetchone()[0]
            if before != after:
                raise RuntimeError("Telemetry count changed during migration")
            print(f"Migration 004 applied; telemetry rows preserved: {after}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
