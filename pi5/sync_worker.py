"""
SpinSense Pi 5 Edge-to-Cloud Telemetry Sync Worker
Adheres to PRD §5.3 Durable Synchronization & TI-03 Acknowledged Protocol
"""

import json
import logging
import os
import signal
import sys
import time
from typing import Any, Dict, List, Optional, Tuple

import pymysql
from pymysql.cursors import DictCursor
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

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
DB_PASSWORD = os.getenv("SPINSENSE_DB_PASSWORD", "volvo850chungus")
DB_NAME = os.getenv("SPINSENSE_DB_NAME", "edge_iot")

CLOUD_API_URL = os.getenv("SPINSENSE_CLOUD_URL", "https://esp32-gas-api.onrender.com/api/v1/telemetry/batch")
GATEWAY_TOKEN = os.getenv("SPINSENSE_GATEWAY_TOKEN", "spinsense-edge-gw-default")
BRANCH_ID = os.getenv("SPINSENSE_BRANCH_ID", "msu-shah-alam")

API_TIMEOUT_SECONDS = 10
BATCH_SIZE = 50
BASE_INTERVAL_SECONDS = 2.0   # Target per PRD §5.5
MAX_BACKOFF_SECONDS = 60.0

# --- State Control ---
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
        self.connection: Optional[pymysql.Connection] = None
        self.backoff_delay = BASE_INTERVAL_SECONDS

    def _init_http_session(self) -> requests.Session:
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
        session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {GATEWAY_TOKEN}",
            "X-Branch-ID": BRANCH_ID,
        })
        return session

    def get_db_connection(self) -> pymysql.Connection:
        if self.connection is None or not self.connection.open:
            self.connection = pymysql.connect(
                host=DB_HOST,
                user=DB_USER,
                password=DB_PASSWORD,
                database=DB_NAME,
                autocommit=False,
                cursorclass=DictCursor,
                connect_timeout=5,
            )
        else:
            self.connection.ping(reconnect=True)
        return self.connection

    def fetch_pending_batch(self, limit: int = BATCH_SIZE) -> List[Dict[str, Any]]:
        conn = self.get_db_connection()
        with conn.cursor() as cursor:
            # Query un-synced records, excluding quarantined (-1)
            sql = """
                SELECT id, device_id, recorded_at, data_payload 
                FROM sensor_telemetry 
                WHERE is_synced = 0 
                ORDER BY id ASC 
                LIMIT %s;
            """
            cursor.execute(sql, (limit,))
            return cursor.fetchall()

    def update_sync_status(self, accepted_ids: List[int], quarantined_ids: Optional[List[int]] = None):
        """Transactionally commits acknowledged IDs and flags quarantined failures."""
        if not accepted_ids and not quarantined_ids:
            return

        conn = self.get_db_connection()
        with conn.cursor() as cursor:
            if accepted_ids:
                placeholders = ", ".join(["%s"] * len(accepted_ids))
                cursor.execute(
                    f"UPDATE sensor_telemetry SET is_synced = 1 WHERE id IN ({placeholders});",
                    accepted_ids,
                )
            if quarantined_ids:
                placeholders = ", ".join(["%s"] * len(quarantined_ids))
                cursor.execute(
                    f"UPDATE sensor_telemetry SET is_synced = -1 WHERE id IN ({placeholders});",
                    quarantined_ids,
                )
        conn.commit()

    def run_sync_cycle(self) -> int:
        """Executes one sync cycle. Returns number of records synced."""
        records = self.fetch_pending_batch(limit=BATCH_SIZE)
        if not records:
            self.backoff_delay = BASE_INTERVAL_SECONDS
            return 0

        logger.info("Preparing sync batch for %d record(s)...", len(records))

        batch_payload = []
        batch_ids = []
        quarantine_local = []

        for row in records:
            payload_data = row["data_payload"]
            if isinstance(payload_data, str):
                try:
                    payload_data = json.loads(payload_data)
                except json.JSONDecodeError:
                    logger.warning("Record #%d has corrupted JSON payload. Quarantining.", row["id"])
                    quarantine_local.append(row["id"])
                    continue

            batch_ids.append(row["id"])
            batch_payload.append({
                "edge_record_id": row["id"],
                "device_id": row["device_id"],
                "recorded_at": (
                    row["recorded_at"].isoformat()
                    if hasattr(row["recorded_at"], "isoformat")
                    else str(row["recorded_at"])
                ),
                "data": payload_data,
            })

        # Immediately quarantine any records that failed local serialization
        if quarantine_local:
            self.update_sync_status(accepted_ids=[], quarantined_ids=quarantine_local)

        if not batch_payload:
            return 0

        # Outbound POST to Cloud FastAPI
        try:
            response = self.session.post(
                CLOUD_API_URL,
                json={"batch": batch_payload, "branch_id": BRANCH_ID},
                timeout=API_TIMEOUT_SECONDS,
            )

            if response.status_code == 200:
                body = response.json()
                # Acknowledged protocol support:
                accepted_ids = body.get("accepted_ids", batch_ids)
                rejected_ids = body.get("rejected_ids", [])

                self.update_sync_status(accepted_ids=accepted_ids, quarantined_ids=rejected_ids)
                logger.info(
                    "Cloud accepted %d/%d records (quarantined=%d).",
                    len(accepted_ids),
                    len(batch_ids),
                    len(rejected_ids),
                )
                self.backoff_delay = BASE_INTERVAL_SECONDS
                return len(accepted_ids)

            elif 400 <= response.status_code < 500:
                logger.error("Cloud rejected payload (HTTP %d): %s", response.status_code, response.text)
                # Client error: back off to prevent tight crash loop
                self.backoff_delay = min(self.backoff_delay * 2, MAX_BACKOFF_SECONDS)
                return 0

            else:
                logger.warning("Cloud server error (HTTP %d). Will retry batch.", response.status_code)
                self.backoff_delay = min(self.backoff_delay * 2, MAX_BACKOFF_SECONDS)
                return 0

        except requests.exceptions.RequestException as err:
            logger.warning("Network failure reaching cloud (%s). Backing off.", err)
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
            synced_count = worker.run_sync_cycle()

            # Backlog drain optimization:
            # If we just synced a full batch, check immediately without sleeping
            if synced_count == BATCH_SIZE and RUNNING:
                continue

            time.sleep(worker.backoff_delay)
    finally:
        worker.close()
        logger.info("Sync worker stopped cleanly.")


if __name__ == "__main__":
    main()
