import json
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sync_worker


class _FakeCursor:
    def __init__(self, state: dict):
        self.state = state
        self._result = []
        self._idx = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, sql: str, params=()):
        q = " ".join(sql.split())
        self._result = []
        self._idx = 0

        if q.startswith("SELECT source_id, capacity_kg FROM device_registry"):
            gw_id, src = params
            dev = self.state["devices"].get((gw_id, src))
            if dev and dev.get("device_type") == "lpg_edge_node" and dev.get("status") in ("active", "maintenance"):
                self._result = [dict(dev)]
            return

        if q.startswith("SELECT mq6_vcc_v, mq6_rl_kohm") and "FROM lpg_node_config" in q:
            gw_id, src = params
            cfg = self.state["configs"].get((gw_id, src))
            self._result = [dict(cfg)] if cfg else []
            return

        if q.startswith("SELECT source_id, mq6_vcc_v") and "FROM lpg_node_config" in q:
            gw_id = params[0]
            rows = [dict(v, source_id=k[1]) for k, v in sorted(self.state["configs"].items()) if k[0] == gw_id]
            self._result = rows
            return

        if "FROM lpg_maintenance_sessions" in q and "status='active'" in q:
            if len(params) == 2:
                gw_id, src = params
                rows = [
                    dict(s)
                    for s in self.state["sessions"]
                    if s["gateway_id"] == gw_id and s["source_id"] == src and s["status"] == "active"
                ]
            else:
                gw_id = params[0]
                rows = [
                    dict(s)
                    for s in self.state["sessions"]
                    if s["gateway_id"] == gw_id and s["status"] == "active"
                ]
            rows.sort(key=lambda r: r["started_at"], reverse=True)
            self._result = rows[:1] if "LIMIT 1" in q else rows
            return

        if "FROM lpg_maintenance_sessions" in q and "status != 'active'" in q:
            gw_id = params[0]
            rows = [
                dict(s)
                for s in self.state["sessions"]
                if s["gateway_id"] == gw_id and s["status"] != "active"
            ]
            rows.sort(key=lambda r: r["started_at"], reverse=True)
            self._result = rows[:20]
            return

        if "FROM sensor_telemetry" in q:
            gw_id, src, limit = params
            rows = [
                dict(t)
                for t in self.state["telemetry"]
                if t["gateway_id"] == gw_id and t["source_id"] == src and t.get("quarantine_reason") is None
            ]
            rows.sort(key=lambda r: (r["gateway_receipt_at"], r["record_id"]), reverse=True)
            self._result = rows[: int(limit)]
            return

        if q.startswith("INSERT INTO lpg_maintenance_sessions"):
            sid, gw_id, src, started_by, note, started_at = params
            self.state["sessions"].append({
                "session_id": sid,
                "gateway_id": gw_id,
                "source_id": src,
                "status": "active",
                "started_by": started_by,
                "service_note": note,
                "started_at": started_at,
                "completed_at": None,
                "completed_by": None,
                "new_tare_kg": None,
                "new_capacity_kg": None,
                "verified_samples_json": None,
            })
            return

        if q.startswith("UPDATE lpg_maintenance_sessions SET status='completed'"):
            completed_at, completed_by, tare_kg, cap_kg, samples_json, sid = params
            for row in self.state["sessions"]:
                if row["session_id"] == sid and row["status"] == "active":
                    row["status"] = "completed"
                    row["completed_at"] = completed_at
                    row["completed_by"] = completed_by
                    row["new_tare_kg"] = tare_kg
                    row["new_capacity_kg"] = cap_kg
                    row["verified_samples_json"] = samples_json
            return

        if q.startswith("INSERT INTO lpg_node_config"):
            (
                gw_id, src, vcc_v, rl_kohm, divider, ro_kohm, baseline_v,
                warn_ppm, crit_ppm, tare_kg, cap_kg, tol_kg, updated_by,
            ) = params
            self.state["configs"][(gw_id, src)] = {
                "gateway_id": gw_id,
                "source_id": src,
                "mq6_vcc_v": vcc_v,
                "mq6_rl_kohm": rl_kohm,
                "mq6_divider_ratio": divider,
                "mq6_ro_kohm": ro_kohm,
                "mq6_baseline_v": baseline_v,
                "gas_warn_ppm": warn_ppm,
                "gas_crit_ppm": crit_ppm,
                "cylinder_tare_kg": tare_kg,
                "rated_capacity_kg": cap_kg,
                "stability_tolerance_kg": tol_kg,
                "updated_by": updated_by,
            }
            return

        if q.startswith("UPDATE device_registry SET capacity_kg=%s"):
            cap_kg, gw_id, src = params
            dev = self.state["devices"].get((gw_id, src))
            if dev:
                dev["capacity_kg"] = cap_kg
            return

        raise AssertionError(f"Unhandled SQL in fake cursor: {q}")

    def fetchone(self):
        return self._result[0] if self._result else None

    def fetchall(self):
        return list(self._result)


