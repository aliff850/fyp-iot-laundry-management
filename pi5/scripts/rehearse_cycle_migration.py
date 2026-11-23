"""Back up live edge data and rehearse migration 004 on an isolated MariaDB copy."""
import os
import sqlite3
import subprocess
from pathlib import Path

import pymysql

ROOT = Path(__file__).resolve().parents[1]
GATEWAY_ROOT = ROOT.parent if ROOT.name.startswith("staging-") else ROOT
BACKUP = Path("/home/aliff850/edge_backups/machine-cycles-20261113")
TEST_DB = "edge_iot_cycles_test_20261113"


def config(path):
    values = {}
    for line in path.read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"')
    return values


def main():
    values = config(GATEWAY_ROOT / ".env")
    if values.get("SPINSENSE_DB_NAME") != "edge_iot":
        raise RuntimeError("Expected the existing edge_iot database")
    sim = config(GATEWAY_ROOT / "simulator-washer.env")
    state = Path(sim["SIMULATOR_STATE_FILE"])
    if not state.is_file():
        raise RuntimeError("Simulator SQLite state file is missing")
    BACKUP.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(BACKUP, 0o700)
    dump = BACKUP / "edge_iot-pre-cycles.sql"
    state_copy = BACKUP / "washer-pre-cycles.sqlite"
    if dump.exists() or state_copy.exists():
        raise RuntimeError("Existing backup will not be overwritten")
    test_conn = pymysql.connect(host=values.get("SPINSENSE_DB_HOST", "localhost"),
        user=values["SPINSENSE_DB_USER"], password=values["SPINSENSE_DB_PASSWORD"],
        database=TEST_DB)
    try:
        with test_conn.cursor() as cur:
            cur.execute("SHOW TABLES")
            if cur.fetchone():
                raise RuntimeError("Isolated test database must be empty before restore")
    finally:
        test_conn.close()
    old_umask = os.umask(0o077)
    try:
        env = {**os.environ, "MYSQL_PWD": values["SPINSENSE_DB_PASSWORD"]}
        with dump.open("xb") as out:
            result = subprocess.run(["mariadb-dump", "--single-transaction", "--user",
                values["SPINSENSE_DB_USER"], "--host", values.get("SPINSENSE_DB_HOST", "localhost"),
                "edge_iot"], stdout=out, stderr=subprocess.PIPE, env=env, check=False)
        if result.returncode or dump.stat().st_size < 1000:
            dump.unlink(missing_ok=True)
            raise RuntimeError("Database backup failed")
        with sqlite3.connect(state) as source, sqlite3.connect(state_copy) as target:
            source.backup(target)
        os.chmod(state_copy, 0o600)
        with dump.open("rb") as source:
            result = subprocess.run(["mariadb", "--user", values["SPINSENSE_DB_USER"],
                "--host", values.get("SPINSENSE_DB_HOST", "localhost"), TEST_DB],
                stdin=source, stderr=subprocess.PIPE, env=env, check=False)
        if result.returncode:
            raise RuntimeError("Isolated database restore failed")
        conn = pymysql.connect(host=values.get("SPINSENSE_DB_HOST", "localhost"),
            user=values["SPINSENSE_DB_USER"], password=values["SPINSENSE_DB_PASSWORD"],
            database=TEST_DB, autocommit=True)
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM sensor_telemetry")
                before = cur.fetchone()[0]
                ddl = "CREATE TABLE" + (ROOT / "migrations/004_machine_cycles.sql").read_text().split("CREATE TABLE", 1)[1]
                cur.execute(ddl)
                cur.execute("SELECT COUNT(*) FROM sensor_telemetry")
                after = cur.fetchone()[0]
                cur.execute("SHOW TABLES LIKE 'machine_cycles'")
                if before != after or not cur.fetchone():
                    raise RuntimeError("Rehearsal did not preserve telemetry and create the cycle table")
        finally:
            conn.close()
        print(f"Backup and isolated migration passed; telemetry rows preserved: {after}")
    finally:
        os.umask(old_umask)


if __name__ == "__main__":
    main()
