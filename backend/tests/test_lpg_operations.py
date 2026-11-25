"""Focused unit and boundary tests for cloud LPG & Safety node telemetry."""

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock
from uuid import UUID

import pytest
from fastapi import HTTPException

import lpg_operations as lpg

USER = UUID("11111111-1111-1111-1111-111111111111")
ORG = UUID("33333333-3333-3333-3333-333333333333")
BRANCH = UUID("44444444-4444-4444-4444-444444444444")
DEVICE = UUID("88888888-8888-8888-8888-888888888888")
REC = UUID("99999999-9999-9999-9999-999999999999")


def _member(role="owner", state="active"):
    return {
        "organization_id": ORG,
        "state": state,
        "role": role,
        "active": True,
        "organization_state": "active",
    }


def _mock_db(conn):
    @contextmanager
    def db(**_kwargs):
        yield conn

    return db


def test_get_branch_lpg_safety_projects_real_telemetry_and_no_ppm(monkeypatch):
    now = datetime.now(timezone.utc)
    sample_time = now - timedelta(seconds=6)
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        _member("owner", "active"),
        {"id": BRANCH, "name": "MSU Shah Alam", "organization_id": ORG},
    ]
    conn.execute.return_value.fetchall.return_value = [
        {
            "id": DEVICE,
            "source_id": "esp32-lpg-01",
            "source_kind": "physical",
            "label": "Primary Weighing Station",
            "capacity_kg": 14.0,
            "record_id": REC,
            "gateway_receipt_at": sample_time + timedelta(seconds=1),
            "source_recorded_at": sample_time,
            "cloud_received_at": sample_time + timedelta(seconds=2),
            "payload": {
                "lpg_percent": 82.5,
                "gross_weight_kg": 25.55,
                "lpg_weight_kg": 11.55,
                "mq6_raw_adc": 412,
                "voltage": 0.41,
                "temperature": 29.4,
                "humidity": 61.2,
            },
            "quality": {
                "source_time_quality": "device_reported",
                "weight_valid": True,
                "temperature_valid": True,
                "humidity_valid": True,
            },
        }
    ]
    monkeypatch.setattr(lpg, "_database", _mock_db(conn))

    res = lpg.get_branch_lpg_safety(BRANCH, {"id": USER})
    assert res["branch_id"] == str(BRANCH)
    assert res["summary"] == {
        "total_nodes": 1,
        "fresh_nodes": 1,
        "stale_nodes": 0,
        "offline_nodes": 0,
        "uninitialized_nodes": 0,
    }
    dev = res["devices"][0]
    assert dev["source_id"] == "esp32-lpg-01"
    assert dev["type"] == "lpg_edge_node"
    assert dev["source_kind"] == "physical"
    obs = dev["observation"]
    assert obs["freshness"] == "fresh"
    assert obs["sync_state"] == "synced"
    assert obs["values"]["lpg_percent"] == 82.5
    assert obs["values"]["gross_weight_kg"] == 25.55
    assert obs["values"]["lpg_weight_kg"] == 11.55
    assert obs["values"]["mq6_raw_adc"] == 412
    assert obs["values"]["voltage"] == 0.41
    assert obs["values"]["temperature"] == 29.4
    assert obs["values"]["humidity"] == 61.2
    assert "ppm_estimate" not in obs["values"]


def test_get_branch_lpg_safety_role_and_assignment_boundaries(monkeypatch):
    conn_machine = MagicMock()
    conn_machine.execute.return_value.fetchone.return_value = _member("machine_maintenance", "active")
    monkeypatch.setattr(lpg, "_database", _mock_db(conn_machine))
    with pytest.raises(HTTPException) as exc_machine:
        lpg.get_branch_lpg_safety(BRANCH, {"id": USER})
    assert exc_machine.value.status_code == 403
    assert "Machine maintenance specialists cannot access LPG fuel and safety" in exc_machine.value.detail

    conn_unassigned = MagicMock()
    conn_unassigned.execute.return_value.fetchone.side_effect = [
        _member("lpg_maintenance", "active"),
        {"id": BRANCH, "name": "MSU Shah Alam", "organization_id": ORG},
        None,
    ]
    monkeypatch.setattr(lpg, "_database", _mock_db(conn_unassigned))
    with pytest.raises(HTTPException) as exc_unassigned:
        lpg.get_branch_lpg_safety(BRANCH, {"id": USER})
    assert exc_unassigned.value.status_code == 403

    conn_assigned = MagicMock()
    conn_assigned.execute.return_value.fetchone.side_effect = [
        _member("lpg_maintenance", "active"),
        {"id": BRANCH, "name": "MSU Shah Alam", "organization_id": ORG},
        {"?column?": 1},
    ]
    conn_assigned.execute.return_value.fetchall.return_value = []
    monkeypatch.setattr(lpg, "_database", _mock_db(conn_assigned))
    res = lpg.get_branch_lpg_safety(BRANCH, {"id": USER})
    assert res["devices"] == []
    assert res["summary"]["total_nodes"] == 0


