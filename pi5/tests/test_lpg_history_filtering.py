"""Tests for LPG presence separation, 15m checkpoint deadband filtering, and history compaction."""

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import lpg_interpreter
from ingestion_worker import EdgeIngestionWorker
from scripts.compact_lpg_telemetry import plan_compaction_deletes
from sync_worker import EdgeSyncWorker


def _lpg_payload(
    *,
    gross: float = 20.0,
    pct: float = 42.0,
    voltage: float = 0.45,
    ppm: float = 12.0,
    temp: float = 29.0,
    hum: float = 65.0,
):
    return {
        "gross_weight_kg": gross,
        "lpg_weight_kg": round(gross - 15.2, 2),
        "lpg_percent": pct,
        "voltage": voltage,
        "estimated_ppm": ppm,
        "temperature": temp,
        "humidity": hum,
    }


def _lpg_quality(*, gas_condition: str = "normal", mode: str = "online", maint: bool = False, kind: str | None = None):
    q = {
        "operating_mode": mode,
        "maintenance_mode": maint,
        "gas_condition": gas_condition,
        "ppm_calibrated": True,
        "weight_valid": True,
        "temperature_valid": True,
        "humidity_valid": True,
    }
    if kind is not None:
        q["maintenance_session_kind"] = kind
    return q


def test_should_persist_lpg_history_suppresses_flat_noise_and_keeps_changes():
    base_time = datetime(2026, 11, 25, 1, 0, 0, tzinfo=timezone.utc)
    base_payload = _lpg_payload()
    base_quality = _lpg_quality()

    # Initial sample always saves
    keep0, reason0 = lpg_interpreter.should_persist_lpg_history(base_payload, base_quality, base_time)
    assert (keep0, reason0) == (True, "initial")

    # Small sensor jitter 5s later is suppressed
    jitter = _lpg_payload(gross=20.03, pct=42.2, voltage=0.47, ppm=12.8, temp=29.3, hum=66.5)
    keep1, reason1 = lpg_interpreter.should_persist_lpg_history(
        jitter,
        base_quality,
        base_time + timedelta(seconds=5),
        boot_id="boot-1",
        last_saved_at=base_time,
        last_saved_boot_id="boot-1",
        last_saved_payload=base_payload,
        last_saved_quality=base_quality,
    )
    assert (keep1, reason1) == (False, "deadband_suppressed")

    # 15 minutes (900s) silence triggers checkpoint
    keep2, reason2 = lpg_interpreter.should_persist_lpg_history(
        jitter,
        base_quality,
        base_time + timedelta(seconds=900),
        boot_id="boot-1",
        last_saved_at=base_time,
        last_saved_boot_id="boot-1",
        last_saved_payload=base_payload,
        last_saved_quality=base_quality,
    )
    assert (keep2, reason2) == (True, "checkpoint")

    # Gas warning triggers immediate high-resolution save
    spike = _lpg_payload(voltage=1.45, ppm=65.0)
    keep3, reason3 = lpg_interpreter.should_persist_lpg_history(
        spike,
        _lpg_quality(gas_condition="warning"),
        base_time + timedelta(seconds=10),
        boot_id="boot-1",
        last_saved_at=base_time,
        last_saved_boot_id="boot-1",
        last_saved_payload=base_payload,
        last_saved_quality=base_quality,
    )
    assert (keep3, reason3) == (True, "non_normal_gas")

    # Gradual fuel drop >= 0.10 kg triggers save
    used = _lpg_payload(gross=19.85, pct=41.0)
    keep4, reason4 = lpg_interpreter.should_persist_lpg_history(
        used,
        base_quality,
        base_time + timedelta(seconds=20),
        boot_id="boot-1",
        last_saved_at=base_time,
        last_saved_boot_id="boot-1",
        last_saved_payload=base_payload,
        last_saved_quality=base_quality,
    )
    assert (keep4, reason4) == (True, "weight_change")

    # Mode transition (online -> low) triggers save even if delta happened right around threshold
    keep5, reason5 = lpg_interpreter.should_persist_lpg_history(
        _lpg_payload(pct=42.0),
        _lpg_quality(mode="low"),
        base_time + timedelta(seconds=25),
        boot_id="boot-1",
        last_saved_at=base_time,
        last_saved_boot_id="boot-1",
        last_saved_payload=base_payload,
        last_saved_quality=base_quality,
    )
    assert (keep5, reason5) == (True, "mode_or_quality_change")


