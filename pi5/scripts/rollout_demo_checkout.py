"""Private MariaDB backup, isolated migration rehearsal, guarded live apply."""
import os
import subprocess
import sys
from pathlib import Path

import pymysql

ROOT = Path(__file__).resolve().parents[1]
GATEWAY_ROOT = ROOT.parent if ROOT.name.startswith("staging-") else ROOT
BACKUP = Path("/home/aliff850/edge_backups/demo-checkout-20261113")
TEST_DB = "edge_iot_demo_test_20261113"


def config():
    values = {}
    for line in (GATEWAY_ROOT / ".env").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"')
    if values.get("SPINSENSE_DB_NAME") != "edge_iot":
        raise RuntimeError("Expected live edge_iot database")
    return values


def connect(values, database):
    return pymysql.connect(host=values.get("SPINSENSE_DB_HOST", "localhost"),
        user=values["SPINSENSE_DB_USER"], password=values["SPINSENSE_DB_PASSWORD"],
        database=database, autocommit=True, init_command="SET time_zone = '+00:00'")


def ddl():
    return "CREATE TABLE" + (ROOT / "migrations/006_demo_checkouts.sql").read_text().split("CREATE TABLE", 1)[1]


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ("rehearse", "apply"):
        raise SystemExit("usage: rollout_demo_checkout.py rehearse|apply")
    values = config()
    dump = BACKUP / "edge_iot-before-demo.sql"
    if sys.argv[1] == "rehearse":
        with connect(values, TEST_DB) as conn, conn.cursor() as cur:
            cur.execute("SHOW TABLES")
            if cur.fetchone():
                raise RuntimeError("Rehearsal database must be empty")
        BACKUP.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(BACKUP, 0o700)
        if dump.exists():
            raise RuntimeError("Backup already exists; refusing to overwrite")
        env = {**os.environ, "MYSQL_PWD": values["SPINSENSE_DB_PASSWORD"]}
        old_umask = os.umask(0o077)
        try:
            with dump.open("xb") as output:
                result = subprocess.run(["mariadb-dump", "--single-transaction", "--host",
                    values.get("SPINSENSE_DB_HOST", "localhost"), "--user", values["SPINSENSE_DB_USER"],
                    "edge_iot"], stdout=output, stderr=subprocess.DEVNULL, env=env)
            if result.returncode or dump.stat().st_size < 1000:
                raise RuntimeError("Private database backup failed")
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
            if before != cur.fetchone()[0]:
                raise RuntimeError("Rehearsal changed cycle history")
            cur.execute("SHOW TABLES LIKE 'demo_checkouts'")
            if not cur.fetchone():
                raise RuntimeError("Checkout table missing in rehearsal")
        (BACKUP / "rehearsed").write_text(str(before))
        print(f"Private backup and isolated migration passed; preserved {before} cycles")
    else:
        if not dump.is_file() or not (BACKUP / "rehearsed").is_file():
            raise RuntimeError("Backup and rehearsal required before live apply")
        with connect(values, "edge_iot") as conn, conn.cursor() as cur:
            cur.execute("SHOW TABLES LIKE 'demo_checkouts'")
            if cur.fetchone():
                raise RuntimeError("Checkout table already exists")
            cur.execute(ddl())
            cur.execute("SHOW TABLES LIKE 'demo_checkouts'")
            if not cur.fetchone():
                raise RuntimeError("Live checkout table missing")
        print("Additive checkout table applied; cycle records unchanged")


if __name__ == "__main__":
    main()