class _FakeConn:
    def __init__(self, state: dict):
        self.state = state
        self.open = True
        self.committed = 0
        self.rolled_back = 0

    def cursor(self):
        return _FakeCursor(self.state)

    def commit(self):
        self.committed += 1

    def rollback(self):
        self.rolled_back += 1

    def ping(self, reconnect=True):
        return None


def _make_worker(monkeypatch):
    state = {
        "devices": {
            ("gw-1", "lpg-main"): {
                "source_id": "lpg-main",
                "device_type": "lpg_edge_node",
                "status": "active",
                "capacity_kg": 14.0,
            }
        },
        "configs": {},
        "sessions": [],
        "telemetry": [],
    }
    conn = _FakeConn(state)
    worker = sync_worker.EdgeSyncWorker()
    worker.gateway_id = "gw-1"
    worker.credential = "secret-token"
    worker.status = "active"
    worker.connection = conn
    worker.state_connection = conn
    monkeypatch.setattr(worker, "get_db_connection", lambda: conn)
    monkeypatch.setattr(worker, "get_state_db_connection", lambda: conn)
    monkeypatch.setattr(sync_worker, "CLOUD_BASE_URL", "https://api.example.test")
    return worker, state, conn


def test_start_and_complete_tank_swap_checks_stability(monkeypatch):
    worker, state, conn = _make_worker(monkeypatch)
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    status, reason, payload = worker._execute_lpg_command({
        "command_id": str(uuid.uuid4()),
        "source_id": "lpg-main",
        "action": "start_tank_swap",
        "arguments": {"started_by": "Aiman", "service_note": "Swapping 14kg bottle"},
    })
    assert status == "succeeded"
    assert reason is None
    assert payload["started_by"] == "Aiman"
    assert len(state["sessions"]) == 1
    assert state["sessions"][0]["status"] == "active"

    # Unstable/insufficient samples keep maintenance mode active and fail command.
    state["telemetry"] = [
        {
            "gateway_id": "gw-1",
            "source_id": "lpg-main",
            "record_id": "r1",
            "recorded_at": now - timedelta(seconds=2),
            "gateway_receipt_at": now - timedelta(seconds=2),
            "source_time_quality": "device_reported",
            "quality_metadata": json.dumps({"weight_valid": True}),
            "data_payload": json.dumps({"gross_weight_kg": 29.0, "voltage": 1.1}),
        }
    ]
    status, reason, payload = worker._execute_lpg_command({
        "command_id": str(uuid.uuid4()),
        "source_id": "lpg-main",
        "action": "complete_tank_swap",
        "arguments": {"completed_by": "Aiman", "tare_kg": 15.2, "rated_capacity_kg": 14.0},
    })
    assert status == "failed"
    assert "Need 3" in reason
    assert state["sessions"][0]["status"] == "active"

    # Three consecutive recent readings within tolerance complete swap cleanly.
    state["telemetry"] = [
        {
            "gateway_id": "gw-1",
            "source_id": "lpg-main",
            "record_id": f"r{i}",
            "recorded_at": now - timedelta(seconds=i * 2),
            "gateway_receipt_at": now - timedelta(seconds=i * 2),
            "source_time_quality": "device_reported",
            "quality_metadata": json.dumps({"weight_valid": True}),
            "data_payload": json.dumps({"gross_weight_kg": 29.2 + i * 0.02, "voltage": 1.1}),
        }
        for i in range(1, 4)
    ]
    status, reason, payload = worker._execute_lpg_command({
        "command_id": str(uuid.uuid4()),
        "source_id": "lpg-main",
        "action": "complete_tank_swap",
        "arguments": {"completed_by": "Aiman", "tare_kg": 15.2, "rated_capacity_kg": 16.0},
    })
    assert status == "succeeded"
    assert reason is None
    assert payload["tare_kg"] == 15.2
    assert payload["rated_capacity_kg"] == 16.0
    assert len(payload["verified_samples"]) == 3
    assert state["sessions"][0]["status"] == "completed"
    assert state["configs"][("gw-1", "lpg-main")]["cylinder_tare_kg"] == 15.2
    assert state["devices"][("gw-1", "lpg-main")]["capacity_kg"] == 16.0
    assert conn.committed >= 2


