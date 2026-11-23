"""Focused boundary and RBAC checks for technician machine maintenance logs."""

from contextlib import contextmanager
from datetime import datetime, timezone
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

import maintenance_logs

ORG = UUID("33333333-3333-3333-3333-333333333333")
BRANCH = UUID("44444444-4444-4444-4444-444444444444")
GATEWAY = UUID("66666666-6666-6666-6666-666666666666")
DEVICE = UUID("88888888-8888-8888-8888-888888888888")
INCIDENT = UUID("99999999-9999-9999-9999-999999999999")
TECH_USER = UUID("12121212-1212-1212-1212-121212121212")


def _mock_db(conn):
    @contextmanager
    def db(**_kwargs):
        yield conn

    return db


def test_list_maintenance_logs_filters_and_paginates(monkeypatch):
    conn = MagicMock()
    created_at = datetime(2026, 11, 23, 6, 40, tzinfo=timezone.utc)
    log_id = uuid4()
    conn.execute.return_value.fetchone.return_value = {"total": 3}
    conn.execute.return_value.fetchall.return_value = [
        {
            "id": log_id,
            "reference_code": "MNT-A1B2C3",
            "branch_id": BRANCH,
            "device_id": DEVICE,
            "source_id": "washer-sim-01",
            "asset_name": "Washer 01",
            "incident_id": INCIDENT,
            "error_code": "E01",
            "fault_name": "Water Inlet Failure",
            "technician_name": "Ali Technician",
            "performed_by_user_id": TECH_USER,
            "performed_by_role": "machine_maintenance",
            "work_done": "- Inspected inlet valve\n- Cleaned sediment screen",
            "outcome": "completed",
            "created_at": created_at,
        }
    ]
    seen_roles = []

    def authorize(_conn, _uid, _branch, roles):
        seen_roles.append(roles)
        return {"organization_id": ORG, "role": "machine_maintenance"}, {}

    monkeypatch.setattr(maintenance_logs, "_database", _mock_db(conn))
    monkeypatch.setattr(maintenance_logs, "_authorize_branch_access", authorize)

    result = maintenance_logs.list_branch_maintenance_logs(
        BRANCH,
        source_id="washer-sim-01",
        error_code="E01",
        search="Ali",
        page=1,
        page_size=2,
        user={"id": TECH_USER},
    )

    assert seen_roles == [("owner", "branch_manager", "machine_maintenance")]
    assert result["total"] == 3
    assert result["has_more"] is True
    assert len(result["items"]) == 1
    item = result["items"][0]
    assert item["id"] == str(log_id)
    assert item["reference_code"] == "MNT-A1B2C3"
    assert item["error_code"] == "E01"
    assert item["fault_name"] == "Water Inlet Failure"
    assert item["technician_name"] == "Ali Technician"
    assert item["outcome"] == "completed"
    assert item["created_at"] == "2026-11-23T06:40:00Z"


def test_list_maintenance_logs_denies_unpermitted_role(monkeypatch):
    conn = MagicMock()
    monkeypatch.setattr(maintenance_logs, "_database", _mock_db(conn))

    def deny(_conn, _uid, _branch, _roles):
        raise HTTPException(403, "Not permitted")

    monkeypatch.setattr(maintenance_logs, "_authorize_branch_access", deny)

    with pytest.raises(HTTPException) as err:
        maintenance_logs.list_branch_maintenance_logs(BRANCH, user={"id": TECH_USER})
    assert err.value.status_code == 403
    conn.execute.assert_not_called()


def test_create_maintenance_log_validates_trimmed_inputs(monkeypatch):
    conn = MagicMock()
    monkeypatch.setattr(maintenance_logs, "_database", _mock_db(conn))

    body = maintenance_logs.MaintenanceLogCreateRequest(
        error_code="   ",
        technician_name="Ali",
        work_done="Cleaned valve filter",
    )
    with pytest.raises(HTTPException) as err:
        maintenance_logs.create_machine_maintenance_log(
            BRANCH, "washer-sim-01", body, user={"id": TECH_USER}
        )
    assert err.value.status_code == 422
    conn.execute.assert_not_called()