def test_rolling_presence_buffer_preserves_swap_stability_without_history_rows():
    now = datetime(2026, 11, 25, 2, 0, 0, tzinfo=timezone.utc)
    buf = []
    for idx in range(15):
        ts = now - timedelta(seconds=(14 - idx) * 5)
        buf = lpg_interpreter.update_recent_lpg_samples(
            buf,
            record_id=f"rec-{idx}",
            sample_at=ts,
            sensor_data={"gross_weight_kg": 30.50, "voltage": 0.44},
            quality={"weight_valid": True},
        )
    assert len(buf) == 12
    assert buf[0]["record_id"] == "rec-14"

    parsed = lpg_interpreter.parse_recent_lpg_samples(json.dumps(buf))
    stability = lpg_interpreter.evaluate_swap_stability(parsed, tolerance_kg=0.25, now=now)
    assert stability["stable"] is True
    assert stability["sample_count"] == 3


def test_ingestion_worker_skips_sensor_telemetry_on_flat_lpg_presence(monkeypatch):
    worker = EdgeIngestionWorker()
    worker.gateway_id = "gw-1"
    worker.branch_id = "branch-1"
    worker.is_active = True

    base_dt = datetime.now(timezone.utc) - timedelta(seconds=5)
    base_payload = _lpg_payload()
    base_quality = _lpg_quality()

    executed_sql = []

    class FakeCursor:
        def __init__(self):
            self.last_sql = ""

        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

        def execute(self, sql, params=()):
            self.last_sql = sql
            executed_sql.append((sql, params))

        def fetchone(self):
            if "FROM lpg_presence" in self.last_sql:
                return {
                    "boot_id": "BOOT1",
                    "sequence": 1,
                    "data_payload": json.dumps(base_payload),
                    "recent_samples_json": "[]",
                    "last_history_saved_at": base_dt.replace(tzinfo=None),
                    "last_history_boot_id": "BOOT1",
                    "last_history_payload": json.dumps(base_payload),
                    "last_history_quality": json.dumps(base_quality),
                }
            return None

    class FakeConn:
        def cursor(self):
            return FakeCursor()

        def commit(self):
            pass

        def rollback(self):
            pass

    monkeypatch.setattr(worker, "get_db_connection", lambda: FakeConn())
    monkeypatch.setattr(worker, "ensure_device_registered_or_discovered", lambda *_: True)
    monkeypatch.setattr(
        worker,
        "apply_lpg_edge_state",
        lambda _c, _s, data, qual: (
            qual.update(base_quality) or {"gas_condition": "normal", "ppm_calibrated": True, "estimated_ppm": 12.0, "mq6_baseline_v": 0.45},
            {"gas_warn_ppm": 20.0, "gas_crit_ppm": 80.0},
        ),
    )
    monkeypatch.setattr(worker, "_record_lpg_conditions", lambda *_: None)

    client = MagicMock()
    msg = MagicMock()
    msg.topic = "branches/branch-1/devices/lpg-01/telemetry"
    msg.payload = json.dumps({
        "device_id": "lpg-01",
        "boot_id": "BOOT1",
        "quality": {"temperature_valid": True, "humidity_valid": True, "weight_valid": True},
        "data": {**base_payload, "gross_weight_kg": 20.02, "sequence": 2},
    }).encode()

    worker.on_message(client, None, msg)

    sql_strings = [" ".join(s.split()) for s, _ in executed_sql]
    assert not any("INSERT INTO sensor_telemetry" in s for s in sql_strings)
    presence_upsert = [params for s, params in executed_sql if "INSERT INTO lpg_presence" in " ".join(s.split())]
    assert len(presence_upsert) == 1
    # Null last_history_* params preserve existing baseline columns
    assert presence_upsert[0][-4:] == (None, None, None, None)
    client.publish.assert_called_once()


