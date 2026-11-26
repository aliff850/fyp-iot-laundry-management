"""Explainable fault catalog for machine and LPG/environment alerts.

Follows PRD FM-05: provisional commercial washer troubleshooting entries are
explicitly labeled as placeholder guides pending manufacturer documentation,
and unrecognized vendor codes never fabricate manufacturer explanations.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal

FaultDomain = Literal["machine", "lpg"]
FaultSourceStatus = Literal[
    "placeholder_washer_guide",
    "spinsense_safety_rule",
    "unverified_vendor_code",
]


@dataclass(frozen=True)
class FaultCatalogEntry:
    title: str
    source_status: FaultSourceStatus
    disclaimer: str
    plain_explanation: str
    likely_causes: tuple[str, ...]
    safety_precautions: str
    troubleshooting_steps: tuple[str, ...]


_MACHINE_ALIASES: dict[str, str] = {
    "SIM_WATER": "E01",
    "SIM_DOOR": "E03",
    "SIM_HEAT": "E04",
}

_MACHINE_ENTRIES: dict[str, FaultCatalogEntry] = {
    "E01": FaultCatalogEntry(
        title="Water Inlet Failure",
        source_status="placeholder_washer_guide",
        disclaimer="",
        plain_explanation=(
            "The washer did not detect the expected water fill level within the intake window."
        ),
        likely_causes=(
            "Wall supply shutoff valve closed or partially restricted",
            "Clogged inlet hose mesh strainer or sediment buildup",
            "Low branch water line pressure during peak demand",
            "Faulty inlet solenoid valve or blocked pressure-switch tube",
        ),
        safety_precautions=(
            "Verify the floor around power outlets is dry before inspecting rear hoses or valves."
        ),
        troubleshooting_steps=(
            "Confirm the cold and hot wall supply valves behind the washer are fully open.",
            "Check the inlet hose for kinks and clean the inlet strainer mesh if flow is restricted.",
            "Verify normal water pressure on adjacent washers in the same branch.",
            "Run a quick test cycle after restoring supply; escalate to machine maintenance if fill remains absent.",
        ),
    ),
    "E02": FaultCatalogEntry(
        title="Drain Pump Blockage",
        source_status="placeholder_washer_guide",
        disclaimer="",
        plain_explanation=(
            "Wash water failed to drain from the drum before the spin or rinse transition."
        ),
        likely_causes=(
            "Coins, hairpins, buttons, or heavy lint obstructing the coin trap",
            "Kinked or crushed rear drain hose",
            "Floor drain or standpipe backup slowing outflow",
            "Jammed or stalled drain pump impeller",
        ),
        safety_precautions=(
            "Do not force the door open if water sits above the lower gasket rim; "
            "place towels and a shallow pan beneath the service trap first."
        ),
        troubleshooting_steps=(
            "Place absorbent towels and a shallow tray beneath the lower front service flap.",
            "Drain residual water carefully via the emergency drain tube or loosened trap cap.",
            "Clear coins, lint, and debris from the pump filter housing and reseat the cap firmly.",
            "Inspect the rear drain hose for kinks, then run a short drain/spin test before reopening the washer.",
        ),
    ),
    "E03": FaultCatalogEntry(
        title="Door Lock Interlock Fault",
        source_status="placeholder_washer_guide",
        disclaimer="",
        plain_explanation=(
            "The door hatch interlock switch did not confirm a safe locked state before starting or spinning."
        ),
        likely_causes=(
            "Laundry edge caught between the door seal and glass preventing full latching",
            "Misaligned door striker hook or loose hinge",
            "Detergent buildup or moisture interfering with latch switch contacts",
            "Worn door interlock solenoid or harness connection",
        ),
        safety_precautions=(
            "Never bypass or wedge the door interlock switch while power is connected."
        ),
        troubleshooting_steps=(
            "Inspect the door gasket perimeter for trapped garments, towel corners, or debris.",
            "Close the hatch firmly until the mechanical latch engages cleanly.",
            "Check the door striker hook for bending or loose mounting screws.",
            "If the hatch still fails to lock or release cleanly, keep the unit out of service for machine maintenance.",
        ),
    ),
    "E04": FaultCatalogEntry(
        title="Heater / Thermal Cutoff",
        source_status="placeholder_washer_guide",
        disclaimer="",
        plain_explanation=(
            "Water heating did not progress normally or the high-limit thermal safety cutoff tripped."
        ),
        likely_causes=(
            "Tripped over-temperature thermal cutoff switch",
            "Heavy mineral scale insulating the heating element",
            "Faulty NTC temperature sensor or loose sensor wiring",
            "Open heating element circuit or heater relay failure",
        ),
        safety_precautions=(
            "Allow heated drum assemblies to cool and isolate breaker power before inspecting internal heating circuits."
        ),
        troubleshooting_steps=(
            "Allow 15 minutes for thermal cutoffs to cool if hot wash cycles ran back-to-back.",
            "Keep the washer isolated from customer use until inspected.",
            "Dispatch machine maintenance to test heater resistance, NTC temperature feedback, and resettable thermal cutouts.",
            "Do not clear the fault repeatedly if the trip returns during a heated wash.",
        ),
    ),
    "E05": FaultCatalogEntry(
        title="Drum Imbalance / Spin Trip",
        source_status="placeholder_washer_guide",
        disclaimer="",
        plain_explanation=(
            "Excessive drum vibration or an uneven heavy load tripped the high-speed spin protection switch."
        ),
        likely_causes=(
            "Single heavy blanket, rug, or soaked towel bunched on one side of the drum",
            "Washer loaded beyond its rated kg capacity",
            "Uneven floor leveling feet or loose base anchoring",
            "Worn suspension shocks/dampers or out-of-balance sensor fault",
        ),
        safety_precautions=(
            "Wait for the inner drum to stop completely and the door lock to release before opening the hatch."
        ),
        troubleshooting_steps=(
            "Open the hatch once unlocked and check for bunched heavy items or overloading.",
            "Redistribute wet laundry evenly around the drum (or split oversized loads).",
            "Verify all leveling feet sit firmly on the floor without rocking.",
            "Run a short spin test; if the trip recurs on a balanced light load, dispatch machine maintenance.",
        ),
    ),
    "SIM_INTERRUPTED": FaultCatalogEntry(
        title="Power / Boot Interruption",
        source_status="spinsense_safety_rule",
        disclaimer="",
        plain_explanation=(
            "The washer terminal rebooted or lost power while a wash cycle was active and entered a safe fault lock."
        ),
        likely_causes=(
            "Branch circuit breaker trip or momentary utility power dip",
            "Loose mains plug or internal power supply brownout",
            "Unexpected controller reset during an active cycle",
        ),
        safety_precautions=(
            "Check whether customer laundry remains locked in the drum and inspect power stability before resetting."
        ),
        troubleshooting_steps=(
            "Verify breaker and mains plug stability at the washer station.",
            "Check for any stranded customer laundry or active refund/re-wash request.",
            "Clear the fault only once power stability and drum state are confirmed.",
            "Escalate to facility electrical inspection if multiple machines report boot interruptions together.",
        ),
    ),
}

_LPG_ENTRIES: dict[str, FaultCatalogEntry] = {
    "LPG_LOW": FaultCatalogEntry(
        title="LPG Fuel Low Warning",
        source_status="spinsense_safety_rule",
        disclaimer="",
        plain_explanation=(
            "Usable LPG weight in the active cylinder dropped below the 15% warning threshold across consecutive valid samples."
        ),
        likely_causes=(
            "Active cylinder nearing depletion from normal dryer demand",
            "Standby cylinder not yet staged at the station",
        ),
        safety_precautions=(
            "Follow standard cylinder handling and leak-check procedures before opening any valve."
        ),
        troubleshooting_steps=(
            "Confirm a full standby cylinder is staged and inspected near the manifold.",
            "Monitor fuel consumption rate and plan swap before hitting critical reserve.",
            "Record the tank swap via the branch LPG workflow once switched.",
        ),
    ),
    "LPG_CRITICAL": FaultCatalogEntry(
        title="LPG Fuel Critical Reserve",
        source_status="spinsense_safety_rule",
        disclaimer="",
        plain_explanation=(
            "Usable LPG weight in the active cylinder fell below 5% across consecutive valid samples; dryer continuity is at immediate risk."
        ),
        likely_causes=(
            "Active cylinder nearly empty",
            "Pending tank swap overdue",
        ),
        safety_precautions=(
            "Close manifold and cylinder valves completely and verify ventilation before disconnecting the empty cylinder."
        ),
        troubleshooting_steps=(
            "Dispatch LPG maintenance immediately to swap in a verified standby cylinder.",
            "Record cylinder tare weight, net gas, and leak-check pass after swap.",
            "Confirm usable LPG recovers above 7% across fresh telemetry samples.",
        ),
    ),
    "GAS_WARNING": FaultCatalogEntry(
        title="Elevated LPG Gas in Cylinder Room",
        source_status="spinsense_safety_rule",
        disclaimer="",
        plain_explanation=(
            "MQ-6 gas sensor inside the enclosed fireproof LPG cylinder room detected concentration above the warning threshold."
        ),
        likely_causes=(
            "Brief residual gas pocket after cylinder coupling or valve operation",
            "Developing regulator, hose, or manifold fitting leak inside the enclosed LPG room",
            "Blocked or insufficient exhaust ventilation in the LPG cylinder enclosure",
        ),
        safety_precautions=(
            "FIRE & EXPLOSION HAZARD IF SUSTAINED: Do not enter the enclosed LPG cylinder room with any ignition source or operate electrical switches while gas readings remain elevated."
        ),
        troubleshooting_steps=(
            "Monitor live PPM remotely from outside the cylinder room to verify whether the reading drops rapidly below threshold.",
            "If readings remain elevated, treat as an active gas leak — shut off the external main LPG emergency valve if safely accessible and evacuate.",
            "Only after gas readings return safely below the danger threshold and the room has ventilated, have a qualified LPG technician soap-test all cylinder and manifold joints.",
        ),
    ),
    "GAS_CRITICAL": FaultCatalogEntry(
        title="Sustained / Critical LPG Leak — Fire & Explosion Hazard",
        source_status="spinsense_safety_rule",
        disclaimer="",
        plain_explanation=(
            "Critical or sustained elevated LPG gas is accumulating inside the enclosed fireproof cylinder room. Imminent fire and explosion danger."
        ),
        likely_causes=(
            "Active pressurized LPG leak from a cylinder valve, regulator, manifold, or dryer supply line",
            "Continuous heavier-than-air LPG accumulation trapped inside the enclosed fireproof room",
        ),
        safety_precautions=(
            "IMMINENT FIRE & EXPLOSION DANGER: Evacuate immediately. Do not enter the LPG cylinder room, flip light/power switches, or operate dryers."
        ),
        troubleshooting_steps=(
            "Evacuate all customers and staff from the laundry premises immediately.",
            "Isolate the main LPG supply only if an external emergency shutoff valve can be reached safely from outside the room.",
            "Call emergency fire services and a licensed LPG responder from a safe outdoor distance; do not re-enter until gas concentration clears safely below threshold.",
        ),
    ),
    "HIGH_TEMPERATURE": FaultCatalogEntry(
        title="Enclosure Over-Temperature Alert",
        source_status="spinsense_safety_rule",
        disclaimer="",
        plain_explanation=(
            "Ambient temperature inside the LPG cylinder room exceeded 45 C across consecutive valid samples."
        ),
        likely_causes=(
            "Cylinder room exhaust ventilation failure or blocked louver",
            "Excessive heat transfer from adjacent dryer exhaust ductwork",
        ),
        safety_precautions=(
            "Verify gas concentration is normal before approaching the enclosure; never expose LPG cylinders to elevated heat."
        ),
        troubleshooting_steps=(
            "Confirm ambient LPG PPM readings are normal from remote telemetry first.",
            "Check cylinder room exhaust louvers, fans, and adjacent dryer exhaust insulation.",
            "Wait for enclosure temperature to recover below 43 C across consecutive valid readings before resolving.",
        ),
    ),
}


def explain_fault(
    fault_code: str | None,
    *,
    domain: FaultDomain = "machine",
    fault_name_hint: str | None = None,
) -> dict[str, object] | None:
    """Return structured, honest troubleshooting guidance for a fault or condition code."""
    raw = str(fault_code or "").strip()
    if not raw:
        return None
    normalized = raw.upper()

    if domain == "lpg":
        entry = _LPG_ENTRIES.get(normalized)
    else:
        canonical = _MACHINE_ALIASES.get(normalized, normalized)
        entry = _MACHINE_ENTRIES.get(canonical)

    if entry is not None:
        result = asdict(entry)
        result["fault_code"] = raw
        result["likely_causes"] = list(entry.likely_causes)
        result["troubleshooting_steps"] = list(entry.troubleshooting_steps)
        return result

    hint = str(fault_name_hint or "").strip()
    fallback_title = hint or f"Unverified vendor code ({raw})"
    return {
        "fault_code": raw,
        "title": fallback_title,
        "source_status": "unverified_vendor_code",
        "disclaimer": "",
        "plain_explanation": (
            f"The device reported code '{raw}', which is not mapped in SpinSense's fault catalog."
        ),
        "likely_causes": [
            "Manufacturer-specific condition outside verified SpinSense documentation.",
        ],
        "safety_precautions": (
            "Keep the affected equipment out of customer service until checked by authorized maintenance staff."
        ),
        "troubleshooting_steps": [
            f"Record the exact code ('{raw}') and any customer observations or symptoms.",
            f"Consult the physical manufacturer service manual for vendor code '{raw}'.",
            "Dispatch maintenance for physical inspection before clearing the fault.",
        ],
    }
