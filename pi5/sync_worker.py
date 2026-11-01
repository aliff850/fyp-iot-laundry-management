"""
SpinSense Pi 5 Edge-to-Cloud Telemetry & Discovery Sync Worker
Adheres to PRD §5.3 Durable Synchronization, TI-03 Acknowledged Protocol,
and Branch Gateway and Device Onboarding Plan (docs/GATEWAY_DEVICE_ONBOARDING_PLAN.md).
"""

import json
import logging
import os
import signal
import sys
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

try:
    import pymysql
    from pymysql.cursors import DictCursor
except ImportError:
    pymysql = None
    DictCursor = None
try:
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
except ImportError:
    requests = None
    HTTPAdapter = None
    Retry = None

# Add parent directory to path to allow importing gateway_config
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
try:
    import gateway_config
except ImportError:
    from pi5 import gateway_config

# --- Logging Configuration ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] (%(process)d) %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("spinsense.sync")

# --- Environment & Configuration ---
DB_HOST = os.getenv("SPINSENSE_DB_HOST", "localhost")
DB_USER = os.getenv("SPINSENSE_DB_USER", "edge_user")
DB_PASSWORD = os.getenv("SPINSENSE_DB_PASSWORD", "")
DB_NAME = os.getenv("SPINSENSE_DB_NAME", "edge_iot")

CLOUD_BASE_URL = os.getenv("SPINSENSE_CLOUD_BASE", "").rstrip("/")

API_TIMEOUT_SECONDS = 10
BATCH_SIZE = 50
BASE_INTERVAL_SECONDS = 2.0
MAX_BACKOFF_SECONDS = 60.0

RUNNING = True


def handle_shutdown(signum, frame):
    global RUNNING
    logger.info("Shutdown signal received (%s). Draining active cycle...", signum)
    RUNNING = False


signal.signal(signal.SIGINT, handle_shutdown)
signal.signal(signal.SIGTERM, handle_shutdown)


