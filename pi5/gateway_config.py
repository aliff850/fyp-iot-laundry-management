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
    if os.path.exists(filepath):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
                gw_id = data.get("gateway_id")
                cred = data.get("credential")
                if gw_id and cred:
                    return str(gw_id), str(cred)
        except Exception as e:
            logger.error("Failed to read existing gateway credentials at %s: %s", filepath, e)

    # Generate new credentials
    gw_id = str(uuid.uuid4())
    cred = secrets.token_hex(32)  # 256-bit bearer secret

    os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump({"gateway_id": gw_id, "credential": cred}, f, indent=2)

    # Restrict permissions to read/write only by owner (0600)
    try:
        os.chmod(filepath, stat.S_IRUSR | stat.S_IWUSR)
    except Exception as e:
        logger.warning("Could not set 0600 permissions on %s (ignorable on Windows): %s", filepath, e)

    logger.info("Generated new gateway identity %s at %s", gw_id, filepath)
    return gw_id, cred


def get_stored_gateway_credentials(filepath: str = DEFAULT_CREDENTIAL_PATH) -> Optional[Tuple[str, str]]:
    """Returns (gateway_id, bearer_credential) if credentials file exists, else None."""
    if not os.path.exists(filepath):
        return None
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("gateway_id"), data.get("credential")
    except Exception:
        return None


def load_gateway_db_state(conn) -> Dict[str, Any]:
    """Queries current gateway_configuration row from local MariaDB."""
    with conn.cursor() as cursor:
        cursor.execute(
            """SELECT gateway_id, organization_id, branch_id, status, config_revision,
                      created_at, updated_at
               FROM gateway_configuration
               ORDER BY created_at DESC LIMIT 1"""
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

