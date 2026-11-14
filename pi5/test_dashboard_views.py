"""Focused local dashboard contracts; no live Pi database is touched."""

import json
from datetime import datetime, timedelta, timezone

import pytest
from werkzeug.security import generate_password_hash

from pi5.dashboard import dashboard


@pytest.fixture
def staff_client(monkeypatch):
    monkeypatch.setitem(dashboard.app.config, "SECRET_KEY", "dashboard-test-secret")
    monkeypatch.setattr(dashboard, "STAFF_USERNAME", "staff")
    monkeypatch.setattr(dashboard, "STAFF_PASSWORD_HASH", generate_password_hash("private-test-password"))
    client = dashboard.app.test_client()
    client.get("/login")
    with client.session_transaction() as signed:
        csrf = signed["staff_csrf"]
    response = client.post("/login", data={"username": "staff", "password": "private-test-password",
                                           "csrf_token": csrf}, headers={"Origin": "http://localhost"})
    assert response.status_code == 302
    return client


def test_staff_login_requires_csrf_and_rejects_external_return(monkeypatch):
    monkeypatch.setitem(dashboard.app.config, "SECRET_KEY", "dashboard-test-secret")
    monkeypatch.setattr(dashboard, "STAFF_USERNAME", "staff")
    monkeypatch.setattr(dashboard, "STAFF_PASSWORD_HASH", generate_password_hash("private-test-password"))
    client = dashboard.app.test_client()
    assert client.post("/login", data={"username": "staff", "password": "private-test-password"}).status_code == 403
    client.get("/login")
    with client.session_transaction() as signed:
        csrf = signed["staff_csrf"]
    response = client.post("/login", data={"username": "staff", "password": "private-test-password",
                                           "csrf_token": csrf, "next": "//foreign.example"},
                           headers={"Origin": "http://localhost"})
    assert response.status_code == 302
    assert response.location == "/"


def test_local_machine_commands_fail_closed_and_require_staff_csrf(staff_client, monkeypatch):
    source = "/api/dashboard/machines/washer-sim-01/commands"
    monkeypatch.setattr(dashboard, "LOCAL_CONTROLS_ENABLED", False)
    assert staff_client.post(source, json={"action": "start"}).status_code == 503
    monkeypatch.setattr(dashboard, "LOCAL_CONTROLS_ENABLED", True)
    assert staff_client.post(source, json={"action": "start"}).status_code == 403
    assert dashboard.app.test_client().post(source, json={"action": "start"}).status_code == 401


def test_local_start_requires_saved_program_and_pins_its_revision():
    from pi5.simulator_core import default_programs, program_hash

    programs = default_programs("washer")
    with pytest.raises(ValueError, match="Select a supported program"):
        dashboard._start_arguments({}, {"programs": programs})
    with pytest.raises(ValueError, match="unavailable"):
        dashboard._start_arguments({"program_id": "quick"}, {"programs": {}})
    with pytest.raises(ValueError, match="Select a supported program"):
        dashboard._start_arguments({"program_id": "quick", "price_myr": "0"}, {"programs": programs})
    assert dashboard._start_arguments({"program_id": "quick"}, {"programs": programs}) == {
        "program_id": "quick", "settings_hash": program_hash(programs["quick"]),
    }


def test_command_history_filters_use_malaysia_today_and_reject_bad_pages():
    now = datetime(2026, 11, 14, 2, 30, tzinfo=timezone.utc)
    since, page = dashboard._command_history_query("today", "2", now)
    assert since == datetime(2026, 11, 13, 16, 0)
    assert page == 2
    assert dashboard._command_history_query("week", "1", now)[0] == datetime(2026, 11, 7, 2, 30)
    assert dashboard._command_history_query("all", "1", now)[0] is None
    for period, page_value in (("year", "1"), ("week", "0"), ("week", "-1"), ("week", "10000")):
        with pytest.raises(ValueError, match="Invalid command history filter"):
            dashboard._command_history_query(period, page_value, now)