def test_project_safety_observation_quality_bounds_and_freshness():
    now = datetime(2026, 11, 15, 6, 0, 0, tzinfo=timezone.utc)

    stale_obs = lpg._project_safety_observation(
        {
            "id": DEVICE,
            "source_id": "esp32-lpg-01",
            "source_kind": "physical",
            "record_id": REC,
            "gateway_receipt_at": now - timedelta(seconds=45),
            "source_recorded_at": None,
            "cloud_received_at": now - timedelta(seconds=40),
            "payload": {
                "lpg_percent": 120.0,  # out of range -> null
                "gross_weight_kg": 18.0,
                "lpg_weight_kg": 3.0,
                "temperature": 99.0,
                "humidity": -5.0,  # out of range -> null
                "mq6_raw_adc": True,  # bool rejected -> null
                "voltage": 0.55,
            },
            "quality": {
                "source_time_quality": "gateway_receipt_only",
                "weight_valid": False,
                "temperature_valid": False,
                "humidity_valid": True,
            },
        },
        now,
    )
    assert stale_obs["freshness"] == "stale"
    assert stale_obs["values"]["lpg_percent"] is None
    assert stale_obs["values"]["gross_weight_kg"] is None
    assert stale_obs["values"]["lpg_weight_kg"] is None
    assert stale_obs["values"]["temperature"] is None
    assert stale_obs["values"]["humidity"] is None
    assert stale_obs["values"]["mq6_raw_adc"] is None
    assert stale_obs["values"]["voltage"] == 0.55

    offline_obs = lpg._project_safety_observation(
        {
            "source_id": "esp32-lpg-01",
            "source_kind": "physical",
            "record_id": REC,
            "gateway_receipt_at": now - timedelta(seconds=120),
            "source_recorded_at": None,
            "cloud_received_at": now - timedelta(seconds=110),
            "payload": {"lpg_percent": 50.0},
            "quality": {},
        },
        now,
    )
    assert offline_obs["freshness"] == "offline"


def test_summarize_branch_lpg_overview_honest_states():
    assert lpg.summarize_branch_lpg_overview([]) == {
        "total_cylinders": 0,
        "active_cylinders": 0,
        "manifold_status": "UNINITIALIZED",
        "fuel_level_percent": None,
        "status": "No approved LPG nodes",
    }

    stale_only = [{"observation": {"freshness": "offline", "values": {"lpg_percent": 80.0}}}]
    assert lpg.summarize_branch_lpg_overview(stale_only) == {
        "total_cylinders": 1,
        "active_cylinders": 0,
        "manifold_status": "UNKNOWN",
        "fuel_level_percent": None,
        "status": "Awaiting fresh gateway telemetry",
    }

    critical_fresh = [{"observation": {"freshness": "fresh", "values": {"lpg_percent": 3.5}}}]
    assert lpg.summarize_branch_lpg_overview(critical_fresh)["manifold_status"] == "CRITICAL"


def test_get_branch_lpg_safety_projects_gas_interpretation_and_maintenance(monkeypatch):
    now = datetime.now(timezone.utc)
    sample_time = now - timedelta(seconds=5)
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        _member("owner", "active"),
        {"id": BRANCH, "name": "MSU Shah Alam", "organization_id": ORG},
    ]
    conn.execute.return_value.fetchall.return_value = [
        {
            "id": DEVICE,
            "source_id": "esp32-lpg-01",
            "source_kind": "physical",
            "label": "Main Tank Scale",
            "capacity_kg": 14.0,
            "status": "active",
            "record_id": REC,
            "gateway_receipt_at": sample_time + timedelta(seconds=1),
            "source_recorded_at": sample_time,
            "cloud_received_at": sample_time + timedelta(seconds=2),
            "payload": {
                "lpg_percent": 64.0,
                "gross_weight_kg": 22.96,
                "lpg_weight_kg": 8.96,
                "estimated_ppm": 540.0,
                "temperature": 29.8,
                "humidity": 62.0,
            },
            "quality": {
                "source_time_quality": "device_reported",
                "ppm_calibrated": True,
                "gas_condition": "warning",
                "maintenance_mode": True,
            },
        }
    ]
    monkeypatch.setattr(lpg, "_database", _mock_db(conn))

    res = lpg.get_branch_lpg_safety(BRANCH, {"id": USER})
    dev = res["devices"][0]
    assert dev["maintenance_mode"] is True
    assert dev["gas_interpretation"] == {
        "ppm_calibrated": True,
        "gas_condition": "warning",
        "estimated_ppm": 540.0,
    }
    assert dev["observation"]["values"]["estimated_ppm"] == 540.0

