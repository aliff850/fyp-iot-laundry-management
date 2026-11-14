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
