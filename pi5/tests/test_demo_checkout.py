"""Focused demo checkout and simulator behavior checks without touching the Pi."""
import uuid
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from pi5 import demo_checkout
from pi5 import demo_terminal_bridge
from pi5.simulator_core import Machine, program_hash
from pi5.dashboard import dashboard
from werkzeug.security import generate_password_hash


def test_checkout_token_and_program_hash_are_stable():
    assert demo_checkout.token_hash("same") == demo_checkout.token_hash("same")
    assert demo_checkout.token_hash("same") != demo_checkout.token_hash("other")
    assert program_hash({"price_myr": "4.00", "program_id": "quick"}) == demo_checkout.settings_hash(
        {"program_id": "quick", "price_myr": "4.00"})


def test_demo_start_selects_saved_program_once_and_rejects_stale_price(tmp_path):
    machine = Machine(str(tmp_path / "machine.sqlite"), "washer-sim-01", "washer")
    quick = machine.state["programs"]["quick"]
    command = {"command_id": str(uuid.uuid4()), "source_id": "washer-sim-01", "action": "start",
               "arguments": {"program_id": "quick", "settings_hash": program_hash(quick)},
               "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=30)).isoformat()}
    result = machine.execute(command)
    assert result["status"] == "applied"
    assert machine.state["active_cycle"]["program_id"] == "quick"
    assert machine.state["active_cycle"]["price_myr"] == "4.00"
    assert machine.execute(command) == result
    assert machine.state["active_cycle"]["program_id"] == "quick"
    machine.execute({**command, "command_id": str(uuid.uuid4()), "action": "stop", "arguments": {}})
    machine.state["programs"]["quick"]["price_myr"] = "5.00"
    machine.save()
    rejected = machine.execute({**command, "command_id": str(uuid.uuid4())})
    assert rejected["status"] == "rejected"
    assert rejected["reason"] == "program_changed"


def test_confirm_reuses_existing_command_without_second_insert():
    token = "A" * 43
    command_id = str(uuid.uuid4())
    class Cursor:
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def execute(self, sql, params):
            assert "FOR UPDATE" in sql
            assert params == (demo_checkout.token_hash(token),)
        def fetchone(self):
            return {"gateway_id": "g1", "command_id": command_id}
    class Connection:
        def cursor(self): return Cursor()
        def commit(self): self.committed = True
        def rollback(self): raise AssertionError("Existing confirmation should not roll back")
    conn = Connection()
    assert demo_checkout.confirm(conn, token, "g1") == command_id
    assert conn.committed


def test_cancel_expires_only_an_unconfirmed_scoped_checkout():
    request_id = str(uuid.uuid4())
    class Cursor:
        def __init__(self): self.statements = []
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def execute(self, sql, params): self.statements.append((sql, params))
        def fetchone(self):
            return {"checkout_id": "c1", "expires_at": datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=3),
                    "confirmed_at": None, "command_id": None}
    class Connection:
        def __init__(self): self.c = Cursor(); self.commits = 0
        def cursor(self): return self.c
        def commit(self): self.commits += 1
        def rollback(self): raise AssertionError("Cancellation should not roll back")
    conn = Connection()
    assert demo_checkout.cancel_request(conn, "gateway-1", "washer-sim-01", request_id) == "cancelled"
    assert conn.c.statements[0][1] == ("gateway-1", "washer-sim-01", request_id)
    assert "FOR UPDATE" in conn.c.statements[0][0]
    assert "SET expires_at=UTC_TIMESTAMP(6)" in conn.c.statements[1][0]
    assert conn.commits == 1


def test_cancel_cannot_expire_a_confirmed_checkout():
    class Cursor:
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def execute(self, sql, params): assert "FOR UPDATE" in sql
        def fetchone(self): return {"confirmed_at": datetime.now(timezone.utc), "command_id": "cmd"}
    class Connection:
        def __init__(self): self.commits = 0
        def cursor(self): return Cursor()
        def commit(self): self.commits += 1
        def rollback(self): raise AssertionError("Confirmed checkout should not roll back")
    conn = Connection()
    assert demo_checkout.cancel_request(conn, "gateway-1", "washer-sim-01", str(uuid.uuid4())) == "confirmed"
    assert conn.commits == 1


def test_terminal_cancel_message_needs_no_program_id(monkeypatch):
    request_id = str(uuid.uuid4())
    branch_id = "branch-1"
    class Connection:
        def close(self): self.closed = True
    conn = Connection()
    published = []
    client = SimpleNamespace(publish=lambda topic, payload, qos: published.append((topic, json.loads(payload), qos)))
    monkeypatch.setattr(demo_terminal_bridge, "db", lambda: conn)
    monkeypatch.setattr(demo_terminal_bridge, "binding", lambda _conn: {"gateway_id": "gateway-1", "branch_id": branch_id})
    monkeypatch.setattr(demo_terminal_bridge.demo_checkout, "cancel_request",
                        lambda _conn, gateway, source, rid: "cancelled" if
                        (gateway, source, rid) == ("gateway-1", "washer-sim-01", request_id) else "missing")
    topic = f"branches/{branch_id}/devices/washer-sim-01/select"
    message = SimpleNamespace(topic=topic, payload=json.dumps({"action": "cancel", "request_id": request_id}))
    demo_terminal_bridge.handle_selection(client, message, "test-secret")
    assert published == [(f"branches/{branch_id}/devices/washer-sim-01/checkout",
                          {"request_id": request_id, "status": "cancelled"}, 1)]
    assert conn.closed


def test_checkout_creation_requires_staff_and_csrf(monkeypatch):
    monkeypatch.setitem(dashboard.app.config, "SECRET_KEY", "test-only-session-key")
    monkeypatch.setattr(dashboard, "STAFF_USERNAME", "staff")
    monkeypatch.setattr(dashboard, "STAFF_PASSWORD_HASH", generate_password_hash("test-only-password"))
    monkeypatch.setattr(dashboard, "LOCAL_CONTROLS_ENABLED", True)
    client = dashboard.app.test_client()
    assert client.get("/demo/new").status_code == 302
    client.get("/login")
    with client.session_transaction() as state:
        csrf = state["staff_csrf"]
    client.post("/login", data={"username": "staff", "password": "test-only-password",
                                "csrf_token": csrf}, headers={"Origin": "http://localhost"})
    assert client.get("/demo/new").status_code == 200
    assert client.post("/demo/new", data={"program_id": "quick"}).status_code == 403
    assert client.post("/demo/checkout/" + "A" * 43, data={}).status_code == 403
