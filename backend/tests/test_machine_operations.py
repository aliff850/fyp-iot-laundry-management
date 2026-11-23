"""Focused machine command and current-state boundary checks."""

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

import machine_operations as machines


GATEWAY = UUID("66666666-6666-6666-6666-666666666666")
BRANCH = UUID("44444444-4444-4444-4444-444444444444")
ORG = UUID("33333333-3333-3333-3333-333333333333")
DEVICE = UUID("88888888-8888-8888-8888-888888888888")


def mock_db(conn):
    @contextmanager
    def db(**_kwargs):
        yield conn
    return db


def test_edge_state_rejects_stale_and_does_not_write(monkeypatch):
    conn = MagicMock()
    monkeypatch.setattr(machines, "_database", mock_db(conn))
    body = machines.EdgeMachineState(source_id="washer-sim-01", boot_id="boot-1",
        sequence=1, gateway_seen_at=datetime.now(timezone.utc) - timedelta(minutes=2),
        state={"state": "idle", "simulation": True})
    with pytest.raises(HTTPException) as error:
        machines.upload_machine_state(body, {"id": GATEWAY, "status": "active"})
    assert error.value.status_code == 422
    conn.execute.assert_not_called()


def test_edge_state_derives_attribution_from_approved_device(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = {
        "id": DEVICE, "gateway_id": GATEWAY, "branch_id": BRANCH,
        "organization_id": ORG,
    }
    monkeypatch.setattr(machines, "_database", mock_db(conn))
    body = machines.EdgeMachineState(source_id="washer-sim-01", boot_id="boot-1",
        sequence=2, gateway_seen_at=datetime.now(timezone.utc),
        state={"state": "running", "simulation": True})
    assert machines.upload_machine_state(body, {"id": GATEWAY, "status": "active"}) == {"accepted": True}
    assert conn.execute.call_args_list[0].args[1] == (GATEWAY, "washer-sim-01")
    assert DEVICE in conn.execute.call_args_list[1].args[1]


def test_manager_cannot_send_when_branch_closed(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = {"service_status": "closed"}
    monkeypatch.setattr(machines, "_database", mock_db(conn))
    monkeypatch.setattr(machines, "_authorize_branch_access",
        lambda *_args: ({"organization_id": ORG, "role": "branch_manager"}, {}))
    body = machines.OperatorMachineCommand(request_id=uuid4(), action="start")
    with pytest.raises(HTTPException) as error:
        machines.create_machine_command(BRANCH, "washer-sim-01", body, {"id": uuid4()})
    assert error.value.status_code == 409
    assert not any("insert into public.machine_commands" in call.args[0] for call in conn.execute.call_args_list)


def test_non_washer_settings_are_rejected_before_queueing(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchone.side_effect = [
        {"service_status": "open"},
        {"id": DEVICE, "gateway_id": GATEWAY, "device_type": "dryer"},
        None,
        None,
        {"state_payload": {"state": "idle"}, "cloud_seen_at": datetime.now(timezone.utc)},
    ]
    monkeypatch.setattr(machines, "_database", mock_db(conn))
    monkeypatch.setattr(machines, "_authorize_branch_access",
        lambda *_args: ({"organization_id": ORG, "role": "owner"}, {}))
    body = machines.OperatorMachineCommand(request_id=uuid4(), action="set_settings",
        arguments={"program_id": "quick"})
    with pytest.raises(HTTPException) as error:
        machines.create_machine_command(BRANCH, "dryer-sim-01", body, {"id": uuid4()})
    assert error.value.status_code == 422
    assert not any("insert into public.machine_commands" in call.args[0] for call in conn.execute.call_args_list)


def test_cycle_batch_rejects_inconsistent_running_time_without_writing(monkeypatch):
    conn = MagicMock()
    monkeypatch.setattr(machines, "_database", mock_db(conn))
    body = machines.EdgeCycleBatch(cycles=[machines.EdgeCycle(
        cycle_id=uuid4(), source_id="washer-sim-01", program_id="quick",
        price_myr="4.00", target_seconds=30, running_seconds=20,
        outcome="completed", started_at=datetime.now(timezone.utc) - timedelta(seconds=30),
        finished_at=datetime.now(timezone.utc),
        daily_runtime=[machines.CycleDay(local_date=datetime.now(timezone.utc).date(),
                                         running_seconds=19)],
    )])
    result = machines.upload_machine_cycles(body, {"id": GATEWAY, "status": "active"})
    assert result["accepted_cycle_ids"] == []
    assert result["rejected"][0]["reason"] == "Invalid cycle timing or allocation"
    conn.execute.assert_not_called()


def test_statistics_requires_financially_authorized_membership(monkeypatch):
    conn = MagicMock()
    monkeypatch.setattr(machines, "_database", mock_db(conn))
    def deny(_conn, _user_id, _branch_id, roles):
        assert roles == ("owner", "branch_manager")
        raise HTTPException(403, "Not permitted")
    monkeypatch.setattr(machines, "_authorize_branch_access", deny)
    with pytest.raises(HTTPException) as error:
        machines.machine_statistics(BRANCH, "washer-sim-01", "week", {"id": uuid4()})
    assert error.value.status_code == 403
    conn.execute.assert_not_called()


def test_edge_state_accepts_maintenance_state(monkeypatch):
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = {
        "id": DEVICE,
        "gateway_id": GATEWAY,
        "branch_id": BRANCH,
        "organization_id": ORG,
    }
    monkeypatch.setattr(machines, "_database", mock_db(conn))
    body = machines.EdgeMachineState(
        source_id="washer-sim-01",
        boot_id="boot-1",
        sequence=3,
        gateway_seen_at=datetime.now(timezone.utc),
        state={"state": "maintenance", "fault_code": "E01", "simulation": True},
    )
    assert machines.upload_machine_state(body, {"id": GATEWAY, "status": "active"}) == {"accepted": True}


def test_machine_maintenance_can_queue_maintenance_and_clear_fault_only(monkeypatch):
    conn = MagicMock()
    seen_role_tuples = []

    def fake_authorize(_conn, _user_id, _branch_id, roles):
        seen_role_tuples.append(roles)
        if "machine_maintenance" not in roles:
            raise HTTPException(403, "Insufficient permissions")
        return {"organization_id": ORG, "role": "machine_maintenance"}, {}

    monkeypatch.setattr(machines, "_database", mock_db(conn))
    monkeypatch.setattr(machines, "_authorize_branch_access", fake_authorize)

    # Disallowed action for machine_maintenance specialist
    with pytest.raises(HTTPException) as start_err:
        machines.create_machine_command(
            BRANCH,
            "washer-sim-01",
            machines.OperatorMachineCommand(request_id=uuid4(), action="start"),
            {"id": uuid4()},
        )
    assert start_err.value.status_code == 403

    # Allowed start_maintenance from idle
    req_maint = uuid4()
    conn.execute.return_value.fetchone.side_effect = [
        {"service_status": "open"},
        {"id": DEVICE, "gateway_id": GATEWAY, "device_type": "washer"},
        None,
        None,
        {"state_payload": {"state": "idle"}, "cloud_seen_at": datetime.now(timezone.utc)},
        {"status": "queued", "action": "start_maintenance", "arguments": {}, "device_id": DEVICE},
    ]
    res_maint = machines.create_machine_command(
        BRANCH,
        "washer-sim-01",
        machines.OperatorMachineCommand(request_id=req_maint, action="start_maintenance"),
        {"id": uuid4()},
    )
    assert res_maint == {"command_id": str(req_maint), "status": "queued"}

    # Allowed clear_fault from maintenance
    req_clear = uuid4()
    conn.execute.return_value.fetchone.side_effect = [
        {"service_status": "open"},
        {"id": DEVICE, "gateway_id": GATEWAY, "device_type": "washer"},
        None,
        None,
        {"state_payload": {"state": "maintenance"}, "cloud_seen_at": datetime.now(timezone.utc)},
        {"status": "queued", "action": "clear_fault", "arguments": {}, "device_id": DEVICE},
    ]
    res_clear = machines.create_machine_command(
        BRANCH,
        "washer-sim-01",
        machines.OperatorMachineCommand(request_id=req_clear, action="clear_fault"),
        {"id": uuid4()},
    )
    assert res_clear == {"command_id": str(req_clear), "status": "queued"}
    assert seen_role_tuples == [
        ("owner", "branch_manager"),
        ("owner", "branch_manager", "machine_maintenance"),
        ("owner", "branch_manager", "machine_maintenance"),
    ]
