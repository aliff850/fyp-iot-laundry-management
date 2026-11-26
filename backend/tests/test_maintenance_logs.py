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

    assert seen_roles == [("owner", "branch_manager", "machine_maintenance", "lpg_maintenance")]
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


def test_create_maintenance_log_rejects_in_progress_and_requires_return_to_service():
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        maintenance_logs.MaintenanceLogCreateRequest(
            error_code="E01",
            technician_name="Ali Technician",
            work_done="Partial work.",
            outcome="in_progress",  # type: ignore[arg-type]
        )
    with pytest.raises(ValidationError):
        maintenance_logs.MaintenanceLogCreateRequest(
            error_code="E01",
            technician_name="Ali Technician",
            work_done="Stay in maintenance.",
            return_to_service=False,  # type: ignore[arg-type]
        )


def test_create_maintenance_log_persists_and_records_incident_event(monkeypatch):
    conn = MagicMock()
    created_at = datetime(2026, 11, 23, 6, 45, tzinfo=timezone.utc)
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
            "outcome": "completed",
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
        incident_id=INCIDENT,
        command_request_id=cmd_id,
    )
    result = maintenance_logs.create_machine_maintenance_log(
        BRANCH, "washer-sim-01", body, user={"id": TECH_USER}
    )

    assert result["command"] == {"command_id": str(cmd_id), "status": "queued"}
    assert result["item"]["reference_code"] == "MNT-112233"
    assert result["item"]["outcome"] == "completed"
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
        None,  # no active machine_fault incident during preventive maintenance
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
    assert result["item"]["incident_id"] is None
    assert result["command"] == {"command_id": str(cmd_id), "status": "queued"}
    assert any(
        "insert into public.machine_commands" in call.args[0]
        for call in conn.execute.call_args_list
    )
    assert any(
        "edge_condition_state = 'active'" in call.args[0].lower()
        for call in conn.execute.call_args_list
    )


def test_machine_breakdown_log_links_active_fault_and_auto_resolves_on_clear_fault_ack(monkeypatch):
    import incidents
    import machine_operations

    conn = MagicMock()
    created_at = datetime(2026, 11, 26, 6, 0, tzinfo=timezone.utc)
    log_id = uuid4()
    cmd_id = uuid4()
    conn.execute.return_value.fetchone.side_effect = [
        {
            "id": DEVICE,
            "gateway_id": GATEWAY,
            "source_id": "washer-sim-01",
            "source_kind": "simulated",
            "device_type": "washer",
            "label": "Washer 01",
            "device_status": "active",
            "gateway_status": "active",
        },
        {
            "state_payload": {"state": "maintenance", "fault_code": "E01"},
            "cloud_seen_at": datetime.now(timezone.utc),
        },
        {"service_status": "open"},
        None,  # no pending machine_commands
        {"status": "queued", "action": "clear_fault", "device_id": DEVICE},
        {"id": INCIDENT, "workflow_state": "open", "edge_condition_state": "active"},
        {
            "id": log_id,
            "reference_code": "MNT-AUTO01",
            "branch_id": BRANCH,
            "device_id": DEVICE,
            "source_id": "washer-sim-01",
            "asset_name": "Washer 01",
            "domain": "machine",
            "log_kind": "incident_resolution",
            "lpg_session_id": None,
            "incident_id": INCIDENT,
            "error_code": "E01",
            "fault_name": "Water Inlet Failure",
            "technician_name": "Ali Technician",
            "performed_by_user_id": TECH_USER,
            "performed_by_role": "machine_maintenance",
            "work_done": "Replaced water inlet solenoid and tested fill.",
            "outcome": "completed",
            "created_at": created_at,
        },
    ]

    monkeypatch.setattr(maintenance_logs, "_database", _mock_db(conn))
    monkeypatch.setattr(
        maintenance_logs,
        "_authorize_branch_access",
        lambda *_args: ({"organization_id": ORG, "role": "machine_maintenance"}, {}),
    )
    monkeypatch.setattr(maintenance_logs, "_generate_reference_code", lambda: "MNT-AUTO01")
    monkeypatch.setattr(maintenance_logs, "_insert_incident_event", lambda *_a, **_k: None)

    body = maintenance_logs.MaintenanceLogCreateRequest(
        error_code="E01",
        technician_name="Ali Technician",
        work_done="Replaced water inlet solenoid and tested fill.",
        command_request_id=cmd_id,
    )
    res = maintenance_logs.create_device_maintenance_log(
        BRANCH, "washer-sim-01", body, user={"id": TECH_USER}
    )
    assert res["item"]["incident_id"] == str(INCIDENT)
    assert res["item"]["log_kind"] == "incident_resolution"

    # Now simulate gateway confirming clear_fault succeeded -> auto-resolves INCIDENT
    ack_conn = MagicMock()
    ack_conn.execute.return_value.fetchone.side_effect = [
        {"status": "dispatched", "action": "clear_fault", "device_id": DEVICE},
        {
            "incident_id": INCIDENT,
            "organization_id": ORG,
            "branch_id": BRANCH,
            "log_id": log_id,
            "log_ref": "MNT-AUTO01",
            "performed_by_user_id": TECH_USER,
            "performed_by_role": "machine_maintenance",
            "technician_name": "Ali Technician",
            "work_done": "Replaced water inlet solenoid and tested fill.",
        },
    ]
    recorded_events = []
    monkeypatch.setattr(machine_operations, "_database", _mock_db(ack_conn))
    monkeypatch.setattr(incidents, "_insert_incident_event", lambda _c, **kw: recorded_events.append(kw))

    ack_res = machine_operations.report_machine_result(
        machine_operations.EdgeCommandResult(command_id=cmd_id, status="succeeded"),
        gateway={"id": GATEWAY, "status": "active"},
    )
    assert ack_res == {"accepted": True}
    executed_sql = "\n".join(c.args[0].lower() for c in ack_conn.execute.call_args_list)
    assert "set edge_condition_state = 'cleared'" in executed_sql
    assert "workflow_state = 'resolved'" in executed_sql
    assert len(recorded_events) == 1
    assert recorded_events[0]["event_type"] == "resolved"
    assert recorded_events[0]["actor_user_id"] == TECH_USER
    assert recorded_events[0]["actor_role"] == "machine_maintenance"


