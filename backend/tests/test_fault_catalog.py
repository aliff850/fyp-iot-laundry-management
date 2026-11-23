from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import fault_catalog
import machine_operations
import main


def test_explain_fault_covers_e01_to_e05_and_legacy_sim_aliases():
    expected = {
        "E01": "Water Inlet Failure",
        "E02": "Drain Pump Blockage",
        "E03": "Door Lock Interlock Fault",
        "E04": "Heater / Thermal Cutoff",
        "E05": "Drum Imbalance / Spin Trip",
    }
    for code, title in expected.items():
        diagnosis = fault_catalog.explain_fault(code)
        assert diagnosis is not None
        assert diagnosis["fault_code"] == code
        assert diagnosis["title"] == title
        assert diagnosis["source_status"] == "placeholder_washer_guide"
        assert "placeholder" in diagnosis["disclaimer"].lower()
        assert len(diagnosis["likely_causes"]) >= 2
        assert len(diagnosis["troubleshooting_steps"]) >= 3
        assert diagnosis["safety_precautions"]

    assert fault_catalog.explain_fault("SIM_WATER")["title"] == "Water Inlet Failure"
    assert fault_catalog.explain_fault("SIM_DOOR")["title"] == "Door Lock Interlock Fault"
    assert fault_catalog.explain_fault("SIM_HEAT")["title"] == "Heater / Thermal Cutoff"


def test_explain_fault_unknown_vendor_codes_remain_unverified():
    for unknown_code in ("E14", "E99", "E12"):
        diagnosis = fault_catalog.explain_fault(unknown_code)
        assert diagnosis is not None
        assert diagnosis["fault_code"] == unknown_code
        assert diagnosis["source_status"] == "unverified_vendor_code"
        assert f"Unverified vendor code ({unknown_code})" == diagnosis["title"]
        assert "no verified manufacturer documentation" in diagnosis["disclaimer"].lower()


def test_explain_fault_supports_lpg_domain_and_empty_code():
    assert fault_catalog.explain_fault(None) is None
    assert fault_catalog.explain_fault("   ") is None
    lpg = fault_catalog.explain_fault("gas_critical", domain="lpg")
    assert lpg is not None
    assert lpg["source_status"] == "spinsense_safety_rule"
    assert "Evacuate" in lpg["safety_precautions"]


class _Result:
    def __init__(self, row=None, rows=None):
        self._row = row
        self._rows = rows or []

    def fetchone(self):
        return self._row

    def fetchall(self):
        return self._rows


class _FakeMachineConn:
    def __init__(self, *, role: str, machine_state: str, fault_code: str | None = None):
        self.role = role
        self.machine_state = machine_state
        self.fault_code = fault_code
        self.inserted_commands: list[tuple] = []
        self.org_id = uuid4()
        self.branch_id = uuid4()
        self.device_id = uuid4()
        self.gateway_id = uuid4()

    def execute(self, sql: str, params=()):
        q = " ".join(sql.lower().split())
        if "from public.organizations" in q or "member" in q:
            return _Result()
        if "select service_status from public.branches" in q:
            return _Result(row={"service_status": "open"})
        if "from public.devices d join public.gateways g" in q:
            return _Result(
                row={
                    "id": self.device_id,
                    "gateway_id": self.gateway_id,
                    "device_type": "washer",
                }
            )
        if "select action,arguments,status,actor_user_id,device_id from public.machine_commands where id=" in q:
            return _Result(row=None)
        if "select status,action,arguments,device_id from public.machine_commands where id=" in q:
            saved = self.inserted_commands[-1] if self.inserted_commands else None
            if not saved:
                return _Result(row=None)
            return _Result(
                row={
                    "status": "queued",
                    "action": saved[5],
                    "arguments": saved[6].obj if hasattr(saved[6], "obj") else saved[6],
                    "device_id": self.device_id,
                }
            )
        if "from public.machine_commands where device_id=" in q:
            return _Result(row=None)
        if "from public.machine_latest" in q and "join public.devices" not in q:
            return _Result(
                row={
                    "cloud_seen_at": datetime.now(timezone.utc) - timedelta(seconds=5),
                    "state_payload": {
                        "state": self.machine_state,
                        "fault_code": self.fault_code,
                        "fault_name": "Water Inlet Failure" if self.fault_code == "E01" else None,
                    },
                }
            )
        if "from public.devices d left join public.machine_latest" in q:
            return _Result(
                rows=[
                    {
                        "source_id": "washer_1",
                        "device_type": "washer",
                        "source_kind": "simulated",
                        "label": "Washer 01",
                        "capacity_kg": 10,
                        "cloud_seen_at": datetime.now(timezone.utc) - timedelta(seconds=5),
                        "state_payload": {
                            "state": self.machine_state,
                            "fault_code": self.fault_code,
                            "fault_name": "Water Inlet Failure" if self.fault_code == "E01" else None,
                            "settings": {"program_id": "standard", "price_myr": "6.00"},
                        },
                    }
                ]
            )
        if "insert into public.machine_commands" in q:
            self.inserted_commands.append(params)
            return _Result()
        return _Result()


