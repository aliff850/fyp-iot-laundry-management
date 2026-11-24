"""Focused tests for protected organization-wide and branch-scoped notifications."""

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import json
from unittest.mock import MagicMock
from uuid import UUID

from fastapi import HTTPException
from fastapi.testclient import TestClient
import pytest

import main
import notifications

USER = UUID("11111111-1111-1111-1111-111111111111")
ORG = UUID("33333333-3333-3333-3333-333333333333")
BRANCH_A = UUID("44444444-4444-4444-4444-444444444444")
BRANCH_B = UUID("55555555-5555-5555-5555-555555555555")
DEV_M1 = UUID("66666666-6666-6666-6666-666666666666")
DEV_L1 = UUID("77777777-7777-7777-7777-777777777777")
CYCLE_1 = UUID("88888888-8888-8888-8888-888888888888")
REC_1 = UUID("99999999-9999-9999-9999-999999999999")


def _member(role="owner", state="active"):
    return {
        "organization_id": ORG,
        "state": state,
        "role": role,
        "active": state == "active",
        "organization_state": "active",
    }


def _mock_db(conn):
    @contextmanager
    def db(**_kwargs):
        yield conn

    return db


def test_owner_receives_multi_branch_machine_and_lpg_events_with_branch_names(monkeypatch):
    now = datetime.now(timezone.utc)
    recent = now - timedelta(seconds=8)
    conn = MagicMock()
    conn.execute.return_value.fetchall.side_effect = [
        [
            {"id": BRANCH_A, "name": "MSU Shah Alam"},
            {"id": BRANCH_B, "name": "Subang Jaya"},
        ],
        [
            {
                "id": DEV_M1,
                "branch_id": BRANCH_A,
                "source_id": "washer-01",
                "device_type": "washer",
                "source_kind": "simulated",
                "label": "Washer 01",
                "status": "active",
                "cloud_seen_at": recent,
                "gateway_seen_at": recent,
                "state_payload": {
                    "state": "ERROR",
                    "fault_code": "E14",
                    "settings": {"program_id": "quick", "price_myr": "12.00"},
                    "programs": {"quick": {"name": "Express", "price_myr": "12.00"}},
                },
            }
        ],
        [
            {
                "cycle_id": CYCLE_1,
                "branch_id": BRANCH_A,
                "source_id": "washer-01",
                "label": "Washer 01",
                "program_id": "standard",
                "running_seconds": 1800,
                "outcome": "completed",
                "started_at": now - timedelta(minutes=35),
                "finished_at": now - timedelta(minutes=5),
            }
        ],
        [],
        [],
        [
            {
                "id": DEV_L1,
                "branch_id": BRANCH_B,
                "source_id": "esp32-lpg-01",
                "source_kind": "physical",
                "label": "LPG Node 01",
                "capacity_kg": 14.0,
                "status": "active",
                "record_id": REC_1,
                "gateway_receipt_at": recent,
                "source_recorded_at": recent,
                "cloud_received_at": recent,
                "payload": {"lpg_percent": 3.5, "estimated_ppm": 950},
                "quality": {
                    "source_time_quality": "device_reported",
                    "weight_valid": True,
                    "ppm_calibrated": True,
                    "gas_condition": "warning",
                },
            }
        ],
        [],
        [],
    ]
    monkeypatch.setattr(notifications, "_database", _mock_db(conn))
    monkeypatch.setattr(notifications, "_membership", lambda _conn, _uid: _member("owner", "active"))

    res = notifications.get_notifications(category="all", branch_id=None, limit=100, user={"id": USER})

    assert res["organization_id"] == str(ORG)
    assert res["role"] == "owner"
    assert len(res["branches"]) == 2
    assert len(res["devices"]) == 2
    assert {d["branch_name"] for d in res["devices"]} == {"MSU Shah Alam", "Subang Jaya"}

    by_kind = {e["kind"]: e for e in res["events"]}
    assert by_kind["machine_fault"]["branch_id"] == str(BRANCH_A)
    assert by_kind["machine_fault"]["branch_name"] == "MSU Shah Alam"
    assert by_kind["machine_completed"]["branch_name"] == "MSU Shah Alam"
    assert by_kind["lpg_critical"]["branch_id"] == str(BRANCH_B)
    assert by_kind["lpg_critical"]["branch_name"] == "Subang Jaya"
    assert by_kind["lpg_gas_warning"]["branch_name"] == "Subang Jaya"
    assert "price_myr" not in json.dumps(res)


