"""Unit tests for Pi 5 edge ingestion, sync, and configuration logic."""

import json
import os
import tempfile
from datetime import datetime, timezone
from unittest.mock import MagicMock, call

import pytest

import gateway_config
from machine_simulator import build_sample
from ingestion_worker import EdgeIngestionWorker
from sync_worker import EdgeSyncWorker, run_worker_iteration


def test_sync_iteration_keeps_machine_state_commands_and_cycles():
    worker = MagicMock()
    worker.status = "active"
    run_worker_iteration(worker)
    assert worker.mock_calls == [call.refresh_gateway_state(),
        call.sync_machine_operations(), call.run_sync_cycle(), call.sync_machine_cycles()]


def test_machine_presence_upload_uses_gateway_auth_and_current_local_identity(monkeypatch):
    worker = EdgeSyncWorker()
    worker.status = "active"
    worker.gateway_id = "gateway-1"
    worker.credential = "private-test-token"
    read_conn = MagicMock()
    cursor = read_conn.cursor.return_value.__enter__.return_value
    cursor.fetchall.side_effect = [[{"source_id": "washer-sim-01", "boot_id": "boot-1",
        "sequence": 7, "last_seen_at": datetime(2026, 11, 15, 4),
        "state_payload": json.dumps({"state": "idle", "simulation": True})}], []]
    monkeypatch.setattr(worker, "get_state_db_connection", lambda: read_conn)
    worker.session = MagicMock()
    worker.session.post.return_value.status_code = 200
    worker.session.get.return_value.json.return_value = {"commands": []}
    worker.sync_machine_operations()
    args, kwargs = worker.session.post.call_args_list[0]
    assert args[0].endswith("/edge/machine-state")
    assert kwargs["json"]["source_id"] == "washer-sim-01"
    assert kwargs["json"]["sequence"] == 7
    assert kwargs["headers"]["Authorization"] == "Bearer private-test-token"


def test_sync_machine_operations_accepts_start_maintenance_command(monkeypatch):
    worker = EdgeSyncWorker()
    worker.status = "active"
    worker.gateway_id = "gateway-1"
    worker.credential = "private-test-token"
    read_conn = MagicMock()
    read_cursor = read_conn.cursor.return_value.__enter__.return_value
    read_cursor.fetchall.side_effect = [[], []]
    write_conn = MagicMock()
    write_cursor = write_conn.cursor.return_value.__enter__.return_value
    write_cursor.fetchone.side_effect = [{"source_id": "washer-sim-01"}, None]
    monkeypatch.setattr(worker, "get_state_db_connection", lambda: read_conn)
    monkeypatch.setattr(worker, "get_db_connection", lambda: write_conn)
    worker.session = MagicMock()
    cmd_id = "22222222-2222-2222-2222-222222222222"
    worker.session.get.return_value.json.return_value = {
        "commands": [
            {
                "command_id": cmd_id,
                "source_id": "washer-sim-01",
                "action": "start_maintenance",
                "arguments": {},
                "expires_at": "2099-01-01T00:00:00Z",
            }
        ]
    }

    worker.sync_machine_operations()

    inserts = [
        call.args for call in write_cursor.execute.call_args_list
        if "INSERT IGNORE INTO machine_commands" in call.args[0]
    ]
    assert len(inserts) == 1
    assert inserts[0][1][0] == cmd_id
    assert inserts[0][1][3] == "start_maintenance"
    write_conn.commit.assert_called_once()


def test_cycle_sync_acknowledges_only_submitted_committed_ids(monkeypatch):
    worker = EdgeSyncWorker()
    worker.gateway_id = "gateway-1"
    worker.credential = "private-test-token"
    conn = MagicMock()
    cursor = conn.cursor.return_value.__enter__.return_value
    cycle = {"cycle_id": "11111111-1111-1111-1111-111111111111",
        "source_id": "washer-sim-01", "program_id": "quick", "price_myr": 4,
        "target_seconds": 30, "running_seconds": 20, "outcome": "completed",
        "started_at": datetime(2026, 11, 14, 1), "finished_at": datetime(2026, 11, 14, 1, 1)}
    cursor.fetchall.side_effect = [[cycle], []]
    monkeypatch.setattr(worker, "get_db_connection", lambda: conn)
    worker.session = MagicMock()
    response = worker.session.post.return_value
    response.json.return_value = {"accepted_cycle_ids": [cycle["cycle_id"]], "rejected": []}
    assert worker.sync_machine_cycles() == 1
    conn.rollback.assert_called_once()
    assert any("cloud_acknowledged_at=UTC_TIMESTAMP" in call.args[0]
        for call in cursor.execute.call_args_list)
    conn.commit.assert_called_once()