from pydantic import ValidationError


GW = UUID("55555555-5555-5555-5555-555555555555")
REQ_1 = UUID("66666666-6666-6666-6666-666666666666")
SESS_1 = UUID("77777777-7777-7777-7777-777777777777")


def test_lpg_maintenance_status_and_stability_evaluation(monkeypatch):
    now = datetime.now(timezone.utc)
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        _member("lpg_maintenance", "active"),
        {"id": BRANCH, "name": "MSU Shah Alam", "organization_id": ORG},
        {"?column?": 1},
        {
            "id": DEVICE,
            "gateway_id": GW,
            "source_id": "lpg-01",
            "label": "Tank 01",
            "capacity_kg": 14.0,
            "status": "active",
            "gateway_status": "active",
        },
        {"cylinder_tare_kg": 16.5, "cfg_rated_capacity_kg": 14.0, "stability_tolerance_kg": 0.25},
        {"id": SESS_1, "started_by_label": "Aziz", "service_note": "Swap", "started_at": now - timedelta(seconds=20)},
    ]
    conn.execute.return_value.fetchall.return_value = [
        {"gateway_receipt_at": now - timedelta(seconds=2), "source_recorded_at": now - timedelta(seconds=3), "payload": {"gross_weight_kg": 30.52}, "quality": {"source_time_quality": "device_reported", "weight_valid": True}},
        {"gateway_receipt_at": now - timedelta(seconds=6), "source_recorded_at": now - timedelta(seconds=7), "payload": {"gross_weight_kg": 30.49}, "quality": {"source_time_quality": "device_reported", "weight_valid": True}},
        {"gateway_receipt_at": now - timedelta(seconds=10), "source_recorded_at": now - timedelta(seconds=11), "payload": {"gross_weight_kg": 30.55}, "quality": {"source_time_quality": "device_reported", "weight_valid": True}},
    ]
    monkeypatch.setattr(lpg, "_database", _mock_db(conn))

    res = lpg.get_lpg_maintenance_status(BRANCH, "lpg-01", {"id": USER})
    assert res["maintenance_mode"] is True
    assert res["session"]["started_by"] == "Aziz"
    assert res["stability"]["stable"] is True
    assert res["stability"]["sample_count"] == 3
    assert res["stability"]["spread_kg"] == 0.06
    assert res["lpg_config"]["cylinder_tare_kg"] == 16.5


def test_lpg_tank_swap_start_idempotency_and_conflicts(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        _member("branch_manager", "active"),
        {"id": BRANCH, "name": "MSU Shah Alam", "organization_id": ORG},
        {"?column?": 1},
        {"id": DEVICE, "gateway_id": GW, "source_id": "lpg-01", "label": "Tank 01", "capacity_kg": 14.0, "status": "active", "gateway_status": "active"},
        {"full_name": "Nora Ali"},
        None,  # no existing command
        None,  # no active session
        None,  # no existing idempotent cmd inside _enqueue
        None,  # no pending command
    ]
    monkeypatch.setattr(lpg, "_database", _mock_db(conn))
    body = lpg.LpgStartSwapRequest(request_id=REQ_1, service_note="Empty cylinder swap")
    queued = lpg.start_lpg_tank_swap(BRANCH, "lpg-01", body, {"id": USER})
    assert queued["command_id"] == str(REQ_1)
    assert queued["status"] == "queued"

    # Repeat same request_id returns existing state idempotently
    conn_retry = MagicMock()
    conn_retry.execute.return_value.fetchone.side_effect = [
        _member("branch_manager", "active"),
        {"id": BRANCH, "name": "MSU Shah Alam", "organization_id": ORG},
        {"?column?": 1},
        {"id": DEVICE, "gateway_id": GW, "source_id": "lpg-01", "label": "Tank 01", "capacity_kg": 14.0, "status": "active", "gateway_status": "active"},
        {"full_name": "Nora Ali"},
        {"id": REQ_1},
        {"action": "start_tank_swap", "arguments": {"started_by": "Nora Ali", "service_note": "Empty cylinder swap"}, "status": "succeeded", "actor_user_id": USER, "device_id": DEVICE, "reason": None, "result_payload": {}},
    ]
    monkeypatch.setattr(lpg, "_database", _mock_db(conn_retry))
    retried = lpg.start_lpg_tank_swap(BRANCH, "lpg-01", body, {"id": USER})
    assert retried["status"] == "succeeded"

    # Active session already present blocks new start
    conn_conflict = MagicMock()
    conn_conflict.execute.return_value.fetchone.side_effect = [
        _member("owner", "active"),
        {"id": BRANCH, "name": "MSU Shah Alam", "organization_id": ORG},
        {"id": DEVICE, "gateway_id": GW, "source_id": "lpg-01", "label": "Tank 01", "capacity_kg": 14.0, "status": "active", "gateway_status": "active"},
        {"full_name": "Owner"},
        None,
        {"id": SESS_1},
    ]
    monkeypatch.setattr(lpg, "_database", _mock_db(conn_conflict))
    with pytest.raises(HTTPException) as exc:
        lpg.start_lpg_tank_swap(BRANCH, "lpg-01", body, {"id": USER})
    assert exc.value.status_code == 409


