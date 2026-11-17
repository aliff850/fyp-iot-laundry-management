"""Shared edge-owned LPG gas concentration estimation and tank-swap stability checks.

Implements one edge interpretation used by MQTT ingestion, the Pi 5 local dashboard,
and synced telemetry payloads (PRD Section 6.4 FE-04..FE-07, S-08, S-09).
"""

import math
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, Optional, Tuple

DEFAULT_MQ6_VCC_V = 5.0
DEFAULT_MQ6_RL_KOHM = 20.0
DEFAULT_MQ6_DIVIDER_RATIO = 1.0
DEFAULT_GAS_WARN_PPM = 20.0
DEFAULT_GAS_CRIT_PPM = 80.0
DEFAULT_STABILITY_TOLERANCE_KG = 0.25

# Winsen MQ-6 LPG log-log curve fit (~2.0 at 200 ppm, 1.0 at 1000 ppm, ~0.4 at 10000 ppm)
# and datasheet clean-air Rs/R0 ratio (~10.0).
MQ6_CURVE_A = 1000.0
MQ6_CURVE_B = -2.42
MQ6_CLEAN_AIR_RS_R0_RATIO = 10.0
MAX_ESTIMATED_PPM = 25000.0


def finite_float(value: Any) -> Optional[float]:
    if isinstance(value, bool):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def normalize_node_config(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    cfg = raw or {}
    vcc_v = finite_float(cfg.get("mq6_vcc_v"))
    rl_kohm = finite_float(cfg.get("mq6_rl_kohm"))
    divider_ratio = finite_float(cfg.get("mq6_divider_ratio"))
    ro_kohm = finite_float(cfg.get("mq6_ro_kohm"))
    baseline_v = finite_float(cfg.get("mq6_baseline_v"))
    warn_ppm = finite_float(cfg.get("gas_warn_ppm"))
    crit_ppm = finite_float(cfg.get("gas_crit_ppm"))
    tare_kg = finite_float(cfg.get("cylinder_tare_kg"))
    rated_cap_kg = finite_float(cfg.get("rated_capacity_kg"))
    tol_kg = finite_float(cfg.get("stability_tolerance_kg"))

    resolved_warn = warn_ppm if warn_ppm and warn_ppm > 0 else DEFAULT_GAS_WARN_PPM
    resolved_crit = crit_ppm if crit_ppm and crit_ppm > resolved_warn else max(DEFAULT_GAS_CRIT_PPM, resolved_warn * 2.0)

    return {
        "mq6_vcc_v": vcc_v if vcc_v and vcc_v > 0 else DEFAULT_MQ6_VCC_V,
        "mq6_rl_kohm": rl_kohm if rl_kohm and rl_kohm > 0 else DEFAULT_MQ6_RL_KOHM,
        "mq6_divider_ratio": divider_ratio if divider_ratio and divider_ratio > 0 else DEFAULT_MQ6_DIVIDER_RATIO,
        "mq6_ro_kohm": ro_kohm if ro_kohm and ro_kohm > 0 else None,
        "mq6_baseline_v": baseline_v if baseline_v and baseline_v > 0 else None,
        "gas_warn_ppm": resolved_warn,
        "gas_crit_ppm": resolved_crit,
        "cylinder_tare_kg": tare_kg if tare_kg is not None and tare_kg >= 0 else None,
        "rated_capacity_kg": rated_cap_kg if rated_cap_kg is not None and rated_cap_kg > 0 else None,
        "stability_tolerance_kg": tol_kg if tol_kg is not None and tol_kg > 0 else DEFAULT_STABILITY_TOLERANCE_KG,
    }


def voltage_to_rs_kohm(
    voltage_v: Any,
    vcc_v: float = DEFAULT_MQ6_VCC_V,
    rl_kohm: float = DEFAULT_MQ6_RL_KOHM,
    divider_ratio: float = DEFAULT_MQ6_DIVIDER_RATIO,
) -> Optional[float]:
    measured_v = finite_float(voltage_v)
    if measured_v is None or measured_v <= 0.01 or vcc_v <= 0.0 or rl_kohm <= 0.0 or divider_ratio <= 0.0:
        return None
    v_rl = measured_v * divider_ratio
    if v_rl <= 0.01 or v_rl >= vcc_v - 0.01:
        return None
    return round(rl_kohm * (vcc_v - v_rl) / v_rl, 3)


def derive_ro_from_clean_air(
    voltage_v: Any,
    vcc_v: float = DEFAULT_MQ6_VCC_V,
    rl_kohm: float = DEFAULT_MQ6_RL_KOHM,
    divider_ratio: float = DEFAULT_MQ6_DIVIDER_RATIO,
) -> Optional[float]:
    rs_kohm = voltage_to_rs_kohm(voltage_v, vcc_v=vcc_v, rl_kohm=rl_kohm, divider_ratio=divider_ratio)
    if rs_kohm is None:
        return None
    return round(rs_kohm / MQ6_CLEAN_AIR_RS_R0_RATIO, 3)


def estimate_mq6_telemetry(voltage_v: Any, raw_config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    cfg = normalize_node_config(raw_config)
    measured_v = finite_float(voltage_v)
    rs_kohm = voltage_to_rs_kohm(
        measured_v,
        vcc_v=cfg["mq6_vcc_v"],
        rl_kohm=cfg["mq6_rl_kohm"],
        divider_ratio=cfg["mq6_divider_ratio"],
    )

    if measured_v is None:
        return {
            "estimated_ppm": None,
            "ppm_calibrated": False,
            "rs_kohm": None,
            "mq6_ro_kohm": cfg["mq6_ro_kohm"],
            "mq6_baseline_v": cfg["mq6_baseline_v"],
            "gas_condition": "unavailable",
        }

    if rs_kohm is None:
        return {
            "estimated_ppm": None,
            "ppm_calibrated": False,
            "rs_kohm": None,
            "mq6_ro_kohm": cfg["mq6_ro_kohm"],
            "mq6_baseline_v": cfg["mq6_baseline_v"],
            "gas_condition": "out_of_range",
        }

    ro_kohm = cfg["mq6_ro_kohm"]
    if ro_kohm is None:
        return {
            "estimated_ppm": None,
            "ppm_calibrated": False,
            "rs_kohm": rs_kohm,
            "mq6_ro_kohm": None,
            "mq6_baseline_v": cfg["mq6_baseline_v"],
            "gas_condition": "unconfigured",
        }

    ratio = rs_kohm / ro_kohm
    if ratio <= 0.0:
        return {
            "estimated_ppm": None,
            "ppm_calibrated": False,
            "rs_kohm": rs_kohm,
            "mq6_ro_kohm": ro_kohm,
            "mq6_baseline_v": cfg["mq6_baseline_v"],
            "gas_condition": "out_of_range",
        }

    ppm = min(MAX_ESTIMATED_PPM, MQ6_CURVE_A * (ratio ** MQ6_CURVE_B))
    ppm_rounded = round(ppm, 1)
    if ppm_rounded >= cfg["gas_crit_ppm"]:
        condition = "critical"
    elif ppm_rounded >= cfg["gas_warn_ppm"]:
        condition = "warning"
    else:
        condition = "normal"

    return {
        "estimated_ppm": ppm_rounded,
        "ppm_calibrated": True,
        "rs_kohm": rs_kohm,
        "mq6_ro_kohm": ro_kohm,
        "mq6_baseline_v": cfg["mq6_baseline_v"],
        "gas_condition": condition,
    }


def recompute_fuel_metrics(
    gross_weight_kg: Any,
    tare_kg: Optional[float],
    rated_capacity_kg: Optional[float],
) -> Optional[Tuple[float, float]]:
    gross = finite_float(gross_weight_kg)
    if gross is None or tare_kg is None or rated_capacity_kg is None or tare_kg < 0 or rated_capacity_kg <= 0:
        return None
    remaining = max(0.0, round(gross - tare_kg, 2))
    pct = round(max(0.0, min(100.0, 100.0 * remaining / rated_capacity_kg)), 1)
    return remaining, pct


def evaluate_swap_stability(
    recent_samples: Iterable[Dict[str, Any]],
    tolerance_kg: float = DEFAULT_STABILITY_TOLERANCE_KG,
    now: Optional[datetime] = None,
    max_age_seconds: int = 30,
    required_count: int = 3,
) -> Dict[str, Any]:
    ref_now = now or datetime.now(timezone.utc)
    if ref_now.tzinfo is None:
        ref_now = ref_now.replace(tzinfo=timezone.utc)

    valid_samples = []
    for sample in recent_samples:
        if not isinstance(sample, dict):
            continue
        if sample.get("weight_valid") is False:
            break
        gross = finite_float(sample.get("gross_weight_kg"))
        sample_at = sample.get("sample_at")
        if gross is None or gross < 0 or not isinstance(sample_at, datetime):
            break
        ts = sample_at.replace(tzinfo=timezone.utc) if sample_at.tzinfo is None else sample_at.astimezone(timezone.utc)
        age_s = (ref_now - ts).total_seconds()
        if age_s > max_age_seconds:
            break
        valid_samples.append({"gross_weight_kg": round(gross, 3), "sample_at": ts.isoformat().replace("+00:00", "Z")})
        if len(valid_samples) >= required_count:
            break

    if len(valid_samples) < required_count:
        return {
            "stable": False,
            "reason": f"Need {required_count} consecutive recent valid scale readings (have {len(valid_samples)})",
            "sample_count": len(valid_samples),
            "spread_kg": None,
            "mean_gross_kg": None,
            "samples": valid_samples,
        }

    weights = [s["gross_weight_kg"] for s in valid_samples]
    spread_kg = round(max(weights) - min(weights), 3)
    mean_gross_kg = round(sum(weights) / len(weights), 2)
    stable = spread_kg <= tolerance_kg
    return {
        "stable": stable,
        "reason": (
            f"Scale stabilized across {required_count} readings (spread {spread_kg:.2f} kg)"
            if stable
            else f"Scale readings still fluctuating (spread {spread_kg:.2f} kg > {tolerance_kg:.2f} kg limit)"
        ),
        "sample_count": len(valid_samples),
        "spread_kg": spread_kg,
        "mean_gross_kg": mean_gross_kg,
        "samples": valid_samples,
    }