def test_cycle_sync_rejects_unsubmitted_acknowledgement(monkeypatch):
    worker = EdgeSyncWorker()
    worker.gateway_id = "gateway-1"
    worker.credential = "private-test-token"
    conn = MagicMock()
    cursor = conn.cursor.return_value.__enter__.return_value
    cursor.fetchall.side_effect = [[{"cycle_id": "11111111-1111-1111-1111-111111111111",
        "source_id": "washer-sim-01", "program_id": "quick", "price_myr": 4,
        "target_seconds": 30, "running_seconds": 20, "outcome": "completed",
        "started_at": datetime(2026, 11, 14, 1), "finished_at": datetime(2026, 11, 14, 1, 1)}], []]
    monkeypatch.setattr(worker, "get_db_connection", lambda: conn)
    worker.session = MagicMock()
    worker.session.post.return_value.json.return_value = {
        "accepted_cycle_ids": ["22222222-2222-2222-2222-222222222222"], "rejected": []}
    assert worker.sync_machine_cycles() == 0
    conn.rollback.assert_called_once()
    conn.commit.assert_not_called()


def test_cycle_sync_keeps_batch_on_malformed_json(monkeypatch):
    worker = EdgeSyncWorker()
    worker.gateway_id = "gateway-1"
    worker.credential = "private-test-token"
    conn = MagicMock()
    cursor = conn.cursor.return_value.__enter__.return_value
    cursor.fetchall.side_effect = [[{"cycle_id": "11111111-1111-1111-1111-111111111111",
        "source_id": "washer-sim-01", "program_id": "quick", "price_myr": 4,
        "target_seconds": 30, "running_seconds": 20, "outcome": "completed",
        "started_at": datetime(2026, 11, 14, 1), "finished_at": datetime(2026, 11, 14, 1, 1)}], []]
    monkeypatch.setattr(worker, "get_db_connection", lambda: conn)
    worker.session = MagicMock()
    worker.session.post.return_value.json.side_effect = ValueError("invalid JSON")
    assert worker.sync_machine_cycles() == 0
    conn.commit.assert_not_called()


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


def test_machine_simulator_sample_is_explicit_and_has_stable_identity():
    sample = build_sample("washer-sim-01", "washer", "boot-01", 7)
    assert sample["device_id"] == "washer-sim-01"
    assert sample["boot_id"] == "boot-01"
    assert sample["data"]["sequence"] == 7
    assert sample["data"]["state"] == "idle"
    assert sample["quality"]["simulation"] is True


def test_corrupt_gateway_credentials_are_never_replaced():
    with tempfile.TemporaryDirectory() as tmpdir:
        cred_file = os.path.join(tmpdir, "gateway.json")
        with open(cred_file, "w", encoding="utf-8") as file:
            file.write("broken")
        with pytest.raises(RuntimeError, match="preserve it for recovery"):
            gateway_config.get_or_create_gateway_credentials(cred_file)
        with open(cred_file, "r", encoding="utf-8") as file:
            assert file.read() == "broken"


def test_local_gateway_state_is_selected_by_credential_identity():
    conn = MagicMock()
    cursor = conn.cursor.return_value.__enter__.return_value
    cursor.fetchone.return_value = {"gateway_id": "gateway-current", "status": "active"}
    assert gateway_config.load_gateway_db_state(conn, "gateway-current")["status"] == "active"
    assert "WHERE gateway_id=%s" in cursor.execute.call_args.args[0]
    assert cursor.execute.call_args.args[1] == ("gateway-current",)
    cursor.execute.reset_mock()
    cursor.fetchone.reset_mock()
    assert gateway_config.load_gateway_db_state(conn)["status"] == "unpaired"
    cursor.execute.assert_not_called()


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


