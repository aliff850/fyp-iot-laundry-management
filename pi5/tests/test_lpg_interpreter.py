from datetime import datetime, timedelta, timezone

import lpg_interpreter


def test_voltage_to_rs_and_clean_air_baseline():
    # Vout = 0.5V across RL = 20 kOhm at Vcc = 5V => Rs = 20 * (5 - 0.5) / 0.5 = 180 kOhm
    rs = lpg_interpreter.voltage_to_rs_kohm(0.5, vcc_v=5.0, rl_kohm=20.0, divider_ratio=1.0)
    assert rs == 180.0
    assert lpg_interpreter.derive_ro_from_clean_air(0.5, vcc_v=5.0, rl_kohm=20.0, divider_ratio=1.0) == 18.0
    assert lpg_interpreter.voltage_to_rs_kohm(0.0) is None
    assert lpg_interpreter.voltage_to_rs_kohm(5.0, vcc_v=5.0) is None
    assert lpg_interpreter.voltage_to_rs_kohm(True) is None


def test_estimate_mq6_never_fabricates_when_unconfigured():
    unconfigured = lpg_interpreter.estimate_mq6_telemetry(0.85, {"mq6_ro_kohm": None})
    assert unconfigured["estimated_ppm"] is None
    assert unconfigured["ppm_calibrated"] is False
    assert unconfigured["gas_condition"] == "unconfigured"
    assert unconfigured["rs_kohm"] is not None

    unavailable = lpg_interpreter.estimate_mq6_telemetry(None, {"mq6_ro_kohm": 18.0})
    assert unavailable["estimated_ppm"] is None
    assert unavailable["gas_condition"] == "unavailable"

    oor = lpg_interpreter.estimate_mq6_telemetry(4.995, {"mq6_ro_kohm": 18.0, "mq6_vcc_v": 5.0})
    assert oor["estimated_ppm"] is None
    assert oor["gas_condition"] == "out_of_range"


def test_estimate_mq6_calibrated_bands():
    cfg = {
        "mq6_vcc_v": 5.0,
        "mq6_rl_kohm": 20.0,
        "mq6_divider_ratio": 1.0,
        "mq6_ro_kohm": 18.0,
        "gas_warn_ppm": 400.0,
        "gas_crit_ppm": 1000.0,
    }
    # Clean air ~0.5V => Rs=180 => Rs/R0=10 => ~3.8 ppm -> normal
    clean = lpg_interpreter.estimate_mq6_telemetry(0.5, cfg)
    assert clean["ppm_calibrated"] is True
    assert clean["gas_condition"] == "normal"
    assert clean["estimated_ppm"] < 20.0

    # When Rs == R0 (18 kOhm => Vout = 5 * 20 / (20 + 18) = 2.6316V) => curve hits 1000 ppm -> critical
    critical = lpg_interpreter.estimate_mq6_telemetry(2.632, cfg)
    assert critical["ppm_calibrated"] is True
    assert critical["gas_condition"] == "critical"
    assert critical["estimated_ppm"] >= 990.0

    # Elevated warning (~500 ppm => Rs/R0 ~ 1.33 => Rs ~ 23.94 kOhm => Vout ~ 2.276V)
    warning = lpg_interpreter.estimate_mq6_telemetry(2.276, cfg)
    assert warning["gas_condition"] == "warning"
    assert 400.0 <= warning["estimated_ppm"] < 1000.0


def test_estimate_mq6_default_bench_thresholds_trigger_warning_and_critical():
    cfg = {
        "mq6_vcc_v": 5.0,
        "mq6_rl_kohm": 20.0,
        "mq6_divider_ratio": 1.0,
        "mq6_ro_kohm": 8.638,
        "mq6_baseline_v": 0.94,
    }
    norm = lpg_interpreter.normalize_node_config(cfg)
    assert norm["gas_warn_ppm"] == 20.0
    assert norm["gas_crit_ppm"] == 80.0
    # Lighter spike observed on bench (1.71 V -> 26.9 ppm) triggers warning under default thresholds
    warn = lpg_interpreter.estimate_mq6_telemetry(1.71, cfg)
    assert warn["gas_condition"] == "warning"
    assert warn["estimated_ppm"] == 26.9
    # Stronger leak (2.40 V -> ~108.8 ppm) crosses 80 ppm critical threshold within ESP32 3.3V ADC range
    crit = lpg_interpreter.estimate_mq6_telemetry(2.40, cfg)
    assert crit["gas_condition"] == "critical"
    assert crit["estimated_ppm"] >= 80.0