def test_list_machine_state_attaches_explainable_diagnosis_and_redacts_specialist_price():
    conn = _FakeMachineConn(role="machine_maintenance", machine_state="error", fault_code="E01")
    user_id = uuid4()

    @contextmanager
    def _fake_db(read_only=False):
        yield conn

    def _fake_auth(c, uid, bid, roles):
        assert "machine_maintenance" in roles
        return {"organization_id": conn.org_id, "role": "machine_maintenance"}, {}

    main.app.dependency_overrides[machine_operations._user] = lambda: {"id": user_id}
    try:
        with (
            patch.object(machine_operations, "_database", _fake_db),
            patch.object(machine_operations, "_authorize_branch_access", _fake_auth),
        ):
            client = TestClient(main.app)
            resp = client.get(f"/branches/{conn.branch_id}/machine-state")
    finally:
        main.app.dependency_overrides.clear()

    assert resp.status_code == 200
    machines = resp.json()["machines"]
    assert len(machines) == 1
    machine = machines[0]
    assert machine["state"] == "error"
    assert "price_myr" not in machine["data"]["settings"]
    assert machine["diagnosis"]["fault_code"] == "E01"
    assert machine["diagnosis"]["source_status"] == "placeholder_washer_guide"
    assert len(machine["diagnosis"]["troubleshooting_steps"]) >= 3


def test_create_machine_command_allows_clear_fault_only_in_error_state():
    user_id = uuid4()
    err_conn = _FakeMachineConn(role="owner", machine_state="error", fault_code="E01")
    idle_conn = _FakeMachineConn(role="owner", machine_state="idle", fault_code=None)

    def _run_with_conn(conn):
        @contextmanager
        def _fake_db(read_only=False):
            yield conn

        def _fake_auth(c, uid, bid, roles):
            return {"organization_id": conn.org_id, "role": conn.role}, {}

        main.app.dependency_overrides[machine_operations._user] = lambda: {"id": user_id}
        try:
            with (
                patch.object(machine_operations, "_database", _fake_db),
                patch.object(machine_operations, "_authorize_branch_access", _fake_auth),
            ):
                client = TestClient(main.app)
                return client.post(
                    f"/branches/{conn.branch_id}/machine-commands/washer_1",
                    json={"request_id": str(uuid4()), "action": "clear_fault", "arguments": {}},
                )
        finally:
            main.app.dependency_overrides.clear()

    ok_resp = _run_with_conn(err_conn)
    assert ok_resp.status_code == 202, ok_resp.text
    assert ok_resp.json()["status"] == "queued"
    assert len(err_conn.inserted_commands) == 1

    bad_resp = _run_with_conn(idle_conn)
    assert bad_resp.status_code == 409, bad_resp.text