def test_command_history_is_paged_and_local_fault_injection_is_rejected(staff_client, monkeypatch):
    class Cursor:
        def __init__(self):
            self.query = ""
            self.params = ()
            self.calls = []

        def __enter__(self): return self
        def __exit__(self, *_): pass
        def execute(self, query, params):
            self.query, self.params = query, params
            self.calls.append((query, params))
        def fetchone(self):
            if "SELECT device_type" in self.query: return {"device_type": "washer"}
            if "COUNT(*)" in self.query: return {"total": 6}
            if "SELECT state_payload" in self.query: return {"state_payload": '{"state":"idle"}'}
            return None
        def fetchall(self): return []

    class Connection:
        def __init__(self): self.cursor_instance = Cursor()
        def cursor(self): return self.cursor_instance
        def close(self): pass

    connections = []
    def connect():
        conn = Connection()
        connections.append(conn)
        return conn

    monkeypatch.setattr(dashboard, "LOCAL_CONTROLS_ENABLED", True)
    monkeypatch.setattr(dashboard, "get_db_connection", connect)
    monkeypatch.setattr(dashboard.gateway_config, "get_stored_gateway_credentials", lambda: ("gateway-1", "secret"))
    monkeypatch.setattr(dashboard.gateway_config, "load_gateway_db_state", lambda *_: {"status": "active", "gateway_id": "gateway-1"})
    url = "/api/dashboard/machines/washer-sim-01/commands"
    response = staff_client.get(url + "?period=all&page=2")
    assert response.status_code == 200
    assert (response.json["page"], response.json["total_pages"], response.json["total"]) == (2, 2, 6)
    assert connections[-1].cursor_instance.calls[-1][1] == ("gateway-1", "washer-sim-01", 5, 5)
    assert staff_client.get(url + "?period=year&page=1").status_code == 422
    with staff_client.session_transaction() as signed:
        csrf = signed["staff_csrf"]
    rejected = staff_client.post(url, json={"action": "inject_fault", "arguments": {"fault_code": "SIM_WATER"}},
                                 headers={"Origin": "http://localhost", "X-Staff-CSRF": csrf})
    assert rejected.status_code == 422
    assert rejected.json["error"] == "Unsupported action"


def test_dashboard_snapshot_only_uses_approved_current_gateway(monkeypatch):
    gateway_id = "gate-1"
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    observation = {
        "record_id": "record-1", "recorded_at": now, "gateway_receipt_at": now,
        "source_time_quality": "gateway_receipt_only", "source_kind": "physical",
        "quality_metadata": json.dumps({"temperature_valid": False, "weight_valid": True}),
        "data_payload": json.dumps({"lpg_percent": 12, "temperature": 0, "mq6_raw_adc": 101}),
        "is_synced": 0,
    }
    statements = []

    class Cursor:
        def execute(self, sql, params=None):
            statements.append((sql, params))
        def fetchall(self):
            if "FROM device_discoveries" in statements[-1][0]:
                return [{"source_id": "new-node-02", "proposed_type": "lpg_edge_node",
                         "first_seen_at": now, "last_seen_at": now,
                         "is_synced": 1, "rejection_reason": None}]
            return [{"source_id": "lpg-node-01", "device_type": "lpg_edge_node",
                     "source_kind": "physical", "label": "Physical LPG node", "capacity_kg": None}]
        def fetchone(self):
            sql = statements[-1][0]
            if "FROM sensor_telemetry" in sql and "ORDER BY CASE" in sql:
                return observation
            return {"synced": 2, "pending": 1, "quarantined": 4}
        def __enter__(self):
            return self
        def __exit__(self, *_):
            return False

    class Connection:
        def cursor(self):
            return Cursor()
        def close(self):
            pass

    monkeypatch.setattr(dashboard, "get_db_connection", lambda: Connection())
    monkeypatch.setattr(dashboard.gateway_config, "get_stored_gateway_credentials", lambda: (gateway_id, "private"))
    monkeypatch.setattr(dashboard.gateway_config, "load_gateway_db_state",
                        lambda _conn, _id: {"gateway_id": gateway_id, "branch_id": "branch-1", "status": "active"})
    snapshot = dashboard._dashboard_snapshot()
    assert len(snapshot["devices"]) == 1
    assert snapshot["devices"][0]["observation"]["values"]["temperature"] is None
    assert snapshot["devices"][0]["observation"]["values"]["mq6_raw_adc"] == 101
    assert snapshot["sync"] == {"synced": 2, "pending": 1, "quarantined": 4}
    assert snapshot["discoveries"][0]["source_id"] == "new-node-02"
    assert snapshot["discoveries"][0]["cloud_delivery"] == "received"
    assert all(params == (gateway_id, "lpg-node-01") for sql, params in statements if "ORDER BY CASE" in sql)
    assert all(params == (gateway_id,) for sql, params in statements if "FROM device_registry WHERE" in sql)
    assert all(params == (gateway_id,) for sql, params in statements if "FROM device_discoveries" in sql)
    assert all(params == (gateway_id,) for sql, params in statements if "SUM(CASE" in sql)


