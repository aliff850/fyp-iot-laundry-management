"""Set the Pi dashboard's separate local staff credential without printing secrets."""

import getpass
import os
import secrets
import tempfile
from pathlib import Path

from werkzeug.security import generate_password_hash


def configure(env_path: Path) -> None:
    if not env_path.is_file():
        raise RuntimeError("Run from the edge_gateway directory containing the existing .env")
    password = getpass.getpass("New local staff dashboard password (at least 16 characters): ")
    confirmation = getpass.getpass("Confirm local staff dashboard password: ")
    if len(password) < 16 or password != confirmation:
        raise ValueError("Passwords must match and contain at least 16 characters")
    updates = {
        "SPINSENSE_STAFF_USERNAME": "staff",
        "SPINSENSE_STAFF_PASSWORD_HASH": generate_password_hash(password),
        "SPINSENSE_STAFF_SESSION_SECRET": secrets.token_hex(32),
    }
    original = env_path.read_text(encoding="utf-8").splitlines()
    revised = [line for line in original if line.split("=", 1)[0] not in updates]
    revised.extend(f"{key}={value}" for key, value in updates.items())
    temporary = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=env_path.parent,
                                         prefix=".spinsense-env-", delete=False) as stream:
            temporary = Path(stream.name)
            os.chmod(temporary, 0o600)
            stream.write("\n".join(revised) + "\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, env_path)
        os.chmod(env_path, 0o600)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()
    print("Local staff dashboard credential configured. Username: staff.")


if __name__ == "__main__":
    configure(Path.cwd() / ".env")