def test_recompute_fuel_metrics():
    assert lpg_interpreter.recompute_fuel_metrics(30.5, 16.5, 14.0) == (14.0, 100.0)
    assert lpg_interpreter.recompute_fuel_metrics(23.5, 16.5, 14.0) == (7.0, 50.0)
    assert lpg_interpreter.recompute_fuel_metrics(14.0, 16.5, 14.0) == (0.0, 0.0)
    assert lpg_interpreter.recompute_fuel_metrics(None, 16.5, 14.0) is None


def test_evaluate_swap_stability_requires_three_consecutive_fresh_valid_samples():
    now = datetime(2026, 11, 15, 9, 0, 0, tzinfo=timezone.utc)
    fresh_stable = [
        {"gross_weight_kg": 30.52, "weight_valid": True, "sample_at": now - timedelta(seconds=2)},
        {"gross_weight_kg": 30.48, "weight_valid": True, "sample_at": now - timedelta(seconds=7)},
        {"gross_weight_kg": 30.50, "weight_valid": True, "sample_at": now - timedelta(seconds=12)},
    ]
    res_ok = lpg_interpreter.evaluate_swap_stability(fresh_stable, tolerance_kg=0.25, now=now)
    assert res_ok["stable"] is True
    assert res_ok["sample_count"] == 3
    assert res_ok["spread_kg"] == 0.04
    assert res_ok["mean_gross_kg"] == 30.5

    # Fluctuating spread > 0.25 kg
    fluctuating = [
        {"gross_weight_kg": 30.9, "weight_valid": True, "sample_at": now - timedelta(seconds=2)},
        {"gross_weight_kg": 29.8, "weight_valid": True, "sample_at": now - timedelta(seconds=7)},
        {"gross_weight_kg": 30.5, "weight_valid": True, "sample_at": now - timedelta(seconds=12)},
    ]
    res_fluct = lpg_interpreter.evaluate_swap_stability(fluctuating, tolerance_kg=0.25, now=now)
    assert res_fluct["stable"] is False
    assert res_fluct["sample_count"] == 3

    # Latest invalid reading breaks consecutive chain immediately
    invalid_latest = [
        {"gross_weight_kg": 30.5, "weight_valid": False, "sample_at": now - timedelta(seconds=2)},
        {"gross_weight_kg": 30.5, "weight_valid": True, "sample_at": now - timedelta(seconds=7)},
        {"gross_weight_kg": 30.5, "weight_valid": True, "sample_at": now - timedelta(seconds=12)},
    ]
    res_invalid = lpg_interpreter.evaluate_swap_stability(invalid_latest, tolerance_kg=0.25, now=now)
    assert res_invalid["stable"] is False
    assert res_invalid["sample_count"] == 0

    # Too stale (>30s) stops before reaching 3
    stale_samples = [
        {"gross_weight_kg": 30.5, "weight_valid": True, "sample_at": now - timedelta(seconds=2)},
        {"gross_weight_kg": 30.5, "weight_valid": True, "sample_at": now - timedelta(seconds=10)},
        {"gross_weight_kg": 30.5, "weight_valid": True, "sample_at": now - timedelta(seconds=45)},
    ]
    res_stale = lpg_interpreter.evaluate_swap_stability(stale_samples, tolerance_kg=0.25, now=now)
    assert res_stale["stable"] is False
    assert res_stale["sample_count"] == 2