def test_reconcile_cleared_machine_incident_resolves_when_gateway_acked_via_remote_api(monkeypatch):
    import incidents
    import machine_operations

    cmd_id = uuid4()
    log_id = uuid4()
    now = datetime.now(timezone.utc)

    cmd_conn = MagicMock()
    cmd_conn.execute.return_value.fetchone.return_value = {"id": DEVICE}
    cmd_conn.execute.return_value.fetchall.return_value = [
        {
            "id": cmd_id,
            "action": "clear_fault",
            "status": "succeeded",
            "reason": None,
            "issued_at": now,
            "result_at": now,
        }
    ]

    inc_conn = MagicMock()
    inc_conn.execute.return_value.fetchone.side_effect = [
        {"incident_id": INCIDENT, "device_id": DEVICE},
        {
            "incident_id": INCIDENT,
            "organization_id": ORG,
            "branch_id": BRANCH,
            "log_id": log_id,
            "log_ref": "MNT-REMOTE01",
            "performed_by_user_id": TECH_USER,
            "performed_by_role": "machine_maintenance",
            "technician_name": "Ali Technician",
            "work_done": "Cleared blocked drain pump and verified spin.",
        },
    ]
    recorded_events = []
    monkeypatch.setattr(machine_operations, "_database", _mock_db(cmd_conn))
    monkeypatch.setattr(
        machine_operations,
        "_authorize_branch_access",
        lambda *_args: ({"organization_id": ORG, "role": "machine_maintenance"}, {}),
    )
    monkeypatch.setattr(incidents, "_database", _mock_db(inc_conn))
    monkeypatch.setattr(incidents, "_insert_incident_event", lambda _c, **kw: recorded_events.append(kw))

    res = machine_operations.list_machine_commands(
        BRANCH, "washer-sim-01", user={"id": TECH_USER}
    )
    assert res["commands"][0]["status"] == "succeeded"
    assert len(recorded_events) == 1
    assert recorded_events[0]["event_type"] == "resolved"
    assert recorded_events[0]["actor_user_id"] == TECH_USER


@pytest.mark.parametrize("state_value", ["idle", "running", "error"])
def test_create_maintenance_log_rejects_non_maintenance_states(
    monkeypatch, state_value
):
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
            "state_payload": {"state": state_value},
            "cloud_seen_at": datetime.now(timezone.utc),
        },
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


