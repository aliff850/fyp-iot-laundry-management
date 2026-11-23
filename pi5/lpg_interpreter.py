"""Shared edge-owned LPG gas concentration estimation and tank-swap stability checks.

Implements one edge interpretation used by MQTT ingestion, the Pi 5 local dashboard,
and synced telemetry payloads (PRD Section 6.4 FE-04..FE-07, S-08, S-09).
"""

import math
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple

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


INCIDENT_RULE_VERSION = "edge-hysteresis-v1"
REQUIRED_CONSECUTIVE_SAMPLES = 3
LPG_LOW_ENTRY_PCT = 15.0
LPG_CRITICAL_ENTRY_PCT = 5.0
LPG_LOW_RECOVERY_PCT = 17.0
LPG_CRITICAL_RECOVERY_PCT = 7.0
HIGH_TEMP_ENTRY_C = 45.0
HIGH_TEMP_RECOVERY_C = 43.0


def _to_utc_datetime(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            return None
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)
    return None


@dataclass
class ConditionTrackerState:
    gateway_id: str
    source_id: str
    condition_key: str
    active_episode_id: Optional[str] = None
    active_severity: Optional[str] = None
    active_fault_code: Optional[str] = None
    active_fault_name: Optional[str] = None
    pending_state: Optional[str] = None
    pending_count: int = 0
    last_sample_identity: Optional[str] = None
    last_sample_at: Optional[datetime] = None
    revision: int = 0

    @classmethod
    def from_row(cls, row: Dict[str, Any]) -> "ConditionTrackerState":
        return cls(
            gateway_id=str(row["gateway_id"]),
            source_id=str(row["source_id"]),
            condition_key=str(row["condition_key"]),
            active_episode_id=row.get("active_episode_id"),
            active_severity=row.get("active_severity"),
            active_fault_code=row.get("active_fault_code"),
            active_fault_name=row.get("active_fault_name"),
            pending_state=row.get("pending_state"),
            pending_count=int(row.get("pending_count") or 0),
            last_sample_identity=row.get("last_sample_identity"),
            last_sample_at=_to_utc_datetime(row.get("last_sample_at")),
            revision=int(row.get("revision") or 0),
        )