def test_invalid_source_time_is_marked_and_falls_back_to_gateway_time():
    worker = EdgeIngestionWorker()
    assert worker.source_time_quality("not-a-time") == "invalid_source_time"
    assert worker.source_time_quality(None) == "gateway_receipt_only"
    assert worker.source_time_quality("2026-11-01T06:00:00Z") == "device_reported"
    assert worker.source_time_quality("2026-11-01T06:00:00") == "assumed_utc"
    assert worker.parse_to_sql_datetime(float("nan"))


def test_ingestion_rejects_foreign_branch_topic():
    worker = EdgeIngestionWorker()
    worker.branch_id = "branch-1"
    assert worker.parse_topic_device("branches/branch-1/devices/node-1/telemetry") == "node-1"
    assert worker.parse_topic_device("branches/branch-2/devices/node-1/telemetry") is None
    assert worker.parse_topic_device("branches/branch-1/devices/node-1/telemetry/extra") is None


def test_pending_device_sample_is_diagnostic_only(monkeypatch):
    worker = EdgeIngestionWorker()
    worker.gateway_id = "gateway-1"
    worker.branch_id = "branch-1"
    worker.is_active = True
    conn = MagicMock()
    monkeypatch.setattr(worker, "get_db_connection", lambda: conn)
    monkeypatch.setattr(worker, "ensure_device_registered_or_discovered", lambda *_: False)
    message = MagicMock()
    message.topic = "branches/branch-1/devices/node-1/telemetry"
    message.payload = json.dumps({"device_id": "node-1", "boot_id": "boot-1",
                                  "data": {"sequence": 1, "voltage": 1.2}}).encode()
    worker.on_message(None, None, message)
    sql, values = conn.cursor.return_value.__enter__.return_value.execute.call_args.args
    assert "INSERT INTO sensor_telemetry" in sql
    assert values[-2:] == (-1, "pending_device")
    conn.commit.assert_called_once()


def test_legacy_sample_never_creates_a_cloud_discovery(monkeypatch):
    worker = EdgeIngestionWorker()
    worker.gateway_id = "gateway-1"
    worker.branch_id = "branch-1"
    worker.is_active = True
    conn = MagicMock()
    discovery = MagicMock()
    monkeypatch.setattr(worker, "get_db_connection", lambda: conn)
    monkeypatch.setattr(worker, "ensure_device_registered_or_discovered", discovery)
    message = MagicMock()
    message.topic = "nodes/telemetry"
    message.payload = json.dumps({"device_id": "legacy-node", "data": {"voltage": 1.2}}).encode()
    worker.on_message(None, None, message)
    discovery.assert_not_called()
    sql, values = conn.cursor.return_value.__enter__.return_value.execute.call_args.args
    assert "INSERT INTO sensor_telemetry" in sql
    assert values[1] is None
    assert values[-2:] == (-1, "legacy_unattributed")


def test_repeat_discovery_does_not_clear_cloud_acknowledgement():
    worker = EdgeIngestionWorker()
    conn = MagicMock()
    conn.cursor.return_value.__enter__.return_value.fetchone.return_value = None
    assert worker.ensure_device_registered_or_discovered(conn, "node-1", {"voltage": 1.2}) is False
    insert_sql = conn.cursor.return_value.__enter__.return_value.execute.call_args.args[0]
    assert "ON DUPLICATE KEY UPDATE" in insert_sql
    assert "is_synced = 0" not in insert_sql.split("ON DUPLICATE KEY UPDATE", 1)[1]


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


def test_cloud_revocation_stops_local_gateway_sync(monkeypatch):
    worker = EdgeSyncWorker()
    worker.gateway_id = "gateway-1"
    worker.credential = "secret-in-memory"
    worker.status = "active"
    worker.branch_id = "branch-1"
    worker.session.get = MagicMock(return_value=MagicMock(
        status_code=200,
        json=lambda: {"status": "revoked", "organization_id": "org-1", "branch_id": "branch-1"},
    ))
    conn = MagicMock()
    monkeypatch.setattr(worker, "get_db_connection", lambda: conn)
    save = MagicMock()
    monkeypatch.setattr(gateway_config, "save_gateway_db_state", save)
    assert worker.refresh_cloud_gateway_status() is False
    assert worker.status == "revoked"
    save.assert_called_once_with(conn, "gateway-1", "org-1", "branch-1", "revoked", 1)