def test_calibrate_save_settings_and_reset_gas_baseline(monkeypatch):
    worker, state, _ = _make_worker(monkeypatch)
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Stale reading (> 60s) must fail calibration cleanly.
    state["telemetry"] = [
        {
            "gateway_id": "gw-1",
            "source_id": "lpg-main",
            "record_id": "stale-1",
            "recorded_at": now - timedelta(seconds=120),
            "gateway_receipt_at": now - timedelta(seconds=120),
            "source_time_quality": "device_reported",
            "quality_metadata": json.dumps({"weight_valid": True}),
            "data_payload": json.dumps({"gross_weight_kg": 25.0, "voltage": 0.9}),
        }
    ]
    status, reason, _ = worker._execute_lpg_command({
        "command_id": str(uuid.uuid4()),
        "source_id": "lpg-main",
        "action": "calibrate_gas_baseline",
        "arguments": {"reset": False, "save_settings_only": False, "updated_by": "Farah"},
    })
    assert status == "failed"
    assert "Fresh valid MQ-6" in reason

    # Fresh voltage calibrates baseline & Ro.
    state["telemetry"][0]["recorded_at"] = now - timedelta(seconds=5)
    state["telemetry"][0]["gateway_receipt_at"] = now - timedelta(seconds=5)
    status, reason, payload = worker._execute_lpg_command({
        "command_id": str(uuid.uuid4()),
        "source_id": "lpg-main",
        "action": "calibrate_gas_baseline",
        "arguments": {
            "reset": False,
            "save_settings_only": False,
            "updated_by": "Farah",
            "gas_warn_ppm": 25.0,
            "gas_crit_ppm": 95.0,
        },
    })
    assert status == "succeeded"
    assert reason is None
    assert payload["mq6_baseline_v"] == 0.9
    assert payload["mq6_ro_kohm"] > 0
    assert state["configs"][("gw-1", "lpg-main")]["gas_warn_ppm"] == 25.0

    # Save settings recomputes Ro when divider/RL changes while preserving baseline_v.
    old_ro = payload["mq6_ro_kohm"]
    status, _, payload2 = worker._execute_lpg_command({
        "command_id": str(uuid.uuid4()),
        "source_id": "lpg-main",
        "action": "calibrate_gas_baseline",
        "arguments": {
            "reset": False,
            "save_settings_only": True,
            "rl_kohm": 10.0,
            "gas_warn_ppm": 30.0,
            "gas_crit_ppm": 100.0,
            "updated_by": "Farah",
        },
    })
    assert status == "succeeded"
    assert payload2["mq6_baseline_v"] == 0.9
    assert payload2["mq6_ro_kohm"] != old_ro

    # Reset clears baseline_v and mq6_ro_kohm.
    status, _, payload3 = worker._execute_lpg_command({
        "command_id": str(uuid.uuid4()),
        "source_id": "lpg-main",
        "action": "calibrate_gas_baseline",
        "arguments": {"reset": True, "save_settings_only": False, "updated_by": "Farah"},
    })
    assert status == "succeeded"
    assert payload3["mq6_ro_kohm"] is None
    assert payload3["mq6_baseline_v"] is None


def test_sync_lpg_operations_polls_commands_and_uploads_digest_once(monkeypatch):
    worker, state, _ = _make_worker(monkeypatch)
    cmd_id = str(uuid.uuid4())
    expires = (datetime.now(timezone.utc) + timedelta(seconds=45)).isoformat()

    posted_urls = []
    get_res = MagicMock(status_code=200)
    get_res.json.return_value = {
        "commands": [
            {
                "command_id": cmd_id,
                "source_id": "lpg-main",
                "action": "start_tank_swap",
                "arguments": {"started_by": "Nadia"},
                "expires_at": expires,
            }
        ]
    }
    get_res.raise_for_status = MagicMock()

    def fake_post(url, headers=None, json=None, timeout=None):
        posted_urls.append((url, json))
        return MagicMock(status_code=200)

    worker.session = MagicMock()
    worker.session.get.return_value = get_res
    worker.session.post.side_effect = fake_post

    worker.sync_lpg_operations()

    state_posts = [p for p in posted_urls if p[0].endswith("/edge/lpg-state")]
    result_posts = [p for p in posted_urls if p[0].endswith("/edge/lpg-command-results")]
    assert len(result_posts) == 1
    assert result_posts[0][1]["command_id"] == cmd_id
    assert result_posts[0][1]["status"] == "succeeded"
    assert len(state_posts) == 2
    assert "lpg-main" in state_posts[-1][1]["active_source_ids"]

    # Second cycle with empty command list and unchanged state must not re-POST lpg-state.
    posted_urls.clear()
    get_res.json.return_value = {"commands": []}
    worker.sync_lpg_operations()
    assert [p for p in posted_urls if p[0].endswith("/edge/lpg-state")] == []