class HysteresisStateTracker:
    """Restart-persistent 3-sample entry/recovery tracker for edge safety & fault conditions."""

    def __init__(self, required_samples: int = REQUIRED_CONSECUTIVE_SAMPLES) -> None:
        self.required_samples = max(1, int(required_samples))

    @staticmethod
    def _is_stale_or_duplicate(state: ConditionTrackerState, sample_identity: str, sample_at: datetime) -> bool:
        if state.last_sample_identity and state.last_sample_identity == sample_identity:
            return True
        if state.last_sample_at is not None and sample_at < state.last_sample_at:
            return True
        return False

    @staticmethod
    def _build_transition(
        state: ConditionTrackerState,
        *,
        domain: str,
        episode_id: str,
        transition_type: str,
        severity: str,
        fault_code: Optional[str],
        fault_name: Optional[str],
        summary: str,
        revision: int,
        evidence: Dict[str, Any],
        occurred_at: datetime,
    ) -> Dict[str, Any]:
        return {
            "transition_id": str(uuid.uuid4()),
            "gateway_id": state.gateway_id,
            "source_id": state.source_id,
            "episode_id": episode_id,
            "domain": domain,
            "condition_key": state.condition_key,
            "transition_type": transition_type,
            "severity": severity,
            "fault_code": fault_code,
            "fault_name": fault_name,
            "summary": summary,
            "rule_version": INCIDENT_RULE_VERSION,
            "revision": revision,
            "evidence": evidence,
            "occurred_at": occurred_at,
        }

    def _apply_hysteresis_target(
        self,
        state: ConditionTrackerState,
        *,
        target: Optional[str],
        domain: str,
        fault_code: Optional[str],
        fault_name: Optional[str],
        summary: str,
        evidence: Dict[str, Any],
        sample_identity: str,
        sample_at: datetime,
    ) -> Tuple[ConditionTrackerState, Optional[Dict[str, Any]]]:
        next_state = ConditionTrackerState(**state.__dict__)
        next_state.last_sample_identity = sample_identity
        next_state.last_sample_at = sample_at

        if target is None or target == next_state.active_severity or (
            next_state.active_episode_id is None and target == "normal"
        ):
            next_state.pending_state = None
            next_state.pending_count = 0
            return next_state, None

        if next_state.pending_state == target:
            next_state.pending_count += 1
        else:
            next_state.pending_state = target
            next_state.pending_count = 1

        if next_state.pending_count < self.required_samples:
            return next_state, None

        next_state.pending_state = None
        next_state.pending_count = 0

        if target == "normal":
            episode_id = next_state.active_episode_id
            prev_severity = next_state.active_severity or "warning"
            prev_fault_code = next_state.active_fault_code
            prev_fault_name = next_state.active_fault_name
            next_state.revision += 1
            next_state.active_episode_id = None
            next_state.active_severity = None
            next_state.active_fault_code = None
            next_state.active_fault_name = None
            if not episode_id:
                return next_state, None
            return next_state, self._build_transition(
                next_state,
                domain=domain,
                episode_id=episode_id,
                transition_type="cleared",
                severity=prev_severity,
                fault_code=prev_fault_code,
                fault_name=prev_fault_name,
                summary=summary,
                revision=next_state.revision,
                evidence=evidence,
                occurred_at=sample_at,
            )

        if next_state.active_episode_id is None:
            episode_id = str(uuid.uuid4())
            transition_type = "opened"
            next_state.revision = 1
        else:
            episode_id = next_state.active_episode_id
            transition_type = "escalated" if (
                next_state.active_severity == "warning" and target == "critical"
            ) else "updated"
            next_state.revision += 1

        next_state.active_episode_id = episode_id
        next_state.active_severity = target
        next_state.active_fault_code = fault_code
        next_state.active_fault_name = fault_name

        return next_state, self._build_transition(
            next_state,
            domain=domain,
            episode_id=episode_id,
            transition_type=transition_type,
            severity=target,
            fault_code=fault_code,
            fault_name=fault_name,
            summary=summary,
            revision=next_state.revision,
            evidence=evidence,
            occurred_at=sample_at,
        )

    def evaluate_lpg_fuel(
        self,
        state: ConditionTrackerState,
        *,
        lpg_percent: Any,
        weight_valid: bool,
        maintenance_mode: bool,
        sample_identity: str,
        sample_at: datetime,
    ) -> Tuple[ConditionTrackerState, Optional[Dict[str, Any]]]:
        ts = _to_utc_datetime(sample_at) or datetime.now(timezone.utc)
        if maintenance_mode or self._is_stale_or_duplicate(state, sample_identity, ts):
            return state, None

        pct = finite_float(lpg_percent)
        if not weight_valid or pct is None or pct < 0.0 or pct > 100.0:
            next_state = ConditionTrackerState(**state.__dict__)
            next_state.pending_state = None
            next_state.pending_count = 0
            next_state.last_sample_identity = sample_identity
            next_state.last_sample_at = ts
            return next_state, None

        active = state.active_severity
        target: Optional[str] = None
        fault_code: Optional[str] = None
        summary = f"LPG reserve stabilized at {pct:.1f}%"

        if active is None:
            if pct < LPG_CRITICAL_ENTRY_PCT:
                target, fault_code = "critical", "LPG_CRITICAL"
                summary = f"LPG reserve dropped to {pct:.1f}% (< 5% critical threshold)"
            elif pct < LPG_LOW_ENTRY_PCT:
                target, fault_code = "warning", "LPG_LOW"
                summary = f"LPG reserve fell to {pct:.1f}% (< 15% warning threshold)"
        elif active == "warning":
            if pct < LPG_CRITICAL_ENTRY_PCT:
                target, fault_code = "critical", "LPG_CRITICAL"
                summary = f"LPG reserve escalated to critical at {pct:.1f}%"
            elif pct >= LPG_LOW_RECOVERY_PCT:
                target = "normal"
                summary = f"LPG reserve recovered to {pct:.1f}% (>= 17%)"
        elif active == "critical":
            if pct >= LPG_LOW_RECOVERY_PCT:
                target = "normal"
                summary = f"LPG reserve recovered to {pct:.1f}% (>= 17%)"
            elif pct >= LPG_CRITICAL_RECOVERY_PCT:
                target, fault_code = "warning", "LPG_LOW"
                summary = f"LPG critical reserve cleared to warning at {pct:.1f}%"

        return self._apply_hysteresis_target(
            state,
            target=target,
            domain="lpg",
            fault_code=fault_code,
            fault_name=None,
            summary=summary,
            evidence={"lpg_percent": pct, "weight_valid": weight_valid},
            sample_identity=sample_identity,
            sample_at=ts,
        )

    def evaluate_gas_concentration(
        self,
        state: ConditionTrackerState,
        *,
        gas_info: Dict[str, Any],
        node_config: Optional[Dict[str, Any]],
        sample_identity: str,
        sample_at: datetime,
    ) -> Tuple[ConditionTrackerState, Optional[Dict[str, Any]]]:
        ts = _to_utc_datetime(sample_at) or datetime.now(timezone.utc)
        if self._is_stale_or_duplicate(state, sample_identity, ts):
            return state, None

        condition = str(gas_info.get("gas_condition") or "")
        ppm = finite_float(gas_info.get("estimated_ppm"))
        if condition not in ("normal", "warning", "critical"):
            next_state = ConditionTrackerState(**state.__dict__)
            next_state.pending_state = None
            next_state.pending_count = 0
            next_state.last_sample_identity = sample_identity
            next_state.last_sample_at = ts
            return next_state, None

        cfg = normalize_node_config(node_config)
        warn_recover = round(cfg["gas_warn_ppm"] * 0.85, 2)
        crit_recover = round(cfg["gas_crit_ppm"] * 0.85, 2)
        active = state.active_severity
        target: Optional[str] = None
        fault_code: Optional[str] = None
        ppm_text = f"{ppm:.1f} ppm" if ppm is not None else condition
        summary = f"Gas reading stabilized ({ppm_text})"

        if active is None:
            if condition == "critical":
                target, fault_code = "critical", "GAS_CRITICAL"
                summary = f"Critical LPG gas detected ({ppm_text})"
            elif condition == "warning":
                target, fault_code = "warning", "GAS_WARNING"
                summary = f"Elevated LPG gas detected ({ppm_text})"
        elif active == "warning":
            if condition == "critical":
                target, fault_code = "critical", "GAS_CRITICAL"
                summary = f"LPG gas escalated to critical ({ppm_text})"
            elif condition == "normal" and (ppm is None or ppm <= warn_recover):
                target = "normal"
                summary = f"Gas concentration recovered below {warn_recover} ppm ({ppm_text})"
        elif active == "critical":
            if condition == "normal" and (ppm is None or ppm <= warn_recover):
                target = "normal"
                summary = f"Critical gas alert recovered ({ppm_text})"
            elif condition == "warning" and (ppm is None or ppm <= crit_recover):
                target, fault_code = "warning", "GAS_WARNING"
                summary = f"Critical gas alert eased to warning ({ppm_text})"

        return self._apply_hysteresis_target(
            state,
            target=target,
            domain="lpg",
            fault_code=fault_code,
            fault_name=None,
            summary=summary,
            evidence={
                "gas_condition": condition,
                "estimated_ppm": ppm,
                "gas_warn_ppm": cfg["gas_warn_ppm"],
                "gas_crit_ppm": cfg["gas_crit_ppm"],
            },
            sample_identity=sample_identity,
            sample_at=ts,
        )

    def evaluate_high_temperature(
        self,
        state: ConditionTrackerState,
        *,
        temperature_c: Any,
        sample_identity: str,
        sample_at: datetime,
    ) -> Tuple[ConditionTrackerState, Optional[Dict[str, Any]]]:
        ts = _to_utc_datetime(sample_at) or datetime.now(timezone.utc)
        if self._is_stale_or_duplicate(state, sample_identity, ts):
            return state, None

        temp = finite_float(temperature_c)
        if temp is None or temp < -40.0 or temp > 125.0:
            next_state = ConditionTrackerState(**state.__dict__)
            next_state.pending_state = None
            next_state.pending_count = 0
            next_state.last_sample_identity = sample_identity
            next_state.last_sample_at = ts
            return next_state, None

        active = state.active_severity
        target: Optional[str] = None
        fault_code: Optional[str] = None
        summary = f"Enclosure temperature normalized at {temp:.1f} C"

        if active is None and temp > HIGH_TEMP_ENTRY_C:
            target, fault_code = "warning", "HIGH_TEMPERATURE"
            summary = f"Ambient enclosure temperature {temp:.1f} C exceeded {HIGH_TEMP_ENTRY_C:.0f} C"
        elif active is not None and temp < HIGH_TEMP_RECOVERY_C:
            target = "normal"
            summary = f"Ambient enclosure temperature recovered to {temp:.1f} C (< {HIGH_TEMP_RECOVERY_C:.0f} C)"

        return self._apply_hysteresis_target(
            state,
            target=target,
            domain="lpg",
            fault_code=fault_code,
            fault_name=None,
            summary=summary,
            evidence={"temperature_c": round(temp, 2)},
            sample_identity=sample_identity,
            sample_at=ts,
        )

    def evaluate_machine_fault(
        self,
        state: ConditionTrackerState,
        *,
        machine_state: str,
        fault_code: Optional[str],
        fault_name: Optional[str],
        sample_identity: str,
        sample_at: datetime,
    ) -> Tuple[ConditionTrackerState, Optional[Dict[str, Any]]]:
        """Track immediate latched machine fault episodes (ERROR -> open/update, non-ERROR -> cleared)."""
        ts = _to_utc_datetime(sample_at) or datetime.now(timezone.utc)
        if self._is_stale_or_duplicate(state, sample_identity, ts):
            return state, None

        next_state = ConditionTrackerState(**state.__dict__)
        next_state.pending_state = None
        next_state.pending_count = 0
        next_state.last_sample_identity = sample_identity
        next_state.last_sample_at = ts

        normalized_state = str(machine_state or "").strip().lower()
        clean_code = str(fault_code).strip()[:64] if fault_code else None
        clean_name = str(fault_name).strip()[:120] if fault_name else None

        if normalized_state == "error":
            resolved_code = clean_code or "ERR"
            if next_state.active_episode_id is None:
                episode_id = str(uuid.uuid4())
                next_state.active_episode_id = episode_id
                next_state.active_severity = "critical"
                next_state.active_fault_code = resolved_code
                next_state.active_fault_name = clean_name
                next_state.revision = 1
                label = f"{resolved_code} — {clean_name}" if clean_name else resolved_code
                return next_state, self._build_transition(
                    next_state,
                    domain="machine",
                    episode_id=episode_id,
                    transition_type="opened",
                    severity="critical",
                    fault_code=resolved_code,
                    fault_name=clean_name,
                    summary=f"Machine fault active: {label}",
                    revision=1,
                    evidence={"state": "error", "fault_code": resolved_code, "fault_name": clean_name},
                    occurred_at=ts,
                )
            if resolved_code != next_state.active_fault_code:
                next_state.active_fault_code = resolved_code
                next_state.active_fault_name = clean_name
                next_state.revision += 1
                label = f"{resolved_code} — {clean_name}" if clean_name else resolved_code
                return next_state, self._build_transition(
                    next_state,
                    domain="machine",
                    episode_id=next_state.active_episode_id,
                    transition_type="updated",
                    severity="critical",
                    fault_code=resolved_code,
                    fault_name=clean_name,
                    summary=f"Machine fault updated to {label}",
                    revision=next_state.revision,
                    evidence={"state": "error", "fault_code": resolved_code, "fault_name": clean_name},
                    occurred_at=ts,
                )
            return next_state, None

        if normalized_state in ("idle", "running", "paused") and next_state.active_episode_id is not None:
            episode_id = next_state.active_episode_id
            prev_code = next_state.active_fault_code
            prev_name = next_state.active_fault_name
            next_state.revision += 1
            next_state.active_episode_id = None
            next_state.active_severity = None
            next_state.active_fault_code = None
            next_state.active_fault_name = None
            return next_state, self._build_transition(
                next_state,
                domain="machine",
                episode_id=episode_id,
                transition_type="cleared",
                severity="critical",
                fault_code=prev_code,
                fault_name=prev_name,
                summary=f"Machine returned to {normalized_state}",
                revision=next_state.revision,
                evidence={"state": normalized_state, "cleared_fault_code": prev_code},
                occurred_at=ts,
            )

        return next_state, None