def test_machine_specialist_scoped_to_machines_and_blocked_from_lpg(monkeypatch):
    now = datetime.now(timezone.utc)
    recent = now - timedelta(seconds=10)
    conn = MagicMock()
    conn.execute.return_value.fetchall.side_effect = [
        [{"id": BRANCH_A, "name": "MSU Shah Alam"}],
        [
            {
                "id": DEV_M1,
                "branch_id": BRANCH_A,
                "source_id": "washer-01",
                "device_type": "washer",
                "source_kind": "simulated",
                "label": "Washer 01",
                "status": "active",
                "cloud_seen_at": recent,
                "gateway_seen_at": recent,
                "state_payload": {
                    "state": "RUNNING",
                    "settings": {"program_id": "quick", "price_myr": "9.50"},
                    "programs": {"quick": {"price_myr": "9.50"}},
                },
            }
        ],
        [],
        [],
        [],
        [],
    ]
    monkeypatch.setattr(notifications, "_database", _mock_db(conn))
    monkeypatch.setattr(
        notifications, "_membership", lambda _conn, _uid: _member("machine_maintenance", "active")
    )

    res = notifications.get_notifications(category="all", branch_id=None, limit=100, user={"id": USER})
    assert [e["category"] for e in res["events"]] == ["machine"]
    assert res["events"][0]["kind"] == "machine_running"
    assert res["events"][0]["branch_name"] == "MSU Shah Alam"
    assert "price_myr" not in json.dumps(res)

    with pytest.raises(HTTPException) as exc:
        notifications.get_notifications(category="lpg", branch_id=None, limit=100, user={"id": USER})
    assert exc.value.status_code == 403