def test_hysteresis_lpg_fuel_three_sample_entry_escalation_recovery_and_restart():
    tracker = lpg_interpreter.HysteresisStateTracker()
    base = datetime(2026, 11, 20, 10, 0, 0, tzinfo=timezone.utc)
    st = lpg_interpreter.ConditionTrackerState("gw-1", "lpg_1", "lpg_fuel")

    # 2 low readings + 1 invalid reading -> pending counter resets, no incident opened
    st, tr = tracker.evaluate_lpg_fuel(st, lpg_percent=12.0, weight_valid=True, maintenance_mode=False, sample_identity="b1:1", sample_at=base)
    assert tr is None and st.pending_count == 1
    st, tr = tracker.evaluate_lpg_fuel(st, lpg_percent=11.0, weight_valid=True, maintenance_mode=False, sample_identity="b1:2", sample_at=base + timedelta(seconds=5))
    assert tr is None and st.pending_count == 2
    st, tr = tracker.evaluate_lpg_fuel(st, lpg_percent=10.0, weight_valid=False, maintenance_mode=False, sample_identity="b1:3", sample_at=base + timedelta(seconds=10))
    assert tr is None and st.pending_count == 0 and st.active_episode_id is None

    # Replay duplicate identity -> ignored
    st, tr = tracker.evaluate_lpg_fuel(st, lpg_percent=10.0, weight_valid=True, maintenance_mode=False, sample_identity="b1:3", sample_at=base + timedelta(seconds=12))
    assert tr is None and st.pending_count == 0

    # 3 consecutive valid low readings open warning episode
    for idx, seq in enumerate((4, 5, 6)):
        st, tr = tracker.evaluate_lpg_fuel(
            st,
            lpg_percent=11.5 - idx,
            weight_valid=True,
            maintenance_mode=False,
            sample_identity=f"b1:{seq}",
            sample_at=base + timedelta(seconds=15 + idx * 5),
        )
    assert tr is not None
    assert tr["transition_type"] == "opened"
    assert tr["severity"] == "warning"
    assert tr["fault_code"] == "LPG_LOW"
    episode_id = tr["episode_id"]

    # Simulate Pi restart roundtrip via ConditionTrackerState.from_row
    st = lpg_interpreter.ConditionTrackerState.from_row(st.__dict__)
    assert st.active_episode_id == episode_id

    # Invalid reading while active does NOT clear active episode
    st, tr = tracker.evaluate_lpg_fuel(st, lpg_percent=99.0, weight_valid=False, maintenance_mode=False, sample_identity="b2:1", sample_at=base + timedelta(seconds=40))
    assert tr is None and st.active_episode_id == episode_id

    # 3 readings < 5% escalate the SAME episode
    for idx, seq in enumerate((2, 3, 4)):
        st, tr = tracker.evaluate_lpg_fuel(st, lpg_percent=3.0, weight_valid=True, maintenance_mode=False, sample_identity=f"b2:{seq}", sample_at=base + timedelta(seconds=45 + idx * 5))
    assert tr is not None
    assert tr["transition_type"] == "escalated"
    assert tr["episode_id"] == episode_id
    assert tr["severity"] == "critical"
    assert tr["fault_code"] == "LPG_CRITICAL"

    # Maintenance mode suppresses fuel evaluation while leaving active state untouched
    st_maint, tr_maint = tracker.evaluate_lpg_fuel(st, lpg_percent=90.0, weight_valid=True, maintenance_mode=True, sample_identity="b2:5", sample_at=base + timedelta(seconds=65))
    assert tr_maint is None and st_maint.active_episode_id == episode_id

    # Out-of-order older timestamp rejected
    st_old, tr_old = tracker.evaluate_lpg_fuel(st, lpg_percent=90.0, weight_valid=True, maintenance_mode=False, sample_identity="b0:1", sample_at=base)
    assert tr_old is None and st_old.active_episode_id == episode_id

    # 3 consecutive valid readings >= 17% clear the episode
    for idx, seq in enumerate((6, 7, 8)):
        st, tr = tracker.evaluate_lpg_fuel(st, lpg_percent=85.0, weight_valid=True, maintenance_mode=False, sample_identity=f"b2:{seq}", sample_at=base + timedelta(seconds=70 + idx * 5))
    assert tr is not None
    assert tr["transition_type"] == "cleared"
    assert tr["episode_id"] == episode_id
    assert st.active_episode_id is None