def test_lpg_complete_and_gas_baseline_validation_and_gateway_commit(monkeypatch):
    with pytest.raises(ValidationError):
        lpg.LpgCompleteSwapRequest(request_id=REQ_1, tare_kg=0.1)
    with pytest.raises(ValidationError):
        lpg.LpgGasBaselineRequest(request_id=REQ_1, gas_warn_ppm=100.0, gas_crit_ppm=80.0)

    # Machine maintenance forbidden on gas baseline
    conn_forbidden = MagicMock()
    conn_forbidden.execute.return_value.fetchone.return_value = _member("machine_maintenance", "active")
    monkeypatch.setattr(lpg, "_database", _mock_db(conn_forbidden))
    with pytest.raises(HTTPException) as exc_role:
        lpg.calibrate_lpg_gas_baseline(BRANCH, "lpg-01", lpg.LpgGasBaselineRequest(request_id=REQ_1), {"id": USER})
    assert exc_role.value.status_code == 403

    # Gateway commits complete_tank_swap result into cloud tables
    conn_gw = MagicMock()
    conn_gw.execute.return_value.fetchone.return_value = {
        "id": REQ_1,
        "device_id": DEVICE,
        "gateway_id": GW,
        "branch_id": BRANCH,
        "organization_id": ORG,
        "action": "complete_tank_swap",
        "arguments": {"completed_by": "Aziz", "tare_kg": 16.8, "rated_capacity_kg": 50.0},
        "status": "dispatched",
        "actor_user_id": USER,
        "actor_label": "Aziz",
        "source_id": "lpg-01",
        "label": "Tank 01",
    }
    monkeypatch.setattr(lpg, "_database", _mock_db(conn_gw))
    ack = lpg.report_edge_lpg_command_result(
        lpg.EdgeLpgCommandResult(
            command_id=REQ_1,
            status="succeeded",
            result_payload={
                "tare_kg": 16.8,
                "rated_capacity_kg": 50.0,
                "verified_samples": [{"gross_weight_kg": 66.8, "sample_at": "2026-11-16T01:00:00Z"}],
            },
        ),
        gateway={"id": GW, "status": "active", "organization_id": ORG, "branch_id": BRANCH},
    )
    assert ack == {"accepted": True}
    sql_log = "\n".join(call.args[0] for call in conn_gw.execute.call_args_list)
    assert "update public.lpg_maintenance_sessions" in sql_log
    assert "insert into public.lpg_node_config" in sql_log
    assert "update public.devices set capacity_kg=%s" in sql_log