def test_unified_device_maintenance_log_for_lpg_enqueues_complete_maintenance_and_resolves_cleared_incident(
    monkeypatch,
):
    conn = MagicMock()
    cmd_id = uuid4()
    session_id = uuid4()
    now = datetime.now(timezone.utc)
    conn.execute.return_value.fetchone.side_effect = [
        {
            "id": DEVICE,
            "gateway_id": GATEWAY,
            "source_id": "esp32-lpg-01",
            "source_kind": "physical",
            "device_type": "lpg_edge_node",
            "label": "Main Tank Scale",
            "device_status": "active",
            "gateway_status": "active",
        },
        {"id": session_id},  # active lpg_maintenance_sessions
        {"quality": {"maintenance_mode": True}, "cloud_received_at": now},
        None,  # no pending lpg_commands
        {"status": "queued", "action": "complete_maintenance", "device_id": DEVICE},
        {"id": INCIDENT, "workflow_state": "open", "edge_condition_state": "cleared"},
        {
            "id": uuid4(),
            "reference_code": "MNT-LPG001",
            "branch_id": BRANCH,
            "device_id": DEVICE,
            "source_id": "esp32-lpg-01",
            "asset_name": "Main Tank Scale",
            "domain": "lpg",
            "log_kind": "incident_resolution",
            "lpg_session_id": session_id,
            "incident_id": INCIDENT,
            "error_code": "GAS_WARNING",
            "fault_name": "Gas Concentration Elevated",
            "technician_name": "Chong LPG",
            "performed_by_user_id": TECH_USER,
            "performed_by_role": "lpg_maintenance",
            "work_done": "Tightened manifold fitting and leak-tested with soap solution.",
            "outcome": "completed",
            "created_at": now,
        },
        None,  # idempotency check for task_updated incident event
        None,  # idempotency check for resolved incident event
    ]

    monkeypatch.setattr(maintenance_logs, "_database", _mock_db(conn))
    monkeypatch.setattr(
        maintenance_logs,
        "_authorize_branch_access",
        lambda *_args: ({"organization_id": ORG, "role": "lpg_maintenance"}, {}),
    )
    monkeypatch.setattr(maintenance_logs, "_generate_reference_code", lambda: "MNT-LPG001")

    body = maintenance_logs.MaintenanceLogCreateRequest(
        error_code="GAS_WARNING",
        technician_name="Chong LPG",
        work_done="Tightened manifold fitting and leak-tested with soap solution.",
        log_kind="incident_resolution",
        incident_id=INCIDENT,
        outcome="completed",
        return_to_service=True,
        resolve_incident=True,
        command_request_id=cmd_id,
    )
    res = maintenance_logs.create_device_maintenance_log(
        BRANCH, "esp32-lpg-01", body, user={"id": TECH_USER}
    )

    assert res["item"]["domain"] == "lpg"
    assert res["item"]["log_kind"] == "incident_resolution"
    assert res["command"] == {"command_id": str(cmd_id), "status": "queued"}
    assert res["incident_resolution"] == {"resolved": True, "incident_id": str(INCIDENT)}
    sql_log = "\n".join(call.args[0].lower() for call in conn.execute.call_args_list)
    assert "insert into public.lpg_commands" in sql_log
    assert "update public.incidents" in sql_log