def test_sync_worker_lpg_presence_throttles_and_loads_recent_samples(monkeypatch):
    worker = EdgeSyncWorker()
    worker.status = "active"
    worker.gateway_id = "11111111-1111-1111-1111-111111111111"
    worker.credential = "tok"

    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    recent_json = json.dumps([
        {"record_id": "r3", "sample_at": datetime.now(timezone.utc).isoformat(), "gross_weight_kg": 25.0, "weight_valid": True, "voltage": 0.45},
        {"record_id": "r2", "sample_at": (datetime.now(timezone.utc) - timedelta(seconds=5)).isoformat(), "gross_weight_kg": 25.01, "weight_valid": True, "voltage": 0.45},
    ])
    row = {
        "source_id": "lpg-01",
        "boot_id": "BOOT1",
        "sequence": 10,
        "source_kind": "physical",
        "source_time_quality": "gateway_receipt_only",
        "recorded_at": now_naive,
        "gateway_receipt_at": now_naive,
        "data_payload": json.dumps(_lpg_payload(gross=25.0)),
        "quality_metadata": json.dumps(_lpg_quality()),
        "recent_samples_json": recent_json,
    }
    read_conn = MagicMock()
    cursor = read_conn.cursor.return_value.__enter__.return_value
    cursor.fetchall.return_value = [row]
    cursor.fetchone.return_value = {"recent_samples_json": recent_json}
    monkeypatch.setattr(worker, "get_state_db_connection", lambda: read_conn)
    worker.session = MagicMock()
    worker.session.post.return_value.status_code = 200

    assert worker.sync_lpg_presence() == 1
    assert worker.session.post.call_args.args[0].endswith("/edge/lpg-presence")
    sent_node = worker.session.post.call_args.kwargs["json"]["nodes"][0]
    assert len(sent_node["quality"]["recent_samples"]) == 2

    # Next 5s sequence within 15s throttle with flat data does not re-POST
    row["sequence"] = 11
    assert worker.sync_lpg_presence() == 0

    # _load_recent_lpg_samples uses lpg_presence buffer instead of sensor_telemetry
    samples = worker._load_recent_lpg_samples(cursor, "lpg-01", limit=10)
    assert len(samples) == 2
    assert samples[0]["record_id"] == "r3"


def test_plan_compaction_deletes_keeps_15m_checkpoints_and_gas_spikes():
    start = datetime(2026, 11, 20, 0, 0, 0)
    rows = []
    # 1 hour of 5-second idle samples = 720 rows, plus a spike at index 100
    for idx in range(720):
        ts = start + timedelta(seconds=idx * 5)
        is_spike = 100 <= idx <= 102
        rows.append({
            "id": idx + 1,
            "gateway_id": "gw-1",
            "source_id": "lpg-01",
            "boot_id": "B1",
            "recorded_at": ts,
            "gateway_receipt_at": ts,
            "data_payload": json.dumps(_lpg_payload(voltage=1.6 if is_spike else 0.45, ppm=70.0 if is_spike else 10.0)),
            "quality_metadata": json.dumps(_lpg_quality(gas_condition="warning" if is_spike else "normal")),
        })

    delete_ids, kept_count = plan_compaction_deletes(rows, bucket_seconds=900)
    # Kept: initial row + spike rows (100,101,102 + 103 recovery transition) + ~3-4 checkpoints = ~8 rows out of 720
    assert kept_count <= 10
    assert len(delete_ids) >= 710
    assert 1 not in delete_ids
    assert 101 not in delete_ids
    assert 102 not in delete_ids
