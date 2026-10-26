"""
SpinSense Pi 5 Local MQTT Ingestion Worker
Adheres to PRD §5.2 MQTT Boundary & §6.2 (TI-01..TI-05) Telemetry Ingestion
"""

import collections
import hashlib
import json
import logging
import os
import signal
import sys
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

try:
    import paho.mqtt.client as mqtt
except ImportError:
    mqtt = None

try:
    import pymysql
    from pymysql.cursors import DictCursor
except ImportError:
    pymysql = None
    DictCursor = None

# --- Logging Configuration ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] (%(process)d) %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("spinsense.ingest")

# --- Environment & Configuration ---
DB_HOST = os.getenv("SPINSENSE_DB_HOST", "localhost")
DB_USER = os.getenv("SPINSENSE_DB_USER", "edge_user")
DB_PASSWORD = os.getenv("SPINSENSE_DB_PASSWORD", "volvo850chungus")
DB_NAME = os.getenv("SPINSENSE_DB_NAME", "edge_iot")
BRANCH_ID = os.getenv("SPINSENSE_BRANCH_ID", "msu-shah-alam")

MQTT_BROKER = os.getenv("MQTT_BROKER", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_KEEPALIVE = int(os.getenv("MQTT_KEEPALIVE", "60"))

# PRD §5.2 Canonical Topic + Legacy Topic
TOPIC_CANONICAL = f"branches/{BRANCH_ID}/devices/+/telemetry"
TOPIC_LEGACY = "nodes/telemetry"


class EdgeIngestionWorker:
    def __init__(self):
        self.connection: Optional[pymysql.Connection] = None
        self.running = True
        # Bounded deduplication cache (PRD TI-02: duplicate MQTT delivery creates one observation)
        self._dedup_cache = collections.OrderedDict()
        self._max_dedup_size = 500

        # Setup MQTT Client (using CallbackAPIVersion.VERSION2 for paho-mqtt >= 2.0)
        if mqtt is not None:
            try:
                self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
            except AttributeError:
                self.client = mqtt.Client()  # Fallback for older paho-mqtt 1.x
            self.client.on_connect = self.on_connect
            self.client.on_disconnect = self.on_disconnect
            self.client.on_message = self.on_message
        else:
            self.client = None

    def get_db_connection(self) -> Any:
        if self.connection is not None and getattr(self.connection, "open", True):
            if hasattr(self.connection, "ping"):
                self.connection.ping(reconnect=True)
            return self.connection

        if pymysql is None:
            raise RuntimeError("pymysql is required for database connectivity. Please run: pip install pymysql")

        self.connection = pymysql.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME,
            autocommit=False,
            cursorclass=DictCursor,
            connect_timeout=5,
        )
        return self.connection

    def on_connect(self, client, userdata, flags, rc, properties=None):
        if rc == 0:
            logger.info("Connected to local Mosquitto broker (%s:%d).", MQTT_BROKER, MQTT_PORT)
            # Subscribe with QoS 1 per PRD §5.2
            client.subscribe([(TOPIC_CANONICAL, 1), (TOPIC_LEGACY, 1)])
            logger.info("Subscribed to topics: ['%s', '%s'] at QoS 1", TOPIC_CANONICAL, TOPIC_LEGACY)
        else:
            logger.error("Failed to connect to Mosquitto broker, return code: %s", rc)

    def on_disconnect(self, client, userdata, rc, properties=None, *args):
        if rc != 0:
            logger.warning("Unexpected disconnection from Mosquitto broker (rc=%s). Reconnecting...", rc)

    def _is_duplicate(self, device_id: str, payload_raw: str, sequence: Optional[Any] = None) -> bool:
        """Suppresses duplicate MQTT re-deliveries within a sliding window (PRD TI-02)."""
        if sequence is not None:
            dedup_key = f"{device_id}:seq:{sequence}"
        else:
            dedup_key = f"{device_id}:hash:{hashlib.sha256(payload_raw.encode('utf-8')).hexdigest()}"

        if dedup_key in self._dedup_cache:
            return True

        self._dedup_cache[dedup_key] = True
        if len(self._dedup_cache) > self._max_dedup_size:
            self._dedup_cache.popitem(last=False)
        return False

    def parse_topic_device(self, topic: str) -> Optional[str]:
        """Extracts device_id from canonical PRD §5.2 namespace: branches/{b}/devices/{device_id}/telemetry"""
        parts = topic.split("/")
        if len(parts) >= 5 and parts[0] == "branches" and parts[2] == "devices" and parts[4] == "telemetry":
            return parts[3]
        return None

    @staticmethod
    def parse_to_sql_datetime(val: Any) -> str:
        """
        Converts incoming ISO 8601 strings, UNIX timestamps, or nulls into a
        MariaDB DATETIME compatible string ('YYYY-MM-DD HH:MM:SS.ffffff').
        """
        if not val:
            dt = datetime.now(timezone.utc)
        elif isinstance(val, (int, float)):
            dt = datetime.fromtimestamp(val, tz=timezone.utc)
        elif isinstance(val, str):
            try:
                clean_str = val.replace("Z", "+00:00")
                dt = datetime.fromisoformat(clean_str)
                if dt.tzinfo is not None:
                    dt = dt.astimezone(timezone.utc)
                else:
                    dt = dt.replace(tzinfo=timezone.utc)
            except ValueError:
                dt = datetime.now(timezone.utc)
        elif isinstance(val, datetime):
            if val.tzinfo is not None:
                dt = val.astimezone(timezone.utc)
            else:
                dt = val.replace(tzinfo=timezone.utc)
        else:
            dt = datetime.now(timezone.utc)

        # Output standard SQL format without 'T' and without timezone offset
        return dt.strftime("%Y-%m-%d %H:%M:%S.%f")

    def normalize_payload(self, raw_payload: str, topic_device: Optional[str]) -> Tuple[str, str, Dict[str, Any]]:
        """
        Parses and normalizes telemetry payload for local MariaDB persistence.
        Returns: (device_id, recorded_at_sql, data_dict)
        """
        parsed = json.loads(raw_payload)

        # 1. Determine device_id (Topic takes precedence, followed by payload, fallback to unknown)
        device_id = topic_device or parsed.get("device_id") or parsed.get("node_id") or "unknown_node"

        # 2. Extract or generate source timestamp formatted for MariaDB DATETIME (PRD TI-04)
        raw_ts = parsed.get("recorded_at") or parsed.get("timestamp")
        recorded_at = self.parse_to_sql_datetime(raw_ts)

        # 3. Extract sensor readings dictionary for sync_worker.py / backend compatibility
        # If payload contains a nested "data" dictionary, preserve it; otherwise use the payload itself
        if "data" in parsed and isinstance(parsed["data"], dict):
            sensor_data = parsed["data"]
        else:
            sensor_data = parsed.copy()
            # Remove transport metadata if present
            sensor_data.pop("device_id", None)
            sensor_data.pop("branch_id", None)
            sensor_data.pop("recorded_at", None)

        return device_id, recorded_at, sensor_data


    def on_message(self, client, userdata, msg):
        try:
            raw_payload = msg.payload.decode("utf-8")
            topic_device = self.parse_topic_device(msg.topic)

            device_id, recorded_at, sensor_data = self.normalize_payload(raw_payload, topic_device)

            # Deduplication check
            sequence = sensor_data.get("seq") or sensor_data.get("sequence")
            if self._is_duplicate(device_id, raw_payload, sequence):
                logger.debug("Suppressed duplicate MQTT message from %s (seq=%s)", device_id, sequence)
                return

            # Persist observation to MariaDB
            conn = self.get_db_connection()
            with conn.cursor() as cursor:
                sql = """
                    INSERT INTO sensor_telemetry (device_id, recorded_at, data_payload, is_synced)
                    VALUES (%s, %s, %s, 0);
                """
                cursor.execute(sql, (device_id, recorded_at, json.dumps(sensor_data)))
            conn.commit()

            logger.info(
                "Ingested telemetry from [%s] via '%s' (recorded_at=%s)",
                device_id,
                msg.topic,
                recorded_at,
            )

        except json.JSONDecodeError as err:
            logger.warning("Discarded non-JSON MQTT payload on '%s': %s", msg.topic, err)
        except Exception as err:
            if pymysql and isinstance(err, pymysql.MySQLError):
                logger.error("Database persistence failed on MQTT ingest: %s", err)
                if self.connection:
                    self.connection.rollback()
            else:
                logger.error("Unexpected error in MQTT on_message: %s", err, exc_info=True)

    def start(self):
        logger.info("Connecting to MQTT broker %s:%d...", MQTT_BROKER, MQTT_PORT)
        self.client.connect(MQTT_BROKER, MQTT_PORT, keepalive=MQTT_KEEPALIVE)
        self.client.loop_start()

    def stop(self):
        logger.info("Stopping Edge Ingestion Worker...")
        self.running = False
        try:
            self.client.loop_stop()
            self.client.disconnect()
        except Exception:
            pass

        if self.connection and self.connection.open:
            self.connection.close()
        logger.info("Ingestion worker stopped cleanly.")


def main():
    logger.info("Starting SpinSense Edge MQTT Ingestion Worker on Raspberry Pi 5...")
    worker = EdgeIngestionWorker()

    def handle_shutdown(signum, frame):
        logger.info("Received shutdown signal (%s). Exiting cleanly...", signum)
        worker.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    worker.start()

    try:
        while worker.running:
            time.sleep(1)
    except KeyboardInterrupt:
        handle_shutdown(signal.SIGINT, None)


if __name__ == "__main__":
    main()