class EdgeSyncWorker:
    def __init__(self):
        self.session = self._init_http_session()
        self.connection: Optional[Any] = None
        self.backoff_delay = BASE_INTERVAL_SECONDS

        self.gateway_id: Optional[str] = None
        self.credential: Optional[str] = None
        self.status = "unpaired"
        self.branch_id: Optional[str] = None
        self.config_revision = 1

    def _init_http_session(self) -> Any:
        if requests is None:
            return None
        session = requests.Session()
        retries = Retry(
            total=2,
            backoff_factor=0.5,
            status_forcelist=[502, 503, 504],
            raise_on_status=False,
        )
        adapter = HTTPAdapter(max_retries=retries, pool_connections=5, pool_maxsize=10)
        session.mount("https://", adapter)
        session.mount("http://", adapter)
        return session

    def get_db_connection(self) -> Any:
        if self.connection is None or not self.connection.open:
            self.connection = pymysql.connect(
                host=DB_HOST,
                user=DB_USER,
                password=DB_PASSWORD,
                database=DB_NAME,
                autocommit=False,
                cursorclass=DictCursor,
                connect_timeout=5,
                init_command="SET time_zone = '+00:00'",
            )
        else:
            self.connection.ping(reconnect=True)
        return self.connection

    def refresh_gateway_state(self):
        """Loads credentials from disk and pairing state from MariaDB."""
        creds = gateway_config.get_stored_gateway_credentials()
        if creds:
            self.gateway_id, self.credential = creds
        else:
            self.gateway_id, self.credential = None, None

        conn = self.get_db_connection()
        state = gateway_config.load_gateway_db_state(conn, self.gateway_id)
        self.status = state.get("status", "unpaired")
        self.branch_id = state.get("branch_id")
        self.config_revision = state.get("config_revision", 1)
        if self.status == "active" and not self.credential:
            raise RuntimeError("Active gateway credential file is missing")

    def refresh_cloud_gateway_status(self) -> bool:
        """Polls cloud status to detect activation, replacement, or revocation."""
        if not self.credential:
            return False

        try:
            url = f"{CLOUD_BASE_URL}/edge/claim-status"
            res = self.session.get(
                url,
                headers={"Authorization": f"Bearer {self.credential}"},
                timeout=5,
            )
            if res.status_code == 200:
                data = res.json()
                if data.get("status") == "active":
                    if self.status != "active":
                        logger.info("Gateway confirmed active in cloud; updating local state.")
                    conn = self.get_db_connection()
                    gateway_config.save_gateway_db_state(
                        conn,
                        self.gateway_id,
                        data.get("organization_id"),
                        data.get("branch_id"),
                        "active",
                        data.get("config_revision", 1),
                    )
                    self.status = "active"
                    self.branch_id = data.get("branch_id")
                    self.config_revision = data.get("config_revision", 1)
                    self.sync_device_config()
                    return True
                if data.get("status") in {"expired", "revoked", "replaced"}:
                    conn = self.get_db_connection()
                    gateway_config.save_gateway_db_state(
                        conn, self.gateway_id, data.get("organization_id"),
                        data.get("branch_id"), data["status"], self.config_revision
                    )
                    self.status = data["status"]
                    logger.warning("Gateway is %s in cloud; stopping operational sync.", self.status)
        except Exception as e:
            logger.debug("Claim status poll failed: %s", e)
        return False

    def sync_device_config(self):
        """Fetches approved device list from cloud GET /edge/config and updates local registry."""
        if self.status != "active" or not self.credential:
            return

        try:
            url = f"{CLOUD_BASE_URL}/edge/config"
            res = self.session.get(
                url,
                headers={"Authorization": f"Bearer {self.credential}"},
                timeout=API_TIMEOUT_SECONDS,
            )
            if res.status_code == 200:
                data = res.json()
                devices = data.get("devices")
                if (not isinstance(devices, list) or data.get("gateway_id") != self.gateway_id
                        or data.get("branch_id") != self.branch_id):
                    raise ValueError("Cloud device configuration has invalid identity or device list")
                conn = self.get_db_connection()
                with conn.cursor() as cursor:
                    cursor.execute("UPDATE device_registry SET status='retired' WHERE status='active'")
                    for d in devices:
                        cursor.execute(
                            """INSERT INTO device_registry
                               (source_id, cloud_device_id, device_type, source_kind, label,
                                status, capacity_kg, capabilities, config_revision)
                               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                               ON DUPLICATE KEY UPDATE
                                   cloud_device_id = VALUES(cloud_device_id),
                                   device_type = VALUES(device_type),
                                   source_kind = VALUES(source_kind),
                                   label = VALUES(label),
                                   status = VALUES(status),
                                   capacity_kg = VALUES(capacity_kg),
                                   capabilities = VALUES(capabilities),
                                   config_revision = VALUES(config_revision),
                                   updated_at = CURRENT_TIMESTAMP""",
                            (
                                d["source_id"],
                                d["id"],
                                d["device_type"],
                                d.get("source_kind", "physical"),
                                d["label"],
                                d["status"],
                                d.get("capacity_kg"),
                                json.dumps(d.get("capabilities", {})),
                                data.get("config_revision", 1),
                            ),
                        )
                conn.commit()
                self.config_revision = data.get("config_revision", 1)
                logger.info("Synchronized %d approved device(s) from cloud config (rev=%d).", len(devices), self.config_revision)
        except Exception as e:
            if self.connection and self.connection.open:
                self.connection.rollback()
            logger.warning("Failed to synchronize device config from cloud: %s", e)

    def sync_discoveries(self):
        """Syncs pending discovered candidates to cloud POST /edge/discoveries."""
        if self.status != "active" or not self.credential:
            return

        conn = self.get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute(
                """SELECT candidate_id, source_id, proposed_type, evidence_quality,
                          first_seen_at, last_seen_at
                   FROM device_discoveries
                   WHERE is_synced = 0 AND rejection_reason IS NULL
                   LIMIT 20"""
            )
            candidates = cursor.fetchall()

        if not candidates:
            return

        payload_list = []
        for c in candidates:
            quality = {}
            if c.get("evidence_quality"):
                try:
                    quality = json.loads(c["evidence_quality"])
                except Exception:
                    pass

            payload_list.append({
                "candidate_id": c["candidate_id"],
                "source_id": c["source_id"],
                "proposed_type": c.get("proposed_type"),
                "evidence_quality": quality,
                "first_seen_at": c["first_seen_at"].isoformat() if hasattr(c["first_seen_at"], "isoformat") else str(c["first_seen_at"]),
                "last_seen_at": c["last_seen_at"].isoformat() if hasattr(c["last_seen_at"], "isoformat") else str(c["last_seen_at"]),
            })

        try:
            url = f"{CLOUD_BASE_URL}/edge/discoveries"
            res = self.session.post(
                url,
                json={"candidates": payload_list},
                headers={"Authorization": f"Bearer {self.credential}"},
                timeout=API_TIMEOUT_SECONDS,
            )
            if res.status_code == 200:
                submitted = {str(c["candidate_id"]) for c in candidates}
                body = res.json()
                accepted = body.get("accepted_ids")
                rejected = body.get("rejected", [])
                if (not isinstance(accepted, list) or not isinstance(rejected, list)
                        or any(str(item) not in submitted for item in accepted)
                        or any(not isinstance(item, dict) or str(item.get("candidate_id")) not in submitted
                               or not isinstance(item.get("reason"), str) for item in rejected)
                        or {str(item) for item in accepted}.intersection(
                            str(item["candidate_id"]) for item in rejected)):
                    logger.warning("Invalid discovery acknowledgement; retaining pending candidates")
                    return
                with conn.cursor() as cursor:
                    if accepted:
                        placeholders = ", ".join(["%s"] * len(accepted))
                        cursor.execute(f"UPDATE device_discoveries SET is_synced = 1 WHERE candidate_id IN ({placeholders})", accepted)
                    for item in rejected:
                        if item.get("retryable") is False:
                            cursor.execute(
                                "UPDATE device_discoveries SET rejection_reason=%s WHERE candidate_id=%s",
                                (item["reason"][:255], item["candidate_id"]),
                            )
                conn.commit()
                logger.info("Cloud acknowledged %d discovery candidate(s).", len(accepted))
        except Exception as e:
            logger.warning("Failed to sync discoveries to cloud: %s", e)

    def fetch_pending_telemetry(self, limit: int = BATCH_SIZE) -> List[Dict[str, Any]]:
        conn = self.get_db_connection()
        with conn.cursor() as cursor:
            sql = """
                SELECT id, record_id, source_id, boot_id, sequence, gateway_receipt_at,
                       recorded_at, data_payload, device_id, source_kind, source_time_quality,
                       quality_metadata
                FROM sensor_telemetry
                WHERE is_synced = 0 AND quarantine_reason IS NULL AND gateway_id = %s
                ORDER BY id ASC
                LIMIT %s;
            """
            cursor.execute(sql, (self.gateway_id, limit))
            return cursor.fetchall()

    def update_sync_status(self, accepted_ids: List[int], rejected_records: List[Dict[str, Any]]):
        """Strictly acknowledges ONLY committed IDs with cloud_acknowledged_at timestamp."""
        conn = self.get_db_connection()
        with conn.cursor() as cursor:
            if accepted_ids:
                placeholders = ", ".join(["%s"] * len(accepted_ids))
                cursor.execute(
                    f"""UPDATE sensor_telemetry
                        SET is_synced = 1, cloud_acknowledged_at = CURRENT_TIMESTAMP
                        WHERE id IN ({placeholders});""",
                    accepted_ids,
                )

            for rej in rejected_records:
                edge_id = rej.get("edge_id")
                reason = rej.get("reason", "Rejected by cloud")
                if edge_id:
                    cursor.execute(
                        """UPDATE sensor_telemetry
                           SET is_synced = -1, quarantine_reason = %s
                           WHERE id = %s;""",
                        (str(reason)[:255], edge_id),
                    )
        conn.commit()

    def run_sync_cycle(self) -> int:
        if not DB_PASSWORD or not CLOUD_BASE_URL.startswith("https://"):
            raise RuntimeError("Database password and HTTPS cloud endpoint are required")
        self.refresh_gateway_state()

        if self.status != "active":
            if self.status == "awaiting_confirmation":
                self.refresh_cloud_gateway_status()
            return 0

        # Sync discoveries
        self.sync_discoveries()

        # Sync telemetry
        records = self.fetch_pending_telemetry(limit=BATCH_SIZE)
        if not records:
            try:
                response = self.session.post(
                    f"{CLOUD_BASE_URL}/edge/sync",
                    json={"schema_version": 1, "gateway_id": self.gateway_id,
                          "batch_id": str(uuid.uuid4()), "heartbeat": True, "records": []},
                    headers={"Authorization": f"Bearer {self.credential}"},
                    timeout=API_TIMEOUT_SECONDS,
                )
                response.raise_for_status()
                revision = response.json().get("config_revision", self.config_revision)
                if isinstance(revision, int) and revision > self.config_revision:
                    self.sync_device_config()
            except requests.exceptions.RequestException as error:
                logger.warning("Heartbeat failed: %s", error)
                if getattr(error.response, "status_code", None) == 403:
                    self.refresh_cloud_gateway_status()
            self.backoff_delay = BASE_INTERVAL_SECONDS
            return 0

        logger.info("Preparing sync batch for %d record(s)...", len(records))

        batch_records = []
        batch_ids = []

        for row in records:
            payload_data = row["data_payload"]
            if isinstance(payload_data, str):
                try:
                    payload_data = json.loads(payload_data)
                except json.JSONDecodeError:
                    self.update_sync_status(accepted_ids=[], rejected_records=[{"edge_id": row["id"], "reason": "Corrupt JSON"}])
                    continue

            record_uuid = row.get("record_id")
            if not record_uuid:
                self.update_sync_status(accepted_ids=[], rejected_records=[{"edge_id": row["id"], "reason": "Missing stable record ID"}])
                continue
            batch_ids.append(row["id"])
            batch_records.append({
                "record_id": record_uuid,
                "edge_id": row["id"],
                "source_id": row["source_id"] or row.get("device_id") or "unknown_node",
                "boot_id": row.get("boot_id"),
                "sequence": row.get("sequence"),
                "gateway_receipt_at": row["gateway_receipt_at"].isoformat() if row.get("gateway_receipt_at") and hasattr(row["gateway_receipt_at"], "isoformat") else str(row.get("gateway_receipt_at") or row["recorded_at"]),
                "source_recorded_at": (row["recorded_at"].isoformat() if hasattr(row["recorded_at"], "isoformat")
                                       else str(row["recorded_at"])) if row.get("source_time_quality") in {"device_reported", "assumed_utc"} else None,
                "payload": payload_data,
                "source_kind": row.get("source_kind") or "physical",
                "quality": {**(json.loads(row["quality_metadata"]) if row.get("quality_metadata") else {}),
                            "source_time_quality": row.get("source_time_quality") or "unknown"},
            })

        if not batch_records:
            return 0

        url = f"{CLOUD_BASE_URL}/edge/sync"
        batch_payload = {
            "schema_version": 1,
            "gateway_id": self.gateway_id,
            "batch_id": str(uuid.uuid4()),
            "records": batch_records,
        }

        try:
            response = self.session.post(
                url,
                json=batch_payload,
                headers={"Authorization": f"Bearer {self.credential}"},
                timeout=API_TIMEOUT_SECONDS,
            )

            if response.status_code == 200:
                body = response.json()
                # Strict: ONLY IDs present in accepted_ids are marked synced
                accepted_ids = body.get("accepted_ids")
                rejected = body.get("rejected", [])
                if not isinstance(accepted_ids, list) or not isinstance(rejected, list):
                    logger.warning("Malformed cloud acknowledgement; retaining batch")
                    return 0
                submitted = set(batch_ids)
                if any(not isinstance(item, int) or item not in submitted for item in accepted_ids):
                    logger.warning("Cloud acknowledged an unknown edge ID; retaining batch")
                    return 0
                if any(not isinstance(item, dict) or item.get("edge_id") not in submitted for item in rejected):
                    logger.warning("Cloud rejected an unknown edge ID; retaining batch")
                    return 0

                self.update_sync_status(accepted_ids=accepted_ids, rejected_records=rejected)
                logger.info(
                    "Cloud acknowledged %d/%d records (rejected=%d).",
                    len(accepted_ids),
                    len(batch_ids),
                    len(rejected),
                )

                new_rev = body.get("config_revision", self.config_revision)
                if new_rev > self.config_revision:
                    self.sync_device_config()

                self.backoff_delay = BASE_INTERVAL_SECONDS
                return len(accepted_ids)

            elif response.status_code == 403:
                logger.warning("Gateway rejected by cloud (status=%d). Refreshing state.", response.status_code)
                self.refresh_cloud_gateway_status()
                self.backoff_delay = min(self.backoff_delay * 2, MAX_BACKOFF_SECONDS)
                return 0

            else:
                logger.warning("Cloud error (HTTP %d). Retrying batch.", response.status_code)
                self.backoff_delay = min(self.backoff_delay * 2, MAX_BACKOFF_SECONDS)
                return 0

        except requests.exceptions.RequestException as err:
            logger.warning("Network failure connecting to cloud (%s). Backing off.", err)
            self.backoff_delay = min(self.backoff_delay * 1.5, MAX_BACKOFF_SECONDS)
            return 0

    def close(self):
        if self.connection and self.connection.open:
            self.connection.close()
        self.session.close()


def main():
    logger.info("Starting SpinSense Edge-to-Cloud Sync Worker on Raspberry Pi 5...")
    worker = EdgeSyncWorker()

    try:
        while RUNNING:
            try:
                worker.run_sync_cycle()
            except Exception as e:
                logger.error("Error in sync worker cycle: %s", e, exc_info=True)
            time.sleep(worker.backoff_delay)
    finally:
        worker.close()
        logger.info("Sync worker stopped cleanly.")


if __name__ == "__main__":
    main()