def test_hysteresis_gas_temp_and_machine_episodes():
    tracker = lpg_interpreter.HysteresisStateTracker()
    base = datetime(2026, 11, 20, 11, 0, 0, tzinfo=timezone.utc)
    cfg = {"gas_warn_ppm": 20.0, "gas_crit_ppm": 80.0}

    gas_st = lpg_interpreter.ConditionTrackerState("gw-1", "lpg_1", "gas_concentration")
    for idx in range(3):
        gas_st, g_tr = tracker.evaluate_gas_concentration(
            gas_st,
            gas_info={"gas_condition": "warning", "estimated_ppm": 30.0},
            node_config=cfg,
            sample_identity=f"g:{idx}",
            sample_at=base + timedelta(seconds=idx * 5),
        )
    assert g_tr is not None and g_tr["transition_type"] == "opened" and g_tr["fault_code"] == "GAS_WARNING"

    # Unconfigured / out_of_range does NOT clear active gas alert
    gas_st, g_inv = tracker.evaluate_gas_concentration(
        gas_st,
        gas_info={"gas_condition": "unconfigured", "estimated_ppm": None},
        node_config=cfg,
        sample_identity="g:3",
        sample_at=base + timedelta(seconds=20),
    )
    assert g_inv is None and gas_st.active_episode_id is not None

    # Temp hysteresis (>45 enter, <43 recover)
    temp_st = lpg_interpreter.ConditionTrackerState("gw-1", "lpg_1", "high_temperature")
    for idx in range(3):
        temp_st, t_tr = tracker.evaluate_high_temperature(temp_st, temperature_c=46.2, sample_identity=f"t:{idx}", sample_at=base + timedelta(seconds=idx * 5))
    assert t_tr is not None and t_tr["transition_type"] == "opened" and t_tr["fault_code"] == "HIGH_TEMPERATURE"

    # 44.0 C stays inside deadband without clearing
    for idx in range(3, 6):
        temp_st, t_mid = tracker.evaluate_high_temperature(temp_st, temperature_c=44.0, sample_identity=f"t:{idx}", sample_at=base + timedelta(seconds=idx * 5))
        assert t_mid is None
    assert temp_st.active_episode_id is not None

    for idx in range(6, 9):
        temp_st, t_clr = tracker.evaluate_high_temperature(temp_st, temperature_c=42.1, sample_identity=f"t:{idx}", sample_at=base + timedelta(seconds=idx * 5))
    assert t_clr is not None and t_clr["transition_type"] == "cleared" and temp_st.active_episode_id is None

    # Machine fault episode open -> maintenance keeps episode active -> clear returns to idle
    m_st = lpg_interpreter.ConditionTrackerState("gw-1", "washer_1", "machine_fault")
    m_st, m_open = tracker.evaluate_machine_fault(m_st, machine_state="error", fault_code="E01", fault_name="Water Inlet Failure", sample_identity="m:1", sample_at=base)
    assert m_open is not None and m_open["transition_type"] == "opened" and m_open["fault_code"] == "E01"
    m_st, m_maint = tracker.evaluate_machine_fault(m_st, machine_state="maintenance", fault_code="E01", fault_name="Water Inlet Failure", sample_identity="m:2", sample_at=base + timedelta(seconds=5))
    assert m_maint is None and m_st.active_episode_id == m_open["episode_id"]
    m_st, m_clr = tracker.evaluate_machine_fault(m_st, machine_state="idle", fault_code=None, fault_name=None, sample_identity="m:3", sample_at=base + timedelta(seconds=10))
    assert m_clr is not None and m_clr["transition_type"] == "cleared" and m_clr["episode_id"] == m_open["episode_id"]