def test_old_simulated_sample_cannot_be_presented_as_current():
    received = datetime.now(timezone.utc).replace(tzinfo=None)
    old = received - timedelta(hours=2)
    sample = dashboard._observation({
        "record_id": "old-1", "recorded_at": old, "gateway_receipt_at": received,
        "source_time_quality": "device_reported", "source_kind": "simulated",
        "quality_metadata": "{}", "data_payload": '{"state":"idle","remaining_seconds":0}', "is_synced": 1,
    })
    assert sample["freshness"] == "offline"
    assert sample["state"] == "IDLE"
    assert sample["sample_at"].startswith(old.isoformat()[:19])


def test_read_routes_fail_without_fabricating_empty_data(staff_client, monkeypatch):
    monkeypatch.setattr(dashboard, "_dashboard_snapshot", lambda: (_ for _ in ()).throw(RuntimeError("database failed")))
    response = staff_client.get("/api/dashboard/machines")
    assert response.status_code == 503
    assert response.json == {"error": "Local dashboard data unavailable"}


def test_staff_session_expires_even_while_page_is_polling(staff_client):
    with staff_client.session_transaction() as signed:
        signed["staff_expires_at"] = 1
    assert staff_client.get("/api/dashboard/overview").status_code == 401
    assert staff_client.get("/").status_code == 302
    assert staff_client.get("/login").status_code == 200


def test_read_routes_return_scoped_categories(staff_client, monkeypatch):
    monkeypatch.setattr(dashboard, "_dashboard_snapshot", lambda: {
        "gateway": {"status": "active", "branch_id": "branch-1"}, "checked_at": "2026-11-12T00:00:00Z",
        "sync": {"pending": 0, "synced": 3, "quarantined": 0},
        "discoveries": [{"source_id": "pending-1", "suggested_type": "washer",
                         "last_seen_at": "2026-11-12T00:00:00Z", "cloud_delivery": "pending"}],
        "devices": [
            {"type": "washer", "source_id": "washer-1", "observation": None},
            {"type": "dryer", "source_id": "dryer-1", "observation": None},
            {"type": "washer_dryer", "source_id": "combo-1", "observation": None},
            {"type": "lpg_edge_node", "source_id": "lpg-1", "observation": None},
            {"type": "lpg_edge_node", "source_id": "lpg-2", "observation": None},
        ],
    })
    assert [d["source_id"] for d in staff_client.get("/api/dashboard/machines").json["devices"]] == ["washer-1", "dryer-1", "combo-1"]
    assert [d["source_id"] for d in staff_client.get("/api/dashboard/lpg-safety").json["devices"]] == ["lpg-1", "lpg-2"]
    overview = staff_client.get("/api/dashboard/overview").json
    assert overview["unknown_devices"] == 5
    assert overview["device_counts"] == {"machines": 3, "safety_nodes": 2}
    assert overview["discoveries"][0]["source_id"] == "pending-1"


