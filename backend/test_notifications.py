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
