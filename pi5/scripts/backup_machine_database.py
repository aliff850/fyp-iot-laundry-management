"""Create a private pre-cutover dump without putting the DB password in argv."""
import os
import subprocess
from pathlib import Path


def main():
    root = Path(__file__).resolve().parent
    values = {}
    for line in (root / ".env").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"')
    if values.get("SPINSENSE_DB_NAME") != "edge_iot":
        raise RuntimeError("Expected live edge_iot database")
    target_dir = Path("/home/aliff850/edge_backups/machine-controls-20261112")
    target_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    target = target_dir / "edge_iot-pre-machine.sql"
    if target.exists():
        raise RuntimeError("Backup already exists; will not overwrite it")
    old_umask = os.umask(0o077)
    try:
        env = {**os.environ, "MYSQL_PWD": values["SPINSENSE_DB_PASSWORD"]}
        with target.open("xb") as output:
            result = subprocess.run(["mariadb-dump", "--single-transaction",
                "--host", values.get("SPINSENSE_DB_HOST", "localhost"),
                "--user", values["SPINSENSE_DB_USER"], "edge_iot"],
                stdout=output, stderr=subprocess.PIPE, env=env, check=False)
        if result.returncode or target.stat().st_size < 1000:
            target.unlink(missing_ok=True)
            raise RuntimeError("Database dump failed or was unexpectedly small")
        print(f"Private pre-cutover dump ready: {target.stat().st_size} bytes, mode {oct(target.stat().st_mode & 0o777)}")
    finally:
        os.umask(old_umask)


if __name__ == "__main__":
    main()