def test_unified_lpg_tank_swap_maintenance_log_verifies_stability_and_skips_auto_log(monkeypatch):
    from datetime import timedelta

    now = datetime.now(timezone.utc)
    recent_unstable = [
        {"sample_at": (now - timedelta(seconds=2)).isoformat(), "gross_weight_kg": 29.0, "weight_valid": True},
        {"sample_at": (now - timedelta(seconds=7)).isoformat(), "gross_weight_kg": 30.8, "weight_valid": True},
        {"sample_at": (now - timedelta(seconds=12)).isoformat(), "gross_weight_kg": 29.5, "weight_valid": True},
    ]
    conn_unstable = MagicMock()
    conn_unstable.execute.return_value.fetchone.side_effect = [
        {
            "id": DEVICE,
            "gateway_id": GATEWAY,
            "source_id": "esp32-lpg-01",
            "source_kind": "physical",
            "device_type": "lpg_edge_node",
            "label": "Main Tank Scale",
            "device_status": "active",
            "gateway_status": "active",
        },
        {"id": uuid4(), "session_kind": "tank_swap"},
        {"payload": {"gross_weight_kg": 29.0}, "quality": {"maintenance_mode": True, "recent_samples": recent_unstable}, "cloud_received_at": now},
        None,  # no pending lpg_commands
        {"cylinder_tare_kg": 15.2, "rated_capacity_kg": 14.0, "stability_tolerance_kg": 0.25},
    ]
    monkeypatch.setattr(maintenance_logs, "_database", _mock_db(conn_unstable))
    monkeypatch.setattr(
        maintenance_logs,
        "_authorize_branch_access",
        lambda *_args: ({"organization_id": ORG, "role": "lpg_maintenance"}, {}),
    )
    body = maintenance_logs.MaintenanceLogCreateRequest(
        error_code="TANK_SWAP",
        technician_name="Aiman LPG",
        work_done="Replaced empty 14kg cylinder and checked regulator.",
        log_kind="tank_swap",
    )
    with pytest.raises(HTTPException) as exc:
        maintenance_logs.create_device_maintenance_log(BRANCH, "esp32-lpg-01", body, user={"id": TECH_USER})
    assert exc.value.status_code == 409
    assert "fluctuating" in str(exc.value.detail).lower()

    # Stable readings succeed, enqueue complete_maintenance, and never auto-link incidents
    recent_stable = [
        {"sample_at": (now - timedelta(seconds=2)).isoformat(), "gross_weight_kg": 29.20, "weight_valid": True},
        {"sample_at": (now - timedelta(seconds=7)).isoformat(), "gross_weight_kg": 29.22, "weight_valid": True},
        {"sample_at": (now - timedelta(seconds=12)).isoformat(), "gross_weight_kg": 29.19, "weight_valid": True},
    ]
    conn_ok = MagicMock()
    cmd_id = uuid4()
    session_id = uuid4()
    conn_ok.execute.return_value.fetchone.side_effect = [
        {
            "id": DEVICE,
            "gateway_id": GATEWAY,
            "source_id": "esp32-lpg-01",
            "source_kind": "physical",
            "device_type": "lpg_edge_node",
            "label": "Main Tank Scale",
            "device_status": "active",
            "gateway_status": "active",
        },
        {"id": session_id, "session_kind": "tank_swap"},
        {"payload": {"gross_weight_kg": 29.20}, "quality": {"maintenance_mode": True, "recent_samples": recent_stable}, "cloud_received_at": now},
        None,
        {"cylinder_tare_kg": 15.2, "rated_capacity_kg": 14.0, "stability_tolerance_kg": 0.25},
        {"status": "queued", "action": "complete_maintenance", "device_id": DEVICE},
        {
            "id": uuid4(),
            "reference_code": "MNT-SWAP01",
            "branch_id": BRANCH,
            "device_id": DEVICE,
            "source_id": "esp32-lpg-01",
            "asset_name": "Main Tank Scale",
            "domain": "lpg",
            "log_kind": "tank_swap",
            "lpg_session_id": session_id,
            "incident_id": None,
            "error_code": "TANK_SWAP",
            "fault_name": "LPG Cylinder Swap",
            "technician_name": "Aiman LPG",
            "performed_by_user_id": TECH_USER,
            "performed_by_role": "lpg_maintenance",
            "work_done": "Replaced empty 14kg cylinder and checked regulator.",
            "outcome": "completed",
            "created_at": now,
        },
    ]
    monkeypatch.setattr(maintenance_logs, "_database", _mock_db(conn_ok))
    monkeypatch.setattr(maintenance_logs, "_generate_reference_code", lambda: "MNT-SWAP01")
    res_ok = maintenance_logs.create_device_maintenance_log(
        BRANCH,
        "esp32-lpg-01",
        body.model_copy(update={"command_request_id": cmd_id}),
        user={"id": TECH_USER},
    )
    assert res_ok["item"]["log_kind"] == "tank_swap"
    assert res_ok["item"]["incident_id"] is None
    assert res_ok["command"] == {"command_id": str(cmd_id), "status": "queued"}
    insert_cmd = next(
        c for c in conn_ok.execute.call_args_list if "insert into public.lpg_commands" in c.args[0].lower()
    )
    assert insert_cmd.args[1][5] == "complete_maintenance"
    assert not any("from public.incidents" in c.args[0].lower() for c in conn_ok.execute.call_args_list)


def test_only_manual_maintenance_log_endpoint_inserts_maintenance_logs():
    from pathlib import Path
    import re

    repo_root = Path(__file__).resolve().parents[2]
    insert_pattern = re.compile(r"insert\s+into\s+(?:public\.)?machine_maintenance_logs\b", re.IGNORECASE)
    inserting_files: set[str] = set()

    for subdir in ("backend", "pi5"):
        base = repo_root / subdir
        for py_file in base.rglob("*.py"):
            rel_parts = py_file.relative_to(repo_root).parts
            if any(part.startswith(".venv") or part in ("venv", "tests", "scripts", "__pycache__") for part in rel_parts):
                continue
            text = py_file.read_text(encoding="utf-8")
            if insert_pattern.search(text):
                inserting_files.add("/".join(rel_parts))

    assert inserting_files == {"backend/maintenance_logs.py"}
