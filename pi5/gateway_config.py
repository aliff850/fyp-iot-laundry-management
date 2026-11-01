"""
SpinSense Pi 5 Gateway Identity & Local Credential Manager
Securely provisions, stores, and loads local gateway UUID and bearer secret.
"""

import json
import logging
import os
import secrets
import stat
import uuid
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger("spinsense.config")

DEFAULT_CREDENTIAL_PATH = os.getenv(
    "SPINSENSE_CREDENTIALS_FILE",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), ".spinsense_gateway.json"),
)


def get_or_create_gateway_credentials(filepath: str = DEFAULT_CREDENTIAL_PATH) -> Tuple[str, str]:
    """
    Returns (gateway_id, bearer_credential).
    If file exists, securely reads it.
    If not, generates a new UUID and 256-bit random secret, writing with 0600 permissions.
    """
    if os.path.lexists(filepath):
        stored = get_stored_gateway_credentials(filepath)
        if stored is None:
            raise RuntimeError("Gateway credential file is invalid; preserve it for recovery")
        return stored

    gw_id = str(uuid.uuid4())
    cred = secrets.token_hex(32)  # 256-bit bearer secret
    os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
    try:
        fd = os.open(filepath, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        stored = get_stored_gateway_credentials(filepath)
        if stored is None:
            raise RuntimeError("Gateway credential file is invalid; preserve it for recovery")
        return stored
    with os.fdopen(fd, "w", encoding="utf-8") as file:
        json.dump({"gateway_id": gw_id, "credential": cred}, file)
        file.flush()
        os.fsync(file.fileno())
    os.chmod(filepath, stat.S_IRUSR | stat.S_IWUSR)

    logger.info("Generated new gateway identity %s at %s", gw_id, filepath)
    return gw_id, cred


def get_stored_gateway_credentials(filepath: str = DEFAULT_CREDENTIAL_PATH) -> Optional[Tuple[str, str]]:
    """Returns (gateway_id, bearer_credential) if credentials file exists, else None."""
    if not os.path.lexists(filepath):
        return None
    try:
        details = os.lstat(filepath)
        if not stat.S_ISREG(details.st_mode):
            raise ValueError("Gateway credential path is not a regular file")
        if os.name != "nt" and details.st_mode & (stat.S_IRWXG | stat.S_IRWXO):
            raise ValueError("Gateway credential file permissions are too broad")
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
        gw_id = str(uuid.UUID(data["gateway_id"]))
        credential = data["credential"]
        if not isinstance(credential, str) or len(credential) != 64:
            raise ValueError("Invalid gateway credential")
        bytes.fromhex(credential)
        return gw_id, credential
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
        raise RuntimeError("Gateway credential file is invalid; preserve it for recovery") from error


def load_gateway_db_state(conn, gateway_id: Optional[str] = None) -> Dict[str, Any]:
    """Queries local state only for the credential file's gateway identity."""
    row = None
    with conn.cursor() as cursor:
        if gateway_id:
            cursor.execute(
                """SELECT gateway_id, organization_id, branch_id, status, config_revision,
                          created_at, updated_at
                   FROM gateway_configuration WHERE gateway_id=%s""",
                (gateway_id,),
            )
            row = cursor.fetchone()
    return row or {
        "gateway_id": None,
        "organization_id": None,
        "branch_id": None,
        "status": "unpaired",
        "config_revision": 1,
    }


def save_gateway_db_state(
    conn,
    gateway_id: str,
    organization_id: Optional[str],
    branch_id: Optional[str],
    status: str,
    config_revision: int = 1,
):
    """Upserts gateway configuration in local MariaDB."""
    with conn.cursor() as cursor:
        cursor.execute(
            """INSERT INTO gateway_configuration
               (gateway_id, organization_id, branch_id, status, config_revision)
               VALUES (%s, %s, %s, %s, %s)
               ON DUPLICATE KEY UPDATE
                   organization_id = VALUES(organization_id),
                   branch_id = VALUES(branch_id),
                   status = VALUES(status),
                   config_revision = VALUES(config_revision),
                   updated_at = CURRENT_TIMESTAMP""",
            (gateway_id, organization_id, branch_id, status, config_revision),
        )
    conn.commit()