def test_machine_statistics_count_only_completed_cycles(staff_client, monkeypatch):
    from decimal import Decimal
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    calls = []

    class Cursor:
        def execute(self, sql, params):
            calls.append((sql, params))
        def fetchone(self):
            return {"source_id": "washer-sim-01"}
        def fetchall(self):
            if "machine_cycle_daily_runtime" in calls[-1][0]:
                return []
            return [
                {"cycle_id": "a", "program_id": "quick", "price_myr": Decimal("3.25"),
                 "target_seconds": 8, "running_seconds": 8, "outcome": "completed",
                 "started_at": now, "finished_at": now},
                {"cycle_id": "b", "program_id": "standard", "price_myr": Decimal("6.00"),
                 "target_seconds": 60, "running_seconds": 4, "outcome": "stopped",
                 "started_at": now, "finished_at": now},
            ]
        def __enter__(self):
            return self
        def __exit__(self, *_):
            return False

    class Connection:
        def cursor(self):
            return Cursor()
        def close(self):
            pass

    monkeypatch.setattr(dashboard, "get_db_connection", Connection)
    monkeypatch.setattr(dashboard.gateway_config, "get_stored_gateway_credentials", lambda: ("gateway-1", "private"))
    monkeypatch.setattr(dashboard.gateway_config, "load_gateway_db_state",
                        lambda *_: {"status": "active", "gateway_id": "gateway-1"})
    path = "/api/dashboard/machines/washer-sim-01/statistics"
    assert dashboard.app.test_client().get(path).status_code == 401
    assert staff_client.get(path + "?period=year").status_code == 400
    assert staff_client.get(path + "?period=week&dataset=demo").status_code == 400
    result = staff_client.get(path + "?period=day")
    assert result.status_code == 200
    assert result.json["summary"]["completed_cycles"] == 1
    assert result.json["summary"]["running_seconds"] == 12
    assert result.json["summary"]["estimated_revenue_myr"] == "3.25"
    assert result.json["summary"]["stopped"] == 1
    assert len(result.json["events"]) == 2
    assert result.json["events"][0]["price_myr"] == "6.00"
    assert result.json["events"][1]["outcome"] == "completed"
    assert calls[0][1] == ("gateway-1", "washer-sim-01")
    assert calls[1][1][:2] == ("gateway-1", "washer-sim-01")


def test_machine_statistics_split_stopped_runtime_by_malaysia_day(staff_client, monkeypatch):
    from decimal import Decimal
    from zoneinfo import ZoneInfo
    local_midnight = datetime.now(ZoneInfo("Asia/Kuala_Lumpur")).replace(hour=0, minute=0, second=0, microsecond=0)
    finished = (local_midnight + timedelta(seconds=3)).astimezone(timezone.utc).replace(tzinfo=None)
    started = finished - timedelta(seconds=5)
    previous = (local_midnight - timedelta(days=1)).date().isoformat()
    current = local_midnight.date().isoformat()
    class Cursor:
        sql = ""
        def execute(self, sql, _params):
            self.sql = sql
        def fetchone(self):
            return {"source_id": "washer-sim-01"}
        def fetchall(self):
            if "machine_cycle_daily_runtime" in self.sql:
                return [{"cycle_id": "cycle-1", "local_date": previous, "running_seconds": 2},
                        {"cycle_id": "cycle-1", "local_date": current, "running_seconds": 3}]
            return [{"cycle_id": "cycle-1", "program_id": "quick", "price_myr": Decimal("4.00"),
                     "target_seconds": 30, "running_seconds": 5, "outcome": "stopped",
                     "started_at": started, "finished_at": finished}]
        def __enter__(self):
            return self
        def __exit__(self, *_):
            return False
    class Connection:
        def cursor(self):
            return Cursor()
        def close(self):
            pass
    monkeypatch.setattr(dashboard, "get_db_connection", Connection)
    monkeypatch.setattr(dashboard.gateway_config, "get_stored_gateway_credentials", lambda: ("gateway-1", "private"))
    monkeypatch.setattr(dashboard.gateway_config, "load_gateway_db_state",
                        lambda *_: {"status": "active", "gateway_id": "gateway-1"})
    response = staff_client.get("/api/dashboard/machines/washer-sim-01/statistics?period=week")
    assert response.status_code == 200
    assert response.json["summary"]["completed_cycles"] == 0
    assert response.json["summary"]["stopped"] == 1
    assert response.json["summary"]["running_seconds"] == 5
    assert response.json["summary"]["estimated_revenue_myr"] == "0.00"
    assert [(row["timestamp"], row["running_seconds"]) for row in response.json["series"]] == [(previous, 2), (current, 3)]


