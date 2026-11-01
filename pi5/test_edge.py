"""Unit tests for Pi 5 edge ingestion, sync, and configuration logic."""

import json
import os
import tempfile
from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest

import gateway_config
from ingestion_worker import EdgeIngestionWorker
from sync_worker import EdgeSyncWorker


def test_gateway_credentials_generation():
    with tempfile.TemporaryDirectory() as tmpdir:
        cred_file = os.path.join(tmpdir, "test_gateway.json")
        gw_id, cred = gateway_config.get_or_create_gateway_credentials(cred_file)

        assert len(gw_id) == 36
        assert len(cred) == 64

        # Re-reading should return the exact same credentials
        gw_id2, cred2 = gateway_config.get_or_create_gateway_credentials(cred_file)
        assert gw_id == gw_id2
        assert cred == cred2


def test_ingestion_payload_normalization_legacy_format():
    worker = EdgeIngestionWorker()
    raw = json.dumps({
        "device_id": "ESP32-NODE-01",
        "data": {
            "voltage": 1.25,
            "lpg_weight_kg": 14.2,
            "seq": 42,
        }
    })

    # Normalized from legacy topic (nodes/telemetry)
    dev_id, rec_at, data = worker.normalize_payload(raw, topic_device=None)
    assert dev_id == "ESP32-NODE-01"
    assert data["voltage"] == 1.25
    assert data["seq"] == 42


def test_ingestion_payload_normalization_canonical_format():
    worker = EdgeIngestionWorker()
    raw = json.dumps({
        "voltage": 2.1,
        "temperature": 27.5,
    })

    # Topic has canonical device ID
    topic_dev = "WASHER-01"
    dev_id, rec_at, data = worker.normalize_payload(raw, topic_device=topic_dev)
    assert dev_id == "WASHER-01"
    assert data["voltage"] == 2.1


def test_ingestion_deduplication():
    worker = EdgeIngestionWorker()
    raw = '{"device_id": "NODE-1", "data": {"seq": 100}}'

    # First time -> not duplicate
    assert worker._is_duplicate("NODE-1", raw, sequence=100) is False
    # Second time with same sequence -> duplicate!
    assert worker._is_duplicate("NODE-1", raw, sequence=100) is True
    # Different sequence -> not duplicate
    assert worker._is_duplicate("NODE-1", raw, sequence=101) is False


def test_sync_worker_acknowledged_only_update():
    worker = EdgeSyncWorker()
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
    worker.connection = mock_conn

    # Only IDs [10, 12] acknowledged; ID 11 rejected
    worker.update_sync_status(
        accepted_ids=[10, 12],
        rejected_records=[{"edge_id": 11, "reason": "Unapproved source"}],
    )

    sql_calls = [c.args[0] for c in mock_cursor.execute.call_args_list]
    assert any("UPDATE sensor_telemetry\n                        SET is_synced = 1" in q or "UPDATE sensor_telemetry SET is_synced = 1" in q for q in sql_calls)
    assert any("SET is_synced = -1, quarantine_reason" in q for q in sql_calls)