def test_ingest_machine_presence_accepts_maintenance_state():
    import json
    from types import SimpleNamespace
    import ingestion_worker

    executed = []

    class _FakeCursor:
        def __init__(self):
            self._last_sql = ""

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def execute(self, sql, params=None):
            self._last_sql = sql
            executed.append((sql, params))

        def fetchone(self):
            if "FROM device_registry" in self._last_sql:
                return {"source_id": "washer-sim-01"}
            return None

    class _FakeConn:
        def __init__(self):
            self.committed = False

        def cursor(self):
            return _FakeCursor()

        def commit(self):
            self.committed = True

        def rollback(self):
            pass

    worker = object.__new__(ingestion_worker.EdgeIngestionWorker)
    worker.is_active = True
    worker.branch_id = "branch-1"
    worker.gateway_id = "gw-1"
    conn = _FakeConn()
    worker.connection = conn
    worker.get_db_connection = lambda: conn
    recorded = []
    worker._record_machine_condition = lambda _conn, source_id, data, *_args: recorded.append((source_id, data.get("state")))

    msg = SimpleNamespace(
        topic="branches/branch-1/devices/washer-sim-01/presence",
        payload=json.dumps(
            {
                "device_id": "washer-sim-01",
                "source_kind": "simulated",
                "boot_id": "boot-1",
                "sequence": 42,
                "data": {"state": "maintenance", "fault_code": "E01", "remaining_seconds": 0},
            }
        ).encode("utf-8"),
    )
    worker.ingest_machine_presence(msg)

    assert conn.committed is True
    assert recorded == [("washer-sim-01", "maintenance")]
    inserts = [params for sql, params in executed if "INSERT INTO machine_presence" in sql]
    assert len(inserts) == 1 and '"maintenance"' in inserts[0][4]


def test_lpg_maintenance_mode_pauses_gas_and_temp_and_low_fuel_does_not_open_incidents():
    base = datetime(2026, 11, 25, 10, 0, tzinfo=timezone.utc)
    tracker = lpg_interpreter.HysteresisStateTracker()
    cfg = {"gas_warn_ppm": 20.0, "gas_crit_ppm": 80.0}

    # Gas alert evaluation is paused while maintenance_mode=True
    gas_st = lpg_interpreter.ConditionTrackerState("gw-1", "lpg_1", "gas_concentration")
    for idx in range(4):
        gas_st, g_tr = tracker.evaluate_gas_concentration(
            gas_st,
            gas_info={"gas_condition": "critical", "estimated_ppm": 150.0},
            node_config=cfg,
            sample_identity=f"gm:{idx}",
            sample_at=base + timedelta(seconds=idx * 5),
            maintenance_mode=True,
        )
        assert g_tr is None
        assert gas_st.active_episode_id is None

    # High temperature evaluation is also paused while maintenance_mode=True
    temp_st = lpg_interpreter.ConditionTrackerState("gw-1", "lpg_1", "high_temperature")
    for idx in range(4):
        temp_st, t_tr = tracker.evaluate_high_temperature(
            temp_st,
            temperature_c=60.0,
            sample_identity=f"tm:{idx}",
            sample_at=base + timedelta(seconds=idx * 5),
            maintenance_mode=True,
        )
        assert t_tr is None
        assert temp_st.active_episode_id is None

    # Low fuel clears any legacy open lpg_fuel episode instead of keeping/opening low-fuel incidents
    legacy_fuel = lpg_interpreter.ConditionTrackerState(
        gateway_id="gw-1",
        source_id="lpg_1",
        condition_key="lpg_fuel",
        active_episode_id="ep-legacy-low",
        active_severity="warning",
        active_fault_code="LPG_LOW",
        revision=1,
    )
    cleared_fuel, fuel_tr = tracker.clear_legacy_lpg_fuel_episode(
        legacy_fuel,
        sample_identity="f:1",
        sample_at=base,
    )
    assert fuel_tr is not None and fuel_tr["transition_type"] == "cleared"
    assert cleared_fuel.active_episode_id is None