def test_lpg_specialist_blocked_from_machines_and_unassigned_branch(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchall.return_value = [{"id": BRANCH_A, "name": "MSU Shah Alam"}]
    conn.execute.return_value.fetchone.return_value = {"1": 1}
    monkeypatch.setattr(notifications, "_database", _mock_db(conn))
    monkeypatch.setattr(
        notifications, "_membership", lambda _conn, _uid: _member("lpg_maintenance", "active")
    )

    with pytest.raises(HTTPException) as cat_exc:
        notifications.get_notifications(category="machine", branch_id=None, limit=100, user={"id": USER})
    assert cat_exc.value.status_code == 403

    with pytest.raises(HTTPException) as branch_exc:
        notifications.get_notifications(category="lpg", branch_id=BRANCH_B, limit=100, user={"id": USER})
    assert branch_exc.value.status_code == 403


def test_inactive_member_rejected_and_route_not_retired(monkeypatch):
    conn = MagicMock()
    monkeypatch.setattr(notifications, "_database", _mock_db(conn))
    monkeypatch.setattr(notifications, "_membership", lambda _conn, _uid: _member("owner", "pending"))

    with pytest.raises(HTTPException) as exc:
        notifications.get_notifications(category="all", branch_id=None, limit=100, user={"id": USER})
    assert exc.value.status_code == 403

    main.app.dependency_overrides[notifications._user] = lambda: {"id": USER}
    try:
        client = TestClient(main.app)
        resp = client.get("/notifications")
        assert resp.status_code == 403
    finally:
        main.app.dependency_overrides.clear()


def test_lowercase_esp32_states_and_durable_fault_incidents_logged_without_duplicates(monkeypatch):
    now = datetime.now(timezone.utc)
    recent = now - timedelta(seconds=6)
    opened_earlier = now - timedelta(minutes=8)
    inc_active = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
    inc_cleared = UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")

    conn = MagicMock()
    conn.execute.return_value.fetchall.side_effect = [
        [{"id": BRANCH_A, "name": "MSU Shah Alam"}],
        [
            {
                "id": DEV_M1,
                "branch_id": BRANCH_A,
                "source_id": "washer-sim-01",
                "device_type": "washer",
                "source_kind": "simulated",
                "label": "Demo Washer 01",
                "status": "active",
                "cloud_seen_at": recent,
                "gateway_seen_at": recent,
                "active_incident_id": inc_active,
                "state_payload": {
                    "state": "error",
                    "fault_code": "E01",
                },
            },
            {
                "id": DEV_L1,
                "branch_id": BRANCH_A,
                "source_id": "dryer-sim-01",
                "device_type": "dryer",
                "source_kind": "simulated",
                "label": "Demo Dryer 01",
                "status": "active",
                "cloud_seen_at": recent,
                "gateway_seen_at": recent,
                "active_incident_id": None,
                "state_payload": {
                    "state": "maintenance",
                    "fault_code": "E04",
                },
            },
        ],
        [],
        [],
        [],
        [
            {
                "id": inc_active,
                "branch_id": BRANCH_A,
                "source_id": "washer-sim-01",
                "asset_name": "Demo Washer 01",
                "domain": "machine",
                "condition_key": "machine_fault",
                "severity": "critical",
                "edge_condition_state": "active",
                "workflow_state": "open",
                "fault_code": "E01",
                "summary": "Machine fault active: E01 — Water Inlet Failure",
                "opened_at": recent,
                "last_sample_at": recent,
            },
            {
                "id": inc_cleared,
                "branch_id": BRANCH_A,
                "source_id": "dryer-sim-01",
                "asset_name": "Demo Dryer 01",
                "domain": "machine",
                "condition_key": "machine_fault",
                "severity": "critical",
                "edge_condition_state": "cleared",
                "workflow_state": "open",
                "fault_code": "E04",
                "summary": "Machine fault active: E04 — Heater / Thermal Cutoff",
                "opened_at": opened_earlier,
                "last_sample_at": recent,
            },
        ],
    ]
    monkeypatch.setattr(notifications, "_database", _mock_db(conn))
    monkeypatch.setattr(
        notifications, "_membership", lambda _conn, _uid: _member("machine_maintenance", "active")
    )

    res = notifications.get_notifications(category="all", branch_id=None, limit=100, user={"id": USER})

    washer_dev = next(d for d in res["devices"] if d["source_id"] == "washer-sim-01")
    dryer_dev = next(d for d in res["devices"] if d["source_id"] == "dryer-sim-01")
    assert washer_dev["state"] == "ERROR"
    assert washer_dev["maintenance_mode"] is False
    assert dryer_dev["state"] == "MAINTENANCE"
    assert dryer_dev["maintenance_mode"] is True

    # Covered live fault for inc_active is deduplicated into the durable incident entry;
    # dryer emits both its active maintenance notice and its durable historical fault.
    event_ids = [ev["id"] for ev in res["events"]]
    assert f"incident:{inc_active}" in event_ids
    assert f"live:{BRANCH_A}:machine:washer-sim-01:error" not in event_ids
    assert f"live:{BRANCH_A}:machine:dryer-sim-01:maintenance" in event_ids
    assert f"incident:{inc_cleared}" in event_ids

    fault_events = [ev for ev in res["events"] if ev["kind"] == "machine_fault"]
    assert len(fault_events) == 2
    assert fault_events[0]["incident_id"] == str(inc_active)
    maint_event = next(ev for ev in res["events"] if ev["kind"] == "machine_maintenance")
    assert maint_event["severity"] == "warning"
    assert "E04" in maint_event["detail"]


def test_durable_machine_and_lpg_maintenance_history_shown_after_returning_to_idle(monkeypatch):
    now = datetime.now(timezone.utc)
    recent = now - timedelta(seconds=5)
    maint_started = now - timedelta(minutes=12)
    maint_logged = now - timedelta(minutes=6)
    lpg_started = now - timedelta(minutes=20)
    lpg_completed = now - timedelta(minutes=10)
    cmd_id = UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")
    log_id = UUID("dddddddd-dddd-dddd-dddd-dddddddddddd")
    lpg_sess_id = UUID("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee")

    conn = MagicMock()
    conn.execute.return_value.fetchall.side_effect = [
        [{"id": BRANCH_A, "name": "MSU Shah Alam"}],
        # Machine is now idle, so no live:...:maintenance is emitted
        [
            {
                "id": DEV_M1,
                "branch_id": BRANCH_A,
                "source_id": "washer-sim-01",
                "device_type": "washer",
                "source_kind": "simulated",
                "label": "Demo Washer 01",
                "status": "active",
                "cloud_seen_at": recent,
                "gateway_seen_at": recent,
                "active_incident_id": None,
                "state_payload": {"state": "idle", "fault_code": None},
            }
        ],
        [],
        # Succeeded start_maintenance command
        [
            {
                "id": cmd_id,
                "branch_id": BRANCH_A,
                "source_id": "washer-sim-01",
                "label": "Demo Washer 01",
                "issued_at": maint_started,
                "result_at": maint_started + timedelta(seconds=2),
                "actor_name": "Ali Tech",
                "active_incident_id": None,
            }
        ],
        # Completed maintenance work log
        [
            {
                "id": log_id,
                "reference_code": "MNT-998877",
                "branch_id": BRANCH_A,
                "source_id": "washer-sim-01",
                "asset_name": "Demo Washer 01",
                "incident_id": None,
                "error_code": "E01",
                "technician_name": "Ali Tech",
                "outcome": "completed",
                "created_at": maint_logged,
            }
        ],
        # LPG node active
        [
            {
                "id": DEV_L1,
                "branch_id": BRANCH_A,
                "source_id": "esp32-lpg-01",
                "source_kind": "physical",
                "label": "Main Tank",
                "capacity_kg": 14.0,
                "status": "active",
                "record_id": REC_1,
                "gateway_receipt_at": recent,
                "source_recorded_at": recent,
                "cloud_received_at": recent,
                "payload": {"lpg_percent": 92.0},
                "quality": {"source_time_quality": "device_reported", "weight_valid": True},
                "active_incident_id": None,
            }
        ],
        # Completed LPG maintenance session
        [
            {
                "id": lpg_sess_id,
                "branch_id": BRANCH_A,
                "source_id": "esp32-lpg-01",
                "label": "Main Tank",
                "status": "completed",
                "started_by_label": "Owner Admin",
                "completed_by_label": "Owner Admin",
                "service_note": "Swapped cylinder",
                "started_at": lpg_started,
                "completed_at": lpg_completed,
            }
        ],
        [],
    ]
    monkeypatch.setattr(notifications, "_database", _mock_db(conn))
    monkeypatch.setattr(notifications, "_membership", lambda _conn, _uid: _member("owner", "active"))

    res = notifications.get_notifications(category="all", branch_id=None, limit=100, user={"id": USER})
    by_id = {ev["id"]: ev for ev in res["events"]}

    assert f"maintcmd:{cmd_id}" in by_id
    cmd_ev = by_id[f"maintcmd:{cmd_id}"]
    assert cmd_ev["kind"] == "machine_maintenance"
    assert cmd_ev["severity"] == "warning"
    assert cmd_ev["active"] is False
    assert "Ali Tech" in cmd_ev["detail"]

    assert f"maintlog:{log_id}" in by_id
    log_ev = by_id[f"maintlog:{log_id}"]
    assert log_ev["kind"] == "machine_maintenance_logged"
    assert log_ev["severity"] == "positive"
    assert log_ev["reference_code"] == "MNT-998877"
    assert "Ali Tech" in log_ev["detail"]
    assert "·" not in log_ev["detail"]

    assert f"lpgmaint:{lpg_sess_id}:completed" in by_id
    lpg_ev = by_id[f"lpgmaint:{lpg_sess_id}:completed"]
    assert lpg_ev["kind"] == "lpg_maintenance_completed"
    assert lpg_ev["severity"] == "positive"
    assert "Owner Admin" in lpg_ev["detail"]
