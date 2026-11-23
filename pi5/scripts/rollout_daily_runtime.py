"""Private backup, isolated rehearsal, and guarded additive Pi migration 005."""
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pymysql

ROOT = Path(__file__).resolve().parents[1]
GATEWAY_ROOT = ROOT.parent if ROOT.name.startswith("staging-") else ROOT
BACKUP = Path("/home/aliff850/edge_backups/machine-daily-20261113")
TEST_DB = "edge_iot_daily_test_20261113"


def config(path):
    values = {}
    for line in path.read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"')
    return values


def connect(values, database):
    return pymysql.connect(host=values.get("SPINSENSE_DB_HOST", "localhost"),
        user=values["SPINSENSE_DB_USER"], password=values["SPINSENSE_DB_PASSWORD"],
        database=database, autocommit=True, init_command="SET time_zone = '+00:00'")


def ddl():
    return "CREATE TABLE" + (ROOT / "migrations/005_machine_daily_runtime.sql").read_text().split("CREATE TABLE", 1)[1]


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in {"rehearse", "apply"}:
        raise SystemExit("usage: rollout_daily_runtime.py rehearse|apply")
    values = config(GATEWAY_ROOT / ".env")
    if values.get("SPINSENSE_DB_NAME") != "edge_iot":
        raise RuntimeError("Unexpected live database")
    sim = config(GATEWAY_ROOT / "simulator-washer.env")
    state = Path(sim["SIMULATOR_STATE_FILE"])
    dump = BACKUP / "edge_iot-before-daily.sql"
    state_copy = BACKUP / "washer-before-daily.sqlite"
    if sys.argv[1] == "rehearse":
        BACKUP.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(BACKUP, 0o700)
        if dump.exists() or state_copy.exists() or not state.is_file():
            raise RuntimeError("Backup exists or simulator SQLite is missing")
        with connect(values, TEST_DB) as conn, conn.cursor() as cur:
            cur.execute("SHOW TABLES")
            if cur.fetchone():
                raise RuntimeError("Rehearsal database must be empty")
        old_umask = os.umask(0o077)
        try:
            env = {**os.environ, "MYSQL_PWD": values["SPINSENSE_DB_PASSWORD"]}
            with dump.open("xb") as output:
                result = subprocess.run(["mariadb-dump", "--single-transaction", "--host",
                    values.get("SPINSENSE_DB_HOST", "localhost"), "--user", values["SPINSENSE_DB_USER"],
                    "edge_iot"], stdout=output, stderr=subprocess.DEVNULL, env=env)
            if result.returncode or dump.stat().st_size < 1000:
                raise RuntimeError("MariaDB backup failed")
            with sqlite3.connect(state) as source, sqlite3.connect(state_copy) as target:
                source.backup(target)
            os.chmod(state_copy, 0o600)
            with dump.open("rb") as source:
                result = subprocess.run(["mariadb", "--host", values.get("SPINSENSE_DB_HOST", "localhost"),
                    "--user", values["SPINSENSE_DB_USER"], TEST_DB], stdin=source,
                    stderr=subprocess.DEVNULL, env=env)
            if result.returncode:
                raise RuntimeError("Isolated restore failed")
        finally:
            os.umask(old_umask)
        with connect(values, TEST_DB) as conn, conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM machine_cycles")
            before = cur.fetchone()[0]
            cur.execute(ddl())
            cur.execute("SELECT COUNT(*) FROM machine_cycles")
            if cur.fetchone()[0] != before:
                raise RuntimeError("Rehearsal changed recorded cycles")
            cur.execute("SHOW TABLES LIKE 'machine_cycle_daily_runtime'")
            if not cur.fetchone():
                raise RuntimeError("Rehearsal table missing")
        (BACKUP / "rehearsed").write_text(str(before))
        print(f"Private backup and restored migration passed; preserved {before} cycle rows")
    else:
        if not dump.is_file() or not state_copy.is_file() or not (BACKUP / "rehearsed").is_file():
            raise RuntimeError("Private backup and rehearsal are required")
        with connect(values, "edge_iot") as conn, conn.cursor() as cur:
            cur.execute("SHOW TABLES LIKE 'machine_cycle_daily_runtime'")
            if cur.fetchone():
                raise RuntimeError("Daily runtime table already exists")
            cur.execute(ddl())
            cur.execute("SHOW TABLES LIKE 'machine_cycle_daily_runtime'")
            if not cur.fetchone():
                raise RuntimeError("Live daily runtime table missing")
        print("Additive daily runtime table applied; existing cycle rows unchanged")


if __name__ == "__main__":
    main()
