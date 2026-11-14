"""Back up live MariaDB, then rehearse presence DDL in an isolated database."""
import os
import subprocess
from pathlib import Path

import pymysql

ROOT = Path(__file__).resolve().parent
BACKUP = Path("/home/aliff850/edge_backups/esp32-machine-cutover-20261113/edge_iot-before-presence.sql")
TEST_DB = "edge_iot_demo_test_20261113"


def main():
    values = {}
    for line in (ROOT / ".env").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"')
    if values.get("SPINSENSE_DB_NAME") != "edge_iot":
        raise RuntimeError("Expected live edge_iot configuration")
    env = {**os.environ, "MYSQL_PWD": values["SPINSENSE_DB_PASSWORD"]}
    BACKUP.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    previous_umask = os.umask(0o077)
    try:
        with BACKUP.open("xb") as output:
            result = subprocess.run(["mariadb-dump", "--single-transaction", "--databases", "edge_iot",
                "-h", values.get("SPINSENSE_DB_HOST", "localhost"), "-u", values["SPINSENSE_DB_USER"]],
                stdout=output, stderr=subprocess.PIPE, env=env, check=False)
        if result.returncode or BACKUP.stat().st_size < 1000:
            BACKUP.unlink(missing_ok=True)
            raise RuntimeError("Live MariaDB backup failed")
    finally:
        os.umask(previous_umask)
    print("Private live backup:", BACKUP.stat().st_size, "bytes, mode", oct(BACKUP.stat().st_mode & 0o777))
    sql = (ROOT / "migrations" / "007_machine_presence.sql").read_bytes()
    result = subprocess.run(["mariadb", "-h", values.get("SPINSENSE_DB_HOST", "localhost"),
        "-u", values["SPINSENSE_DB_USER"], TEST_DB], input=sql, stderr=subprocess.PIPE,
        env=env, check=False)
    if result.returncode:
        raise RuntimeError("Isolated presence migration failed")
    conn = pymysql.connect(host=values.get("SPINSENSE_DB_HOST", "localhost"),
        user=values["SPINSENSE_DB_USER"], password=values["SPINSENSE_DB_PASSWORD"],
        database=TEST_DB)
    try:
        with conn.cursor() as cursor:
            cursor.execute("SHOW TABLES LIKE 'machine_presence'")
            assert cursor.fetchone()
            cursor.execute("SELECT COUNT(*) FROM machine_presence")
            assert cursor.fetchone()[0] == 0
        print("Isolated presence table verified; live schema unchanged")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
