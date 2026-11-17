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


def test_notifications_endpoint_returns_machine_and_lpg_events(staff_client, monkeypatch):
    from decimal import Decimal
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    calls = []

    class Cursor:
        def execute(self, sql, params=None):
            calls.append((sql, params))
        def fetchall(self):
            return [
                {"cycle_id": "cyc-1", "source_id": "washer-1", "program_id": "quick",
                 "price_myr": Decimal("4.00"), "target_seconds": 120, "running_seconds": 120,
                 "outcome": "completed", "started_at": now - timedelta(minutes=5),
                 "finished_at": now - timedelta(minutes=3)},
                {"cycle_id": "cyc-2", "source_id": "dryer-1", "program_id": "standard",
                 "price_myr": Decimal("5.00"), "target_seconds": 180, "running_seconds": 45,
                 "outcome": "fault", "started_at": now - timedelta(minutes=2),
                 "finished_at": now - timedelta(minutes=1)},
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

    snapshot = {
        "gateway": {"status": "active", "branch_id": "branch-1"},
        "checked_at": "2026-11-15T06:00:00Z",
        "devices": [
            {
                "source_id": "washer-1", "type": "washer", "source_kind": "simulated",
                "label": "Washer 01", "status": "active", "maintenance_mode": False,
                "observation": {
                    "freshness": "fresh", "state": "RUNNING", "fault_code": None,
                    "sample_at": "2026-11-15T05:59:58Z", "settings": {"program_id": "quick"}, "values": {},
                },
            },
            {
                "source_id": "dryer-1", "type": "dryer", "source_kind": "simulated",
                "label": "Dryer 01", "status": "active", "maintenance_mode": False,
                "observation": {
                    "freshness": "fresh", "state": "ERROR", "fault_code": "E04",
                    "sample_at": "2026-11-15T05:59:59Z", "settings": {}, "values": {},
                },
            },
            {
                "source_id": "lpg-1", "type": "lpg_edge_node", "source_kind": "physical",
                "label": "Main Tank Scale", "status": "maintenance", "maintenance_mode": True,
                "observation": {
                    "freshness": "fresh", "state": "UNKNOWN", "fault_code": None,
                    "sample_at": "2026-11-15T05:59:55Z", "values": {"lpg_percent": 11.4},
                },
            },
            {
                "source_id": "lpg-2", "type": "lpg_edge_node", "source_kind": "physical",
                "label": "Reserve Active Scale", "status": "active", "maintenance_mode": False,
                "observation": {
                    "freshness": "fresh", "state": "UNKNOWN", "fault_code": None,
                    "sample_at": "2026-11-15T05:59:56Z", "values": {"lpg_percent": 11.4},
                },
            },
            {
                "source_id": "lpg-offline", "type": "lpg_edge_node", "source_kind": "physical",
                "label": "Reserve Scale", "status": "active", "maintenance_mode": False,
                "observation": {
                    "freshness": "offline", "state": "UNKNOWN", "fault_code": None,
                    "sample_at": "2026-11-15T04:00:00Z", "values": {"lpg_percent": 2.0},
                },
            },
        ],
    }

    monkeypatch.setattr(dashboard, "_dashboard_snapshot", lambda: snapshot)
    monkeypatch.setattr(dashboard, "get_db_connection", Connection)
    monkeypatch.setattr(dashboard.gateway_config, "get_stored_gateway_credentials", lambda: ("gateway-1", "private"))

    assert dashboard.app.test_client().get("/api/dashboard/notifications").status_code == 401
    assert staff_client.get("/api/dashboard/notifications?category=invalid").status_code == 400
    assert staff_client.get("/api/dashboard/notifications?limit=0").status_code == 400

    res = staff_client.get("/api/dashboard/notifications")
    assert res.status_code == 200
    kinds = {e["id"]: e for e in res.json["events"]}
    assert kinds["live:machine:washer-1:running"]["category"] == "machine"
    assert kinds["live:machine:dryer-1:error"]["detail"] == "Dryer 01 reported fault E04"
    assert kinds["live:lpg:lpg-1:maintenance"]["title"] == "LPG undergoing maintenance"
    assert "live:lpg:lpg-1:low" not in kinds
    assert kinds["live:lpg:lpg-2:low"]["title"] == "LPG gas level low"
    assert "live:lpg:lpg-offline:critical" not in kinds
    assert kinds["cycle:cyc-1:completed"]["kind"] == "machine_completed"
    assert kinds["cycle:cyc-2:fault"]["severity"] == "negative"

    lpg_only = staff_client.get("/api/dashboard/notifications?category=lpg")
    assert lpg_only.status_code == 200
    assert all(item["category"] == "lpg" for item in lpg_only.json["events"])
    assert len(calls) == 2 and calls[0][1] == ("gateway-1", 100)


def test_notifications_endpoint_fails_503_on_db_error(staff_client, monkeypatch):
    monkeypatch.setattr(dashboard, "_dashboard_snapshot", lambda: (_ for _ in ()).throw(RuntimeError("db down")))
    res = staff_client.get("/api/dashboard/notifications")
    assert res.status_code == 503
    assert res.json == {"error": "Local dashboard data unavailable"}


def test_notifications_device_summary_exposes_calibrated_gas_only_when_fresh(staff_client, monkeypatch):
    class Cursor:
        def execute(self, *_):
            pass
        def fetchall(self):
            return []
        def __enter__(self):
            return self
        def __exit__(self, *_):
            return False

    class Connection:
        def cursor(self):
            return Cursor()
        def close(self):
            pass

    snapshot = {
        "gateway": {"status": "active", "gateway_id": "gateway-1", "branch_id": "branch-1"},
        "checked_at": "2026-11-15T06:00:00Z",
        "devices": [
            {
                "source_id": "lpg-maint-calibrated", "type": "lpg_edge_node", "source_kind": "physical",
                "label": "Main Tank Scale", "status": "maintenance", "maintenance_mode": True,
                "gas_interpretation": {"ppm_calibrated": True, "gas_condition": "warning", "estimated_ppm": 520.0},
                "observation": {
                    "freshness": "fresh", "state": "UNKNOWN", "fault_code": None,
                    "sample_at": "2026-11-15T05:59:55Z", "values": {"lpg_percent": 11.4},
                },
            },
            {
                "source_id": "lpg-uncalibrated", "type": "lpg_edge_node", "source_kind": "physical",
                "label": "Uncalibrated Tank", "status": "active", "maintenance_mode": False,
                "gas_interpretation": {"ppm_calibrated": False, "gas_condition": "uncalibrated", "estimated_ppm": None},
                "observation": {
                    "freshness": "fresh", "state": "UNKNOWN", "fault_code": None,
                    "sample_at": "2026-11-15T05:59:56Z", "values": {"lpg_percent": 75.0},
                },
            },
            {
                "source_id": "lpg-offline-calibrated", "type": "lpg_edge_node", "source_kind": "physical",
                "label": "Offline Tank", "status": "active", "maintenance_mode": False,
                "gas_interpretation": {"ppm_calibrated": True, "gas_condition": "critical", "estimated_ppm": 1400.0},
                "observation": {
                    "freshness": "offline", "state": "UNKNOWN", "fault_code": None,
                    "sample_at": "2026-11-15T04:00:00Z", "values": {"lpg_percent": 2.0},
                },
            },
        ],
    }

    monkeypatch.setattr(dashboard, "_dashboard_snapshot", lambda: snapshot)
    monkeypatch.setattr(dashboard, "get_db_connection", Connection)
    monkeypatch.setattr(dashboard.gateway_config, "get_stored_gateway_credentials", lambda: ("gateway-1", "private"))

    res = staff_client.get("/api/dashboard/notifications")
    assert res.status_code == 200
    by_id = {d["source_id"]: d for d in res.json["devices"]}
    assert by_id["lpg-maint-calibrated"]["ppm_calibrated"] is True
    assert by_id["lpg-maint-calibrated"]["gas_condition"] == "warning"
    assert by_id["lpg-maint-calibrated"]["estimated_ppm"] == 520.0
    assert by_id["lpg-uncalibrated"]["ppm_calibrated"] is False
    assert by_id["lpg-uncalibrated"]["gas_condition"] is None
    assert by_id["lpg-uncalibrated"]["estimated_ppm"] is None
    assert by_id["lpg-offline-calibrated"]["ppm_calibrated"] is True
    assert by_id["lpg-offline-calibrated"]["gas_condition"] is None
    assert by_id["lpg-offline-calibrated"]["estimated_ppm"] is None


def test_dashboard_shell_includes_local_notification_and_signout_controls(staff_client):
    html = staff_client.get("/").get_data(as_text=True)
    bell_pos = html.index('id="notificationsButton"')
    logout_pos = html.index('action="/logout"')
    assert bell_pos < logout_pos
    assert "Display all notifications" in html
    assert 'id="toastRegion"' in html
    assert '<span class="sr-only">Sign out</span>' in html
    assert "cdn." not in html.lower() and "unpkg" not in html.lower()


def test_delete_program_command_validation(staff_client, monkeypatch):
    state = {"machine_state": "IDLE", "has_checkout": False, "has_program": True}
    executed = []

    class Cursor:
        sql = ""
        def execute(self, sql, params=None):
            self.sql = sql
            executed.append((sql, params))
        def fetchone(self):
            if "FROM device_registry" in self.sql:
                return {"device_type": "washer"}
            if "FROM machine_presence" in self.sql:
                programs = {"quick": {"program_id": "quick"}, "standard": {"program_id": "standard"}}
                if state["has_program"]:
                    programs["p_000000000001"] = {"program_id": "p_000000000001", "name": "Delicate"}
                return {"state_payload": json.dumps({"state": state["machine_state"], "programs": programs}), "last_seen_at": datetime.now(timezone.utc)}
            if "FROM machine_commands" in self.sql:
                return None
            if "FROM demo_checkouts" in self.sql:
                return {"checkout_id": "chk-1"} if state["has_checkout"] else None
            return None
        def __enter__(self):
            return self
        def __exit__(self, *_):
            return False

    class Connection:
        def cursor(self):
            return Cursor()
        def commit(self):
            pass
        def close(self):
            pass

    monkeypatch.setattr(dashboard, "LOCAL_CONTROLS_ENABLED", True)
    monkeypatch.setattr(dashboard, "get_db_connection", lambda: Connection())
    monkeypatch.setattr(dashboard.gateway_config, "get_stored_gateway_credentials", lambda: ("gateway-1", "secret"))
    monkeypatch.setattr(dashboard.gateway_config, "load_gateway_db_state", lambda *_: {"status": "active", "gateway_id": "gateway-1"})

    with staff_client.session_transaction() as signed:
        csrf = signed["staff_csrf"]
    headers = {"Origin": "http://localhost", "X-Staff-CSRF": csrf}
    url = "/api/dashboard/machines/washer-sim-01/commands"

    for bad_id in ("quick", "standard", "bad"):
        res = staff_client.post(url, json={"action": "delete_program", "arguments": {"program_id": bad_id}}, headers=headers)
        assert res.status_code == 422

    state["machine_state"] = "RUNNING"
    assert staff_client.post(url, json={"action": "delete_program", "arguments": {"program_id": "p_000000000001"}}, headers=headers).status_code == 409

    state["machine_state"] = "IDLE"
    state["has_checkout"] = True
    assert staff_client.post(url, json={"action": "delete_program", "arguments": {"program_id": "p_000000000001"}}, headers=headers).status_code == 409

    state["has_checkout"] = False
    state["has_program"] = False
    assert staff_client.post(url, json={"action": "delete_program", "arguments": {"program_id": "p_000000000001"}}, headers=headers).status_code == 409

    state["has_program"] = True
    queued = staff_client.post(url, json={"action": "delete_program", "arguments": {"program_id": "p_000000000001"}}, headers=headers)
    assert queued.status_code == 202
    assert queued.json["status"] == "queued"
    assert any("INSERT INTO machine_commands" in sql and params[3] == "delete_program" for sql, params in executed)


def test_lpg_maintenance_lifecycle_and_stability_gate(staff_client, monkeypatch):
    now = datetime.now(timezone.utc)
    db_state = {
        "active_session": None,
        "samples": [],
        "executed": [],
    }

    class Cursor:
        def __init__(self):
            self.sql = ""
        def execute(self, sql, params=()):
            self.sql = sql
            db_state["executed"].append((sql, params))
        def fetchone(self):
            if "FROM device_registry" in self.sql:
                return {
                    "source_id": "lpg-node-01",
                    "device_type": "lpg_edge_node",
                    "source_kind": "physical",
                    "label": "Main Dryer Bank LPG",
                    "capacity_kg": 50.0,
                    "status": "maintenance" if db_state["active_session"] else "active",
                }
            return None
        def fetchall(self):
            if "FROM lpg_node_config" in self.sql:
                return [{
                    "source_id": "lpg-node-01",
                    "mq6_vcc_v": 5.0,
                    "mq6_rl_kohm": 20.0,
                    "mq6_divider_ratio": 1.0,
                    "mq6_ro_kohm": None,
                    "mq6_baseline_v": None,
                    "gas_warn_ppm": 400.0,
                    "gas_crit_ppm": 1000.0,
                    "cylinder_tare_kg": 16.5,
                    "rated_capacity_kg": 50.0,
                    "stability_tolerance_kg": 0.25,
                }]
            if "FROM lpg_maintenance_sessions" in self.sql:
                return [db_state["active_session"]] if db_state["active_session"] else []
            if "FROM sensor_telemetry" in self.sql:
                return list(db_state["samples"])
            return []
        def __enter__(self):
            return self
        def __exit__(self, *_):
            return False

    class Connection:
        def cursor(self):
            return Cursor()
        def commit(self):
            pass
        def close(self):
            pass

    monkeypatch.setattr(dashboard, "get_db_connection", lambda: Connection())
    monkeypatch.setattr(dashboard.gateway_config, "get_stored_gateway_credentials", lambda: ("gateway-1", "secret"))
    monkeypatch.setattr(dashboard.gateway_config, "load_gateway_db_state", lambda *_: {"status": "active", "gateway_id": "gateway-1", "branch_id": "branch-1"})

    with staff_client.session_transaction() as signed:
        csrf = signed["staff_csrf"]
    headers = {"Origin": "http://localhost", "X-Staff-CSRF": csrf}

    # Unauthenticated & missing CSRF blocked
    assert dashboard.app.test_client().post("/api/dashboard/lpg/lpg-node-01/maintenance/start", json={}).status_code == 401
    assert staff_client.post("/api/dashboard/lpg/lpg-node-01/maintenance/start", json={}, headers={"Origin": "http://localhost"}).status_code == 403

    # Start tank swap maintenance
    started = staff_client.post(
        "/api/dashboard/lpg/lpg-node-01/maintenance/start",
        json={"started_by": "Ali", "service_note": "Exchanging cylinder B"},
        headers=headers,
    )
    assert started.status_code == 201
    session_id = started.json["session_id"]
    db_state["active_session"] = {
        "session_id": session_id,
        "source_id": "lpg-node-01",
        "started_by": "Ali",
        "service_note": "Exchanging cylinder B",
        "started_at": now,
    }

    # Duplicate start rejected
    assert staff_client.post("/api/dashboard/lpg/lpg-node-01/maintenance/start", json={}, headers=headers).status_code == 409

    # Complete rejected while scale readings are jumping
    db_state["samples"] = [
        {"record_id": f"r{i}", "recorded_at": now - timedelta(seconds=i * 5), "gateway_receipt_at": now - timedelta(seconds=i * 5),
         "source_time_quality": "gateway_receipt", "quality_metadata": json.dumps({"weight_valid": True}),
         "data_payload": json.dumps({"gross_weight_kg": w, "voltage": 0.55})}
        for i, w in enumerate((66.8, 65.1, 66.5))
    ]
    blocked = staff_client.post("/api/dashboard/lpg/lpg-node-01/maintenance/complete", json={"tare_kg": 16.8}, headers=headers)
    assert blocked.status_code == 409
    assert blocked.json["stability"]["stable"] is False

    # Complete succeeds once 3 consecutive recent valid scale samples settle
    db_state["samples"] = [
        {"record_id": f"s{i}", "recorded_at": now - timedelta(seconds=i * 5), "gateway_receipt_at": now - timedelta(seconds=i * 5),
         "source_time_quality": "gateway_receipt", "quality_metadata": json.dumps({"weight_valid": True}),
         "data_payload": json.dumps({"gross_weight_kg": w, "voltage": 0.55})}
        for i, w in enumerate((66.80, 66.84, 66.79))
    ]
    done = staff_client.post(
        "/api/dashboard/lpg/lpg-node-01/maintenance/complete",
        json={"completed_by": "Ali", "tare_kg": 16.8, "rated_capacity_kg": 50.0},
        headers=headers,
    )
    assert done.status_code == 200
    assert done.json["status"] == "completed"
    assert done.json["tare_kg"] == 16.8
    assert done.json["stability"]["stable"] is True
    assert any("UPDATE lpg_maintenance_sessions" in sql and params[1] == 16.8 for sql, params in db_state["executed"])


def test_lpg_gas_baseline_requires_fresh_voltage_and_resets(staff_client, monkeypatch):
    now = datetime.now(timezone.utc)
    state = {"voltage": 0.5, "age_s": 5, "executed": []}

    class Cursor:
        def __init__(self):
            self.sql = ""
        def execute(self, sql, params=()):
            self.sql = sql
            state["executed"].append((sql, params))
        def fetchone(self):
            if "FROM device_registry" in self.sql:
                return {"source_id": "lpg-node-01", "device_type": "lpg_edge_node", "source_kind": "physical",
                        "label": "Main Dryer Bank LPG", "capacity_kg": 50.0, "status": "active"}
            return None
        def fetchall(self):
            if "FROM sensor_telemetry" in self.sql:
                ts = now - timedelta(seconds=state["age_s"])
                return [{
                    "record_id": "g1",
                    "recorded_at": ts,
                    "gateway_receipt_at": ts,
                    "source_time_quality": "gateway_receipt",
                    "quality_metadata": json.dumps({"weight_valid": True}),
                    "data_payload": json.dumps({"voltage": state["voltage"], "gross_weight_kg": 40.0}),
                }]
            return []
        def __enter__(self):
            return self
        def __exit__(self, *_):
            return False

    class Connection:
        def cursor(self):
            return Cursor()
        def commit(self):
            pass
        def close(self):
            pass

    monkeypatch.setattr(dashboard, "get_db_connection", lambda: Connection())
    monkeypatch.setattr(dashboard.gateway_config, "get_stored_gateway_credentials", lambda: ("gateway-1", "secret"))
    monkeypatch.setattr(dashboard.gateway_config, "load_gateway_db_state", lambda *_: {"status": "active", "gateway_id": "gateway-1", "branch_id": "branch-1"})

    with staff_client.session_transaction() as signed:
        csrf = signed["staff_csrf"]
    headers = {"Origin": "http://localhost", "X-Staff-CSRF": csrf}

    # Fresh clean-air capture succeeds and derives R0 = 18.0 kOhm at 0.5V / 20k RL / 5V Vcc
    ok = staff_client.post("/api/dashboard/lpg/lpg-node-01/gas-baseline", json={"rl_kohm": 20.0, "vcc_v": 5.0}, headers=headers)
    assert ok.status_code == 200
    assert ok.json["status"] == "calibrated"
    assert ok.json["mq6_ro_kohm"] == 18.0
    assert ok.json["mq6_baseline_v"] == 0.5

    # Stale sample (>60s) rejected with 409 for clean-air capture
    state["age_s"] = 120
    stale = staff_client.post("/api/dashboard/lpg/lpg-node-01/gas-baseline", json={}, headers=headers)
    assert stale.status_code == 409

    # Rejects invalid low or inverted thresholds (< 10 ppm warning, <= warn critical)
    bad_low = staff_client.post(
        "/api/dashboard/lpg/lpg-node-01/gas-baseline",
        json={"gas_warn_ppm": 5.0, "gas_crit_ppm": 25.0, "save_settings_only": True},
        headers=headers,
    )
    assert bad_low.status_code == 422

    # Save alert limits (save_settings_only) succeeds without fresh clean-air sample when baseline already exists
    monkeypatch.setattr(dashboard, "_lpg_device_context", lambda conn, sid: ({
        "gateway_id": "gateway-1",
        "device": {"source_id": sid, "device_type": "lpg_edge_node"},
        "active_session": None,
        "config": {
            "mq6_vcc_v": 5.0,
            "mq6_rl_kohm": 20.0,
            "mq6_divider_ratio": 1.0,
            "mq6_ro_kohm": 8.638,
            "mq6_baseline_v": 0.94,
            "gas_warn_ppm": 400.0,
            "gas_crit_ppm": 1000.0,
            "stability_tolerance_kg": 0.25,
        },
    }, None))
    saved_limits = staff_client.post(
        "/api/dashboard/lpg/lpg-node-01/gas-baseline",
        json={"gas_warn_ppm": 20.0, "gas_crit_ppm": 80.0, "save_settings_only": True},
        headers=headers,
    )
    assert saved_limits.status_code == 200
    assert saved_limits.json["status"] == "updated"
    assert saved_limits.json["gas_warn_ppm"] == 20.0
    assert saved_limits.json["gas_crit_ppm"] == 80.0
    assert saved_limits.json["mq6_ro_kohm"] == 8.638

    # Explicit reset clears baseline cleanly
    cleared = staff_client.post("/api/dashboard/lpg/lpg-node-01/gas-baseline", json={"reset": True}, headers=headers)
    assert cleared.status_code == 200
    assert cleared.json["status"] == "cleared"
    assert cleared.json["mq6_ro_kohm"] is None


def test_live_notifications_suppresses_low_lpg_during_maintenance_but_keeps_gas_alerts():
    snapshot = {
        "checked_at": "2026-11-15T09:00:00Z",
        "devices": [
            {
                "source_id": "lpg-01",
                "label": "Tank A",
                "type": "lpg_edge_node",
                "maintenance_mode": True,
                "gas_interpretation": {"gas_condition": "critical", "estimated_ppm": 1350.0, "ppm_calibrated": True},
                "observation": {"freshness": "fresh", "sample_at": "2026-11-15T09:00:00Z", "values": {"lpg_percent": 0.0}},
            },
            {
                "source_id": "lpg-02",
                "label": "Tank B",
                "type": "lpg_edge_node",
                "maintenance_mode": False,
                "gas_interpretation": {"gas_condition": "normal", "estimated_ppm": 12.0, "ppm_calibrated": True},
                "observation": {"freshness": "fresh", "sample_at": "2026-11-15T09:00:00Z", "values": {"lpg_percent": 3.5}},
            },
        ],
    }
    events = dashboard._build_notification_events(snapshot, cycles=[])
    kinds_by_src = {(e["source_id"], e["kind"]) for e in events}
    assert ("lpg-01", "lpg_maintenance") in kinds_by_src
    assert ("lpg-01", "lpg_gas_critical") in kinds_by_src
    assert ("lpg-01", "lpg_critical") not in kinds_by_src
    assert ("lpg-01", "lpg_low") not in kinds_by_src
    assert ("lpg-02", "lpg_critical") in kinds_by_src


def test_overview_analytics_requires_auth_validates_period_and_fails_closed(staff_client, monkeypatch):
    anon = dashboard.app.test_client()
    assert anon.get("/api/dashboard/overview/analytics").status_code == 401
    assert staff_client.get("/api/dashboard/overview/analytics?period=year").status_code == 400

    def broken_db():
        raise RuntimeError("db down")

    monkeypatch.setattr(dashboard, "get_db_connection", broken_db)
    assert staff_client.get("/api/dashboard/overview/analytics?period=day").status_code == 503

    class FakeConn:
        def cursor(self):
            raise AssertionError("cursor should not open when inactive")

        def close(self):
            pass

    monkeypatch.setattr(dashboard, "get_db_connection", lambda: FakeConn())
    monkeypatch.setattr(dashboard.gateway_config, "get_stored_gateway_credentials", lambda: ("gw-1", "tok"))
    monkeypatch.setattr(dashboard.gateway_config, "load_gateway_db_state", lambda conn, gid: {"status": "unpaired"})
    assert staff_client.get("/api/dashboard/overview/analytics?period=day").status_code == 409


def test_overview_analytics_endpoint_handles_periods_and_cross_midnight_runtime(staff_client, monkeypatch):
    class FixedDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            base = cls(2026, 11, 15, 3, 30, tzinfo=timezone.utc)  # 11:30 MYT -> 12 hourly buckets (00:00..11:00)
            return base if tz is None else base.astimezone(tz)

    class FakeCursor:
        def __init__(self):
            self.rows = []

        def __enter__(self):
            return self

        def __exit__(self, *_):
            pass

        def execute(self, query, params=()):
            sql = " ".join(query.split())
            if "FROM device_registry" in sql:
                self.rows = [
                    {
                        "source_id": "washer-01",
                        "device_type": "washer",
                        "source_kind": "simulated",
                        "label": "Washer 1",
                        "state_payload": json.dumps({"programs": {"quick": {"name": "Quick"}, "p_abc123456789": {"name": "Delicate"}}}),
                    },
                    {"source_id": "dryer-01", "device_type": "dryer", "source_kind": "simulated", "label": "Dryer 1", "state_payload": "{}"},
                    {"source_id": "lpg-01", "device_type": "lpg_edge_node", "source_kind": "physical", "label": "Tank 1", "state_payload": "{}"},
                ]
            elif "FROM machine_cycles" in sql and "JOIN machine_cycles" not in sql:
                # 2026-11-15 10:15 MYT = 02:15 UTC; 2026-11-15 00:30 MYT = 2026-11-14 16:30 UTC (cross-midnight)
                self.rows = [
                    {
                        "cycle_id": "c1",
                        "source_id": "washer-01",
                        "program_id": "p_abc123456789",
                        "price_myr": "6.50",
                        "running_seconds": 3600,
                        "outcome": "completed",
                        "finished_at": FixedDateTime(2026, 11, 14, 16, 30),  # 00:30 MYT on Nov 15
                    },
                    {
                        "cycle_id": "c2",
                        "source_id": "dryer-01",
                        "program_id": "hot",
                        "price_myr": "5.00",
                        "running_seconds": 1800,
                        "outcome": "completed",
                        "finished_at": FixedDateTime(2026, 11, 15, 2, 15),  # 10:15 MYT on Nov 15
                    },
                ]
            elif "FROM machine_cycle_daily_runtime" in sql:
                # c1 ran 30 min on Nov 14 MYT and 30 min on Nov 15 MYT; for week view both dates count,
                # for day view only Nov 15 (1800s = 30.0m) belongs to today.
                from datetime import date
                self.rows = [
                    {"cycle_id": "c1", "local_date": date(2026, 11, 14), "running_seconds": 1800},
                    {"cycle_id": "c1", "local_date": date(2026, 11, 15), "running_seconds": 1800},
                ]
            elif "FROM sensor_telemetry" in sql:
                self.rows = [
                    {"source_id": "lpg-01", "recorded_at": FixedDateTime(2026, 11, 15, 2, 10), "voltage": 1.0},
                    {"source_id": "lpg-01", "recorded_at": FixedDateTime(2026, 11, 15, 2, 20), "voltage": 1.0},
                ]
            else:
                self.rows = []

        def fetchall(self):
            return list(self.rows)

    class FakeConn:
        def cursor(self):
            return FakeCursor()

        def close(self):
            pass

    monkeypatch.setattr(dashboard, "datetime", FixedDateTime)
    monkeypatch.setattr(dashboard, "get_db_connection", lambda: FakeConn())
    monkeypatch.setattr(dashboard.gateway_config, "get_stored_gateway_credentials", lambda: ("gw-1", "tok"))
    monkeypatch.setattr(dashboard.gateway_config, "load_gateway_db_state", lambda conn, gid: {"gateway_id": "gw-1", "status": "active", "branch_id": "br-1"})
    monkeypatch.setattr(dashboard, "_load_lpg_node_extras", lambda conn, gid: ({
        "lpg-01": {"mq6_vcc_v": 5.0, "mq6_rl_kohm": 20.0, "mq6_divider_ratio": 1.0, "mq6_ro_kohm": 10.0, "mq6_baseline_v": 0.5}
    }, {}))

    day_resp = staff_client.get("/api/dashboard/overview/analytics?period=day")
    assert day_resp.status_code == 200
    day = day_resp.json
    assert day["granularity"] == "hour"
    assert day["timezone"] == "Asia/Kuala_Lumpur"
    assert len(day["revenue_series"]) == 12
    assert day["revenue_series"][0]["label"] == "00:00"
    assert day["revenue_series"][0]["cumulative_revenue_myr"] == "6.50"
    assert day["revenue_series"][10]["label"] == "10:00"
    assert day["revenue_series"][10]["period_revenue_myr"] == "5.00"
    assert day["revenue_series"][-1]["cumulative_revenue_myr"] == "11.50"
    # c1 has 1800s on Nov 15 MYT; c2 has 1800s fallback -> 30.0m + 30.0m = 60.0m
    assert day["summary"]["completed_cycles"] == 2
    assert day["summary"]["running_minutes"] == 60.0
    assert day["summary"]["estimated_revenue_myr"] == "11.50"
    assert day["programs"] == [
        {"program_id": "p_abc123456789", "label": "Delicate"},
        {"program_id": "hot", "label": "Hot"},
    ]
    by_machine = {m["source_id"]: m for m in day["machines"]}
    assert by_machine["washer-01"]["cycles_by_program"] == {"p_abc123456789": 1}
    assert by_machine["dryer-01"]["cycles_by_program"] == {"hot": 1}
    assert day["gas_series"]["aggregation_mode"] == "single_node"
    assert day["gas_series"]["node_count"] == 1
    assert day["gas_series"]["series"][10]["avg_ppm"] is not None
    assert day["gas_series"]["series"][0]["avg_ppm"] is None
    assert day["complaints"] == {"implemented": False, "source": "deferred_customer_app", "total": None, "series": []}

    week_resp = staff_client.get("/api/dashboard/overview/analytics?period=week")
    assert week_resp.status_code == 200
    assert week_resp.json["granularity"] == "day"
    assert len(week_resp.json["revenue_series"]) == 7
    # Across the 7-day window both Nov 14 (30m) and Nov 15 (30m) allocations of c1 are included -> 60m + 30m = 90m
    assert week_resp.json["summary"]["running_minutes"] == 90.0

    month_resp = staff_client.get("/api/dashboard/overview/analytics?period=month")
    assert month_resp.status_code == 200
    assert month_resp.json["granularity"] == "day"
    assert len(month_resp.json["revenue_series"]) == 30


def test_overview_analytics_gas_multi_node_averaging_and_uncalibrated_gaps():
    now_utc = datetime(2026, 11, 15, 3, 10, tzinfo=timezone.utc)  # 11:10 MYT
    nodes = [
        {"source_id": "lpg-01", "device_type": "lpg_edge_node", "label": "Node 1"},
        {"source_id": "lpg-02", "device_type": "lpg_edge_node", "label": "Node 2"},
        {"source_id": "lpg-03", "device_type": "lpg_edge_node", "label": "Node 3"},
    ]
    # All calibrated identically so voltage -> ppm math is identical; test unequal sample weighting per bucket!
    cfg = {"mq6_vcc_v": 5.0, "mq6_rl_kohm": 20.0, "mq6_divider_ratio": 1.0, "mq6_ro_kohm": 10.0, "mq6_baseline_v": 0.5}

    from pi5 import lpg_interpreter
    ppm_low = lpg_interpreter.estimate_mq6_telemetry(0.6, cfg)["estimated_ppm"]
    ppm_high = lpg_interpreter.estimate_mq6_telemetry(2.0, cfg)["estimated_ppm"]

    # Node 1 has 9 samples at ppm_low in 10:00 MYT (02:00 UTC); Node 2 has 1 sample at ppm_high in 10:00 MYT.
    # Node 3 is calibrated but silent. Average in 10:00 MYT MUST be equal mean of node means ((ppm_low + ppm_high)/2),
    # NOT sample-count weighted toward Node 1.
    telemetry = [{"source_id": "lpg-01", "recorded_at": datetime(2026, 11, 15, 2, i), "voltage": 0.6} for i in range(1, 10)]
    telemetry.append({"source_id": "lpg-02", "recorded_at": datetime(2026, 11, 15, 2, 30), "voltage": 2.0})

    multi = dashboard._aggregate_overview_analytics(
        period="day",
        machines=[],
        lpg_nodes=nodes[:2],
        lpg_configs={"lpg-01": cfg, "lpg-02": cfg},
        cycle_rows=[],
        daily_runtime_rows=[],
        telemetry_rows=telemetry,
        now_utc=now_utc,
    )
    assert multi["gas_series"]["aggregation_mode"] == "multi_node_average"
    assert multi["gas_series"]["node_count"] == 2
    bucket_10 = multi["gas_series"]["series"][10]
    assert bucket_10["contributing_nodes"] == 2
    assert bucket_10["avg_ppm"] == pytest.approx(round((ppm_low + ppm_high) / 2.0, 1), abs=0.2)
    assert multi["gas_series"]["series"][9]["avg_ppm"] is None  # empty bucket stays null

    uncal = dashboard._aggregate_overview_analytics(
        period="day",
        machines=[],
        lpg_nodes=[nodes[0]],
        lpg_configs={"lpg-01": {"mq6_vcc_v": 5.0}},
        cycle_rows=[],
        daily_runtime_rows=[],
        telemetry_rows=telemetry,
        now_utc=now_utc,
    )
    assert uncal["gas_series"]["aggregation_mode"] == "uncalibrated"
    assert uncal["gas_series"]["node_count"] == 0
    assert uncal["summary"]["avg_gas_ppm"] is None
    assert all(pt["avg_ppm"] is None for pt in uncal["gas_series"]["series"])


def test_telemetry_history_query_validation_and_cutoffs():
    now_utc = datetime(2026, 11, 15, 3, 10, tzinfo=timezone.utc)  # 11:10 MYT
    cat, per, dlv, since, pg = dashboard._telemetry_history_query("lpg", "all", "all", "1", now_utc)
    assert (cat, per, dlv, since, pg) == ("lpg", "all", "all", None, 1)

    _, _, _, today_since, pg2 = dashboard._telemetry_history_query("machine", "today", "pending", "3", now_utc)
    # 00:00 MYT (UTC+8) = 16:00 UTC the previous day
    assert today_since == datetime(2026, 11, 14, 16, 0, 0)
    assert pg2 == 3

    _, _, _, week_since, _ = dashboard._telemetry_history_query("lpg", "week", "quarantined", "1", now_utc)
    assert week_since == datetime(2026, 11, 8, 3, 10, 0)

    _, _, _, month_since, _ = dashboard._telemetry_history_query("lpg", "month", "all", "1", now_utc)
    assert month_since == datetime(2026, 10, 16, 3, 10, 0)

    for args in [
        ("other", "all", "all", "1"),
        ("lpg", "year", "all", "1"),
        ("lpg", "all", "synced", "1"),
        ("lpg", "all", "all", "0"),
        ("lpg", "all", "all", "-2"),
        ("lpg", "all", "all", "abc"),
    ]:
        with pytest.raises(ValueError):
            dashboard._telemetry_history_query(*args, now_utc)


def test_dashboard_history_requires_staff_and_validates_filters(staff_client):
    assert dashboard.app.test_client().get("/api/dashboard/history").status_code == 401
    for qs in [
        "category=unknown",
        "period=year",
        "delivery=synced",
        "page=0",
        "page=abc",
    ]:
        resp = staff_client.get(f"/api/dashboard/history?{qs}")
        assert resp.status_code == 400


def test_dashboard_history_inactive_gateway_returns_empty_paged_response(monkeypatch, staff_client):
    class FakeConn:
        def close(self):
            pass

    monkeypatch.setattr(dashboard, "get_db_connection", lambda: FakeConn())
    monkeypatch.setattr(dashboard.gateway_config, "get_stored_gateway_credentials", lambda: ("gw-1", "tok"))
    monkeypatch.setattr(dashboard.gateway_config, "load_gateway_db_state", lambda conn, gw_id: {"gateway_id": "gw-1", "status": "unpaired"})

    resp = staff_client.get("/api/dashboard/history?category=machine&period=week&delivery=pending&page=2")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body == {
        "category": "machine",
        "period": "week",
        "delivery": "pending",
        "page": 1,
        "page_size": 10,
        "total": 0,
        "total_pages": 1,
        "records": [],
    }


def test_dashboard_history_filters_by_category_period_delivery_and_paginates(monkeypatch, staff_client):
    devices = [
        {"source_id": "lpg-node-01", "device_type": "lpg_edge_node"},
        {"source_id": "washer-sim-01", "device_type": "washer"},
    ]
    rows = []
    # 12 LPG rows (newest 12 ids -> ids 24..13), mix of pending/synced/quarantined & ages
    for idx in range(1, 13):
        rows.append({
            "id": 100 + idx,
            "gateway_id": "gw-1",
            "record_id": f"rec-lpg-{idx}",
            "source_id": "lpg-node-01",
            "recorded_at": datetime(2026, 11, 15, 2, idx) if idx > 2 else datetime(2026, 10, 1, 0, idx),
            "gateway_receipt_at": datetime(2026, 11, 15, 2, idx),
            "source_time_quality": "rtc_synced",
            "source_kind": "physical",
            "quality_metadata": None,
            "data_payload": '{"voltage": 0.45}',
            "is_synced": 0 if idx % 3 == 0 else (-1 if idx == 2 else 1),
            "quarantine_reason": "legacy" if idx == 2 else None,
        })
    # 5 Machine rows + 1 legacy NULL source_id quarantined row
    for idx in range(1, 6):
        rows.append({
            "id": 200 + idx,
            "gateway_id": "gw-1",
            "record_id": f"rec-mch-{idx}",
            "source_id": "washer-sim-01",
            "recorded_at": datetime(2026, 11, 15, 2, 20 + idx),
            "gateway_receipt_at": datetime(2026, 11, 15, 2, 20 + idx),
            "source_time_quality": "rtc_synced",
            "source_kind": "simulated",
            "quality_metadata": None,
            "data_payload": '{"state": "RUNNING"}',
            "is_synced": 1 if idx != 5 else 0,
            "quarantine_reason": None,
        })
    rows.append({
        "id": 299,
        "gateway_id": "gw-1",
        "record_id": "rec-null",
        "source_id": None,
        "recorded_at": datetime(2026, 11, 15, 2, 50),
        "gateway_receipt_at": datetime(2026, 11, 15, 2, 50),
        "source_time_quality": "unknown",
        "source_kind": "physical",
        "quality_metadata": None,
        "data_payload": "{}",
        "is_synced": -1,
        "quarantine_reason": "missing_source",
    })

    recorded_queries = []

    def _filter_rows(sql, params):
        matched = [r for r in rows if r["gateway_id"] == params[0]]
        idx = 1
        if "source_id IN (" in sql:
            n_ids = sql.split("source_id IN (", 1)[1].split(")", 1)[0].count("%s")
            allowed = set(params[idx:idx + n_ids])
            idx += n_ids
            matched = [r for r in matched if r["source_id"] in allowed]
        elif "source_kind=%s" in sql:
            sk = params[idx]
            idx += 1
            matched = [r for r in matched if r["source_id"] is not None and r["source_kind"] == sk]
        if "quarantine_reason IS NULL AND is_synced=0" in sql:
            matched = [r for r in matched if r["quarantine_reason"] is None and r["is_synced"] == 0]
        elif "(quarantine_reason IS NOT NULL OR is_synced=-1)" in sql:
            matched = [r for r in matched if r["quarantine_reason"] is not None or r["is_synced"] == -1]
        if "recorded_at>=%s" in sql:
            since = params[idx]
            idx += 1
            matched = [r for r in matched if r["recorded_at"] >= since]
        return sorted(matched, key=lambda r: r["id"], reverse=True), idx

    class FakeCursor:
        def __init__(self):
            self._rows = []

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def execute(self, sql, params=()):
            recorded_queries.append((sql, params))
            if "FROM device_registry" in sql:
                self._rows = list(devices)
            elif "SELECT COUNT(*) AS total FROM sensor_telemetry" in sql:
                matched, _ = _filter_rows(sql, params)
                self._rows = [{"total": len(matched)}]
            elif "FROM sensor_telemetry" in sql:
                matched, next_idx = _filter_rows(sql, params)
                limit, offset = params[next_idx], params[next_idx + 1]
                self._rows = matched[offset:offset + limit]
            else:
                self._rows = []

        def fetchall(self):
            return list(self._rows)

        def fetchone(self):
            return self._rows[0] if self._rows else None

    class FakeConn:
        def cursor(self):
            return FakeCursor()

        def close(self):
            pass

    monkeypatch.setattr(dashboard, "get_db_connection", lambda: FakeConn())
    monkeypatch.setattr(dashboard.gateway_config, "get_stored_gateway_credentials", lambda: ("gw-1", "tok"))
    monkeypatch.setattr(dashboard.gateway_config, "load_gateway_db_state", lambda conn, gw_id: {"gateway_id": "gw-1", "status": "active"})

    # 1. Default query -> category=lpg, period=all, delivery=all, page=1, 10 items of 12 (excludes NULL source_id & machine rows)
    r1 = staff_client.get("/api/dashboard/history")
    assert r1.status_code == 200
    b1 = r1.get_json()
    assert (b1["category"], b1["period"], b1["delivery"], b1["page"], b1["page_size"], b1["total"], b1["total_pages"]) == (
        "lpg", "all", "all", 1, 10, 12, 2
    )
    assert len(b1["records"]) == 10
    assert all(rec["source_id"] == "lpg-node-01" for rec in b1["records"])
    assert b1["records"][0]["record_id"] == "rec-lpg-12"

    # 2. Clamping out-of-range page=9 -> page=2 returning remaining 2 LPG records
    r2 = staff_client.get("/api/dashboard/history?category=lpg&period=all&delivery=all&page=9")
    assert r2.status_code == 200
    b2 = r2.get_json()
    assert b2["page"] == 2
    assert b2["total_pages"] == 2
    assert [rec["record_id"] for rec in b2["records"]] == ["rec-lpg-2", "rec-lpg-1"]

    # 3. Machine category + pending delivery filter executed in SQL
    r3 = staff_client.get("/api/dashboard/history?category=machine&delivery=pending&page=1")
    assert r3.status_code == 200
    b3 = r3.get_json()
    assert b3["total"] == 1
    assert [rec["record_id"] for rec in b3["records"]] == ["rec-mch-5"]
    assert all(rec["sync_state"] == "pending" for rec in b3["records"])

    # 4. Fallback classification when device_registry has no registered devices for gateway
    devices.clear()
    r4 = staff_client.get("/api/dashboard/history?category=machine&period=all")
    assert r4.status_code == 200
    b4 = r4.get_json()
    assert b4["total"] == 5
    assert all(rec["source_id"] == "washer-sim-01" for rec in b4["records"])
    assert any("source_kind=%s" in q[0] and "source_id IS NOT NULL" in q[0] for q in recorded_queries)

