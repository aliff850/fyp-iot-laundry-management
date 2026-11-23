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
