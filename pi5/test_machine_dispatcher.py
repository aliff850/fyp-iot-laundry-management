"""Focused command boundary checks; live MariaDB/MQTT requires Pi validation."""
import json
from types import SimpleNamespace

from pi5 import machine_dispatcher as dispatcher


def test_result_requires_matching_topic_and_source(monkeypatch):
    calls = []
    class Cursor:
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def execute(self, sql, args): calls.append((sql, args))
        def fetchone(self): return {"status": "succeeded"}
    class Connection:
        def cursor(self): return Cursor()
        def commit(self): calls.append(("commit", None))
        def close(self): pass
    monkeypatch.setattr(dispatcher, "db", Connection)
    monkeypatch.setattr(dispatcher, "active_binding", lambda _conn: {"gateway_id": "gate-1", "branch_id": "branch-1"})
    base = {"command_id": "57f91333-cdad-4b9f-8618-85577fbded57", "source_id": "washer-1", "status": "applied"}
    dispatcher.handle_result(SimpleNamespace(topic="branches/branch-1/devices/washer-2/command-results", payload=json.dumps(base).encode()))
    dispatcher.handle_result(SimpleNamespace(topic="branches/foreign/devices/washer-1/command-results", payload=json.dumps(base).encode()))
    assert calls == []
    dispatcher.handle_result(SimpleNamespace(topic="branches/branch-1/devices/washer-1/command-results", payload=json.dumps(base).encode()))
    assert len(calls) == 3
    assert calls[0][1] == ("succeeded", "", base["command_id"], "gate-1", "washer-1")
    assert calls[1][0].startswith("SELECT status")
    assert calls[2][0] == "commit"


def test_publishing_only_marks_command_as_published(monkeypatch):
    calls = []
    class Cursor:
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def execute(self, sql, args): calls.append(sql)
        def fetchall(self):
            from datetime import datetime, timezone
            return [{"command_id": "57f91333-cdad-4b9f-8618-85577fbded57", "source_id": "washer-1",
                "action": "start", "arguments_json": "{}", "expires_at": datetime.now(timezone.utc).replace(tzinfo=None)}]
    class Connection:
        def cursor(self): return Cursor()
        def commit(self): calls.append("commit")
        def close(self): pass
    class Client:
        def publish(self, topic, payload, qos): calls.append((topic, json.loads(payload), qos))
    monkeypatch.setattr(dispatcher, "db", Connection)
    monkeypatch.setattr(dispatcher, "active_binding", lambda _conn: {"gateway_id": "gate-1", "branch_id": "branch-1"})
    dispatcher.dispatch(Client())
    assert any("status='published'" in sql for sql in calls if isinstance(sql, str))
    assert not any("status='succeeded'" in sql for sql in calls if isinstance(sql, str))
    assert any(isinstance(call, tuple) and call[0].endswith("/washer-1/commands") for call in calls)