def test_short_ppm_burst_vs_sustained_leak_auto_escalation_and_heartbeat():
    tracker = lpg_interpreter.HysteresisStateTracker()
    base = datetime(2026, 11, 26, 9, 0, 0, tzinfo=timezone.utc)
    cfg = {"gas_warn_ppm": 20.0, "gas_crit_ppm": 80.0}

    # 1. Fleeting 2-sample (<15s) blip that drops back to normal creates ZERO incidents
    st = lpg_interpreter.ConditionTrackerState("gw-1", "lpg_room_1", "gas_concentration")
    for idx, (cond, ppm) in enumerate([("warning", 28.0), ("warning", 31.0), ("normal", 8.0)]):
        st, tr = tracker.evaluate_gas_concentration(
            st,
            gas_info={"gas_condition": cond, "estimated_ppm": ppm},
            node_config=cfg,
            sample_identity=f"blip:{idx}",
            sample_at=base + timedelta(seconds=idx * 5),
        )
        assert tr is None
    assert st.active_episode_id is None

    # 2. Short PPM burst (15s-30s < 60s) opens ONE Warning incident and clears as subsided
    for idx in range(3):
        st, tr = tracker.evaluate_gas_concentration(
            st,
            gas_info={"gas_condition": "warning", "estimated_ppm": 32.0 + idx * 3},
            node_config=cfg,
            sample_identity=f"burst:{idx}",
            sample_at=base + timedelta(seconds=20 + idx * 5),
        )
    assert tr is not None
    assert tr["transition_type"] == "opened"
    assert tr["severity"] == "warning"
    assert tr["fault_code"] == "GAS_WARNING"
    burst_ep = tr["episode_id"]

    # Drops below warn_recover (17.0 ppm) within 25s (< 60s) -> cleared without escalating to critical
    for idx in range(3):
        st, tr = tracker.evaluate_gas_concentration(
            st,
            gas_info={"gas_condition": "normal", "estimated_ppm": 6.5},
            node_config=cfg,
            sample_identity=f"burst_clr:{idx}",
            sample_at=base + timedelta(seconds=35 + idx * 5),
        )
    assert tr is not None
    assert tr["transition_type"] == "cleared"
    assert tr["episode_id"] == burst_ep
    assert tr["severity"] == "warning"
    assert tr["evidence"]["sustained"] is False
    assert tr["evidence"]["peak_ppm"] == 38.0
    assert "subsided" in tr["summary"].lower()

    # 3. Sustained elevated PPM (>= 60s continuous warning) upgrades the SAME incident to Critical
    t2 = base + timedelta(minutes=5)
    for idx in range(3):
        st, tr = tracker.evaluate_gas_concentration(
            st,
            gas_info={"gas_condition": "warning", "estimated_ppm": 35.0},
            node_config=cfg,
            sample_identity=f"leak:{idx}",
            sample_at=t2 + timedelta(seconds=idx * 5),
        )
    assert tr is not None and tr["transition_type"] == "opened" and tr["severity"] == "warning"
    leak_ep = tr["episode_id"]
    opened_at = t2 + timedelta(seconds=10)

    # Stay elevated for 55s (< 60s): still warning, no duplicate episode
    for sec in range(5, 60, 5):
        st, tr = tracker.evaluate_gas_concentration(
            st,
            gas_info={"gas_condition": "warning", "estimated_ppm": 42.0},
            node_config=cfg,
            sample_identity=f"leak_hold:{sec}",
            sample_at=opened_at + timedelta(seconds=sec),
        )
        assert tr is None
        assert st.active_episode_id == leak_ep

    # At 60s continuous elevated PPM -> SAME episode escalates to GAS_CRITICAL!
    st, esc_tr = tracker.evaluate_gas_concentration(
        st,
        gas_info={"gas_condition": "warning", "estimated_ppm": 46.0},
        node_config=cfg,
        sample_identity="leak_60s",
        sample_at=opened_at + timedelta(seconds=60),
    )
    assert esc_tr is not None
    assert esc_tr["episode_id"] == leak_ep
    assert esc_tr["transition_type"] == "escalated"
    assert esc_tr["severity"] == "critical"
    assert esc_tr["fault_code"] == "GAS_CRITICAL"
    assert esc_tr["evidence"]["sustained"] is True
    assert esc_tr["evidence"]["peak_ppm"] == 46.0

    # Another 60s of sustained gas emits live heartbeat update on the SAME episode (no downgrade, no duplicate)
    st, hb_tr = tracker.evaluate_gas_concentration(
        st,
        gas_info={"gas_condition": "warning", "estimated_ppm": 52.0},
        node_config=cfg,
        sample_identity="leak_120s",
        sample_at=opened_at + timedelta(seconds=120),
    )
    assert hb_tr is not None
    assert hb_tr["episode_id"] == leak_ep
    assert hb_tr["transition_type"] == "updated"
    assert hb_tr["severity"] == "critical"
    assert hb_tr["evidence"]["peak_ppm"] == 52.0
    assert hb_tr["evidence"]["duration_seconds"] == 120