def test_sync_edge_lpg_state_reconciles_gateway_sessions(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchall.return_value = [{"id": DEVICE, "source_id": "lpg-01"}]
    monkeypatch.setattr(lpg, "_database", _mock_db(conn))

    res = lpg.sync_edge_lpg_state(
        lpg.EdgeLpgStateSyncRequest(
            configs=[
                lpg.EdgeLpgNodeConfigSync(
                    source_id="lpg-01",
                    cylinder_tare_kg=16.5,
                    rated_capacity_kg=50.0,
                    mq6_ro_kohm=9.42,
                    mq6_baseline_v=0.45,
                )
            ],
            sessions=[
                lpg.EdgeLpgSessionSync(
                    session_id=SESS_1,
                    source_id="lpg-01",
                    status="active",
                    started_by="Local staff",
                    service_note="On-site swap",
                    started_at=datetime.now(timezone.utc),
                )
            ],
            active_source_ids=["lpg-01"],
        ),
        gateway={"id": GW, "status": "active", "organization_id": ORG, "branch_id": BRANCH},
    )
    assert res == {"accepted": True}
    sql_log = "\n".join(call.args[0] for call in conn.execute.call_args_list)
    assert "insert into public.lpg_node_config" in sql_log
    assert "insert into public.lpg_maintenance_sessions" in sql_log


def test_lpg_operating_mode_projects_online_low_and_maintenance(monkeypatch):
    now = datetime.now(timezone.utc)
    sample_time = now - timedelta(seconds=5)
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        _member("owner", "active"),
        {"id": BRANCH, "name": "MSU Shah Alam", "organization_id": ORG},
    ]
    conn.execute.return_value.fetchall.return_value = [
        {
            "id": DEVICE,
            "source_id": "esp32-lpg-low",
            "source_kind": "physical",
            "label": "Low Fuel Cylinder",
            "capacity_kg": 14.0,
            "status": "active",
            "record_id": REC,
            "gateway_receipt_at": sample_time + timedelta(seconds=1),
            "source_recorded_at": sample_time,
            "cloud_received_at": sample_time + timedelta(seconds=2),
            "payload": {
                "lpg_percent": 11.2,
                "gross_weight_kg": 16.77,
                "lpg_weight_kg": 1.57,
                "estimated_ppm": 12.0,
            },
            "quality": {
                "source_time_quality": "device_reported",
                "ppm_calibrated": True,
                "gas_condition": "normal",
                "maintenance_mode": False,
            },
        }
    ]
    monkeypatch.setattr(lpg, "_database", _mock_db(conn))

    res = lpg.get_branch_lpg_safety(BRANCH, {"id": USER})
    dev = res["devices"][0]
    assert dev["operating_mode"] == "low"
    assert dev["low_fuel_reminder"] is True
    assert dev["maintenance_mode"] is False


def test_lpg_maintenance_status_uses_lpg_latest_recent_samples_when_history_suppressed(monkeypatch):
    now = datetime.now(timezone.utc)
    conn = MagicMock()
    recent = [
        {"sample_at": (now - timedelta(seconds=3)).isoformat(), "gross_weight_kg": 30.50, "weight_valid": True},
        {"sample_at": (now - timedelta(seconds=8)).isoformat(), "gross_weight_kg": 30.48, "weight_valid": True},
        {"sample_at": (now - timedelta(seconds=13)).isoformat(), "gross_weight_kg": 30.52, "weight_valid": True},
    ]
    conn.execute.return_value.fetchone.side_effect = [
        _member("lpg_maintenance", "active"),
        {"id": BRANCH, "name": "MSU Shah Alam", "organization_id": ORG},
        {"?column?": 1},
        {
            "id": DEVICE,
            "gateway_id": GW,
            "source_id": "lpg-01",
            "label": "Tank 01",
            "capacity_kg": 14.0,
            "status": "active",
            "gateway_status": "active",
            "latest_gateway_receipt_at": now - timedelta(seconds=3),
            "latest_source_recorded_at": None,
            "latest_cloud_received_at": now - timedelta(seconds=2),
            "latest_payload": {"gross_weight_kg": 30.50},
            "latest_quality": {"maintenance_mode": True, "recent_samples": recent},
        },
        {"cylinder_tare_kg": 16.5, "cfg_rated_capacity_kg": 14.0, "stability_tolerance_kg": 0.25},
        {"id": SESS_1, "started_by_label": "Aziz", "service_note": "Swap", "started_at": now - timedelta(seconds=20)},
    ]
    # Simulate deadband-suppressed telemetry_observations returning older single row only
    conn.execute.return_value.fetchall.return_value = [
        {"gateway_receipt_at": now - timedelta(minutes=14), "source_recorded_at": None, "payload": {"gross_weight_kg": 17.0}, "quality": {}},
    ]
    monkeypatch.setattr(lpg, "_database", _mock_db(conn))

    res = lpg.get_lpg_maintenance_status(BRANCH, "lpg-01", {"id": USER})
    assert res["maintenance_mode"] is True
    assert res["stability"]["stable"] is True
    assert res["stability"]["sample_count"] == 3
    assert res["stability"]["spread_kg"] == 0.04