def test_create_maintenance_log_persists_and_records_incident_event(monkeypatch):
    conn = MagicMock()
    created_at = datetime(2026, 11, 23, 6, 45, tzinfo=timezone.utc)
    log_id = uuid4()
    conn.execute.return_value.fetchone.side_effect = [
        {
            "id": DEVICE,
            "gateway_id": GATEWAY,
            "source_id": "washer-sim-01",
            "source_kind": "simulated",
            "label": "Washer 01",
            "gateway_status": "active",
        },
        {
            "state_payload": {"state": "maintenance", "fault_code": "E01"},
            "cloud_seen_at": datetime.now(timezone.utc),
        },
        {"id": INCIDENT},
        {
            "id": log_id,
            "reference_code": "MNT-112233",
            "branch_id": BRANCH,
            "device_id": DEVICE,
            "source_id": "washer-sim-01",
            "asset_name": "Washer 01",
            "incident_id": INCIDENT,
            "error_code": "E01",
            "fault_name": "Water Inlet Failure",
            "technician_name": "Ali Technician",
            "performed_by_user_id": TECH_USER,
            "performed_by_role": "machine_maintenance",
            "work_done": "Cleared kinked inlet hose and flushed filter.",
            "outcome": "in_progress",
            "created_at": created_at,
        },
    ]

    monkeypatch.setattr(maintenance_logs, "_database", _mock_db(conn))
    monkeypatch.setattr(
        maintenance_logs,
        "_authorize_branch_access",
        lambda *_args: ({"organization_id": ORG, "role": "machine_maintenance"}, {}),
    )
    monkeypatch.setattr(maintenance_logs, "_generate_reference_code", lambda: "MNT-112233")

    events = []
    monkeypatch.setattr(
        maintenance_logs,
        "_insert_incident_event",
        lambda _conn, **kwargs: events.append(kwargs),
    )

    body = maintenance_logs.MaintenanceLogCreateRequest(
        error_code="E01",
        technician_name="Ali Technician",
        work_done="Cleared kinked inlet hose and flushed filter.",
        outcome="in_progress",
        return_to_service=False,
    )
    result = maintenance_logs.create_machine_maintenance_log(
        BRANCH, "washer-sim-01", body, user={"id": TECH_USER}
    )

    assert result["command"] is None
    assert result["item"]["reference_code"] == "MNT-112233"
    assert result["item"]["incident_id"] == str(INCIDENT)
    assert result["item"]["performed_by_role"] == "machine_maintenance"
    assert len(events) == 1
    assert events[0]["event_type"] == "task_updated"
    assert events[0]["incident_id"] == INCIDENT
    assert "MNT-112233" in events[0]["summary"]


def test_create_maintenance_log_with_return_to_service_queues_clear_fault(monkeypatch):
    conn = MagicMock()
    created_at = datetime(2026, 11, 23, 6, 50, tzinfo=timezone.utc)
    log_id = uuid4()
    cmd_id = uuid4()
    conn.execute.return_value.fetchone.side_effect = [
        {
            "id": DEVICE,
            "gateway_id": GATEWAY,
            "source_id": "washer-sim-01",
            "source_kind": "simulated",
            "label": "Washer 01",
            "gateway_status": "active",
        },
        {
            "state_payload": {"state": "maintenance", "fault_code": "E01"},
            "cloud_seen_at": datetime.now(timezone.utc),
        },
        {"service_status": "open"},
        None,
        {"status": "queued", "action": "clear_fault", "device_id": DEVICE},
        None,
        {
            "id": log_id,
            "reference_code": "MNT-CAFE01",
            "branch_id": BRANCH,
            "device_id": DEVICE,
            "source_id": "washer-sim-01",
            "asset_name": "Washer 01",
            "incident_id": None,
            "error_code": "E01",
            "fault_name": "Water Inlet Failure",
            "technician_name": "Owner Admin",
            "performed_by_user_id": TECH_USER,
            "performed_by_role": "owner",
            "work_done": "Replaced solenoid coil and verified flow.",
            "outcome": "completed",
            "created_at": created_at,
        },
    ]

    monkeypatch.setattr(maintenance_logs, "_database", _mock_db(conn))
    monkeypatch.setattr(
        maintenance_logs,
        "_authorize_branch_access",
        lambda *_args: ({"organization_id": ORG, "role": "owner"}, {}),
    )
    monkeypatch.setattr(maintenance_logs, "_generate_reference_code", lambda: "MNT-CAFE01")

    body = maintenance_logs.MaintenanceLogCreateRequest(
        error_code="E01",
        technician_name="Owner Admin",
        work_done="Replaced solenoid coil and verified flow.",
        outcome="completed",
        return_to_service=True,
        command_request_id=cmd_id,
    )
    result = maintenance_logs.create_machine_maintenance_log(
        BRANCH, "washer-sim-01", body, user={"id": TECH_USER}
    )

    assert result["item"]["outcome"] == "completed"
    assert result["command"] == {"command_id": str(cmd_id), "status": "queued"}
    assert any(
        "insert into public.machine_commands" in call.args[0]
        for call in conn.execute.call_args_list
    )


def test_create_maintenance_log_return_to_service_rejects_running_machine(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        {
            "id": DEVICE,
            "gateway_id": GATEWAY,
            "source_id": "washer-sim-01",
            "source_kind": "simulated",
            "label": "Washer 01",
            "gateway_status": "active",
        },
        {
            "state_payload": {"state": "running"},
            "cloud_seen_at": datetime.now(timezone.utc),
        },
        {"service_status": "open"},
        None,
    ]

    monkeypatch.setattr(maintenance_logs, "_database", _mock_db(conn))
    monkeypatch.setattr(
        maintenance_logs,
        "_authorize_branch_access",
        lambda *_args: ({"organization_id": ORG, "role": "machine_maintenance"}, {}),
    )

    body = maintenance_logs.MaintenanceLogCreateRequest(
        error_code="E01",
        technician_name="Ali Technician",
        work_done="Checked valve.",
        outcome="completed",
        return_to_service=True,
    )
    with pytest.raises(HTTPException) as err:
        maintenance_logs.create_machine_maintenance_log(
            BRANCH, "washer-sim-01", body, user={"id": TECH_USER}
        )
    assert err.value.status_code == 409
    assert not any(
        "insert into public.machine_maintenance_logs" in call.args[0]
        for call in conn.execute.call_args_list
    )
