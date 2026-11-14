"""Durable, explicitly simulated machine state and command decisions."""
import json
import hashlib
import sqlite3
import time
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

BUSINESS_ZONE = ZoneInfo("Asia/Kuala_Lumpur")


def allocate_running_seconds(end, seconds):
    """Split an elapsed running interval at Malaysia calendar-day boundaries."""
    allocated = {}
    for elapsed in range(seconds, 0, -1):
        key = (end - timedelta(seconds=elapsed)).astimezone(BUSINESS_ZONE).date().isoformat()
        allocated[key] = allocated.get(key, 0) + 1
    return allocated


def utc_now():
    return datetime.now(timezone.utc)


def program_hash(settings):
    return hashlib.sha256(json.dumps(settings, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def defaults(category):
    if category not in ("washer", "dryer", "washer_dryer"):
        raise ValueError("Unsupported simulator category")
    return {"program_id": "standard", "price_myr": "6.00", "duration_seconds": 60,
            "target_temperature_c": 40, "water_level": None if category == "dryer" else "medium",
            "spin_rpm": None if category == "dryer" else 800}


def default_programs(category):
    standard = defaults(category)
    return {"standard": standard, "quick": {**standard, "program_id": "quick",
            "duration_seconds": 30, "price_myr": "4.00"}}


def validate_settings(category, settings):
    if not isinstance(settings, dict) or set(settings) not in (set(defaults(category)), set(defaults(category)) | {"name"}):
        raise ValueError("Incomplete settings")
    import re
    if not isinstance(settings["program_id"], str) or not re.fullmatch(r"(?:quick|standard|p_[a-f0-9]{12})", settings["program_id"]):
        raise ValueError("Unsupported program")
    if "name" in settings and (not isinstance(settings["name"], str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 -]{0,17}", settings["name"])):
        raise ValueError("Invalid program name")
    if settings["program_id"].startswith("p_") and not settings.get("name"):
        raise ValueError("Custom program name required")
    try:
        price = Decimal(str(settings["price_myr"]))
        if not price.is_finite() or not 0 <= price <= 999 or price.as_tuple().exponent < -2:
            raise ValueError()
    except (InvalidOperation, ValueError) as exc:
        raise ValueError("Invalid price") from exc
    for key, low, high in (("duration_seconds", 1, 7200), ("target_temperature_c", 0, 90)):
        value = settings[key]
        if type(value) is not int or not low <= value <= high:
            raise ValueError("Invalid " + key)
    if category == "dryer":
        if settings["water_level"] is not None or settings["spin_rpm"] is not None:
            raise ValueError("Dry-only machine has no wash settings")
    else:
        if settings["water_level"] not in ("low", "medium", "high"):
            raise ValueError("Invalid water level")
        rpm = settings["spin_rpm"]
        if type(rpm) is not int or not 0 <= rpm <= 1200:
            raise ValueError("Invalid spin speed")
    return {**settings, "price_myr": str(price.quantize(Decimal("0.01")))}


class Machine:
    def __init__(self, filename, source_id, category):
        self.source_id = source_id
        self.category = category
        self.db = sqlite3.connect(filename, check_same_thread=False)
        self.db.execute("CREATE TABLE IF NOT EXISTS machine_state (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)")
        self.db.execute("CREATE TABLE IF NOT EXISTS command_results (command_id TEXT PRIMARY KEY, payload TEXT NOT NULL)")
        self.db.execute("CREATE TABLE IF NOT EXISTS cycle_events (cycle_id TEXT PRIMARY KEY, payload TEXT NOT NULL, delivered INTEGER NOT NULL DEFAULT 0)")
        row = self.db.execute("SELECT payload FROM machine_state WHERE id=1").fetchone()
        self.state = json.loads(row[0]) if row else {"source_id": source_id, "category": category,
            "state": "IDLE", "fault_code": None,
            "remaining_seconds": 0, "settings": defaults(category), "programs": default_programs(category),
            "active_cycle": None, "sequence": 0}
        # Preserve the prior single-settings installation without inventing old cycles.
        self.state.setdefault("programs", default_programs(category))
        self.state["programs"][self.state["settings"]["program_id"]] = self.state["settings"]
        self.state.setdefault("active_cycle", None)
        if self.state.get("source_id") != source_id or self.state.get("category") != category:
            raise ValueError("Simulator state belongs to a different device")
        if self.state["state"] == "RUNNING":
            self._finish_cycle("interrupted")
            self.state.update(state="ERROR", fault_code="SIM_INTERRUPTED")
        self.save()

    def save(self):
        with self.db:
            self.db.execute("INSERT OR REPLACE INTO machine_state VALUES (1, ?)", (json.dumps(self.state),))

    def tick(self, seconds=1, now=None):
        if self.state["state"] == "RUNNING" and seconds > 0:
            elapsed = min(seconds, self.state["remaining_seconds"])
            self.state["remaining_seconds"] -= elapsed
            if self.state["active_cycle"]:
                cycle = self.state["active_cycle"]
                cycle["running_seconds"] += elapsed
                by_day = cycle.setdefault("running_by_day", {})
                for day, amount in allocate_running_seconds(now or utc_now(), elapsed).items():
                    by_day[day] = by_day.get(day, 0) + amount
            if not self.state["remaining_seconds"]:
                self._finish_cycle("completed")
                self.state["state"] = "IDLE"
            self.save()

    def _finish_cycle(self, outcome):
        cycle = self.state.get("active_cycle")
        if cycle is None:
            return
        cycle.setdefault("running_by_day", {utc_now().astimezone(BUSINESS_ZONE).date().isoformat(): cycle["running_seconds"]})
        event = {**cycle, "outcome": outcome, "finished_at": utc_now().isoformat(),
                 "source_id": self.source_id, "category": self.category, "source_kind": "simulated"}
        self.db.execute("INSERT OR IGNORE INTO cycle_events (cycle_id, payload) VALUES (?, ?)",
                        (cycle["cycle_id"], json.dumps(event)))
        self.state["active_cycle"] = None

    def pending_events(self):
        return [json.loads(row[0]) for row in self.db.execute(
            "SELECT payload FROM cycle_events WHERE delivered=0 ORDER BY rowid")]

    def mark_delivered(self, cycle_id):
        with self.db:
            self.db.execute("UPDATE cycle_events SET delivered=1 WHERE cycle_id=?", (cycle_id,))

    def execute(self, command):
        if not isinstance(command, dict):
            return None
        cid = command.get("command_id")
        try:
            uuid.UUID(cid)
        except (ValueError, TypeError, AttributeError):
            return None
        old = self.db.execute("SELECT payload FROM command_results WHERE command_id=?", (cid,)).fetchone()
        if old:
            return json.loads(old[0])
        reason = None
        try:
            deadline = datetime.fromisoformat(command["expires_at"].replace("Z", "+00:00"))
            if deadline.tzinfo is None or utc_now() >= deadline:
                reason = "expired"
        except (KeyError, TypeError, ValueError, AttributeError):
            reason = "invalid_expiry"
        if command.get("source_id") != self.source_id:
            reason = "wrong_target"
        if reason is None:
            state = self.state["state"]
            action = command.get("action")
            if action == "start" and state == "IDLE":
                arguments = command.get("arguments") or {}
                if not isinstance(arguments, dict):
                    reason = "invalid_arguments"
                elif arguments:
                    program = self.state["programs"].get(arguments.get("program_id"))
                    if set(arguments) != {"program_id", "settings_hash"} or not program or arguments.get("settings_hash") != program_hash(program):
                        reason = "program_changed"
                    else:
                        self.state["settings"] = program
                if reason is None:
                    settings = self.state["settings"]
                    self.state["active_cycle"] = {"cycle_id": str(uuid.uuid4()),
                    "program_id": settings["program_id"], "price_myr": settings["price_myr"],
                    "target_seconds": settings["duration_seconds"], "running_seconds": 0,
                    "running_by_day": {},
                    "started_at": utc_now().isoformat()}
                    self.state.update(state="RUNNING", remaining_seconds=settings["duration_seconds"])
            elif action == "pause" and state == "RUNNING":
                self.state["state"] = "PAUSED"
            elif action == "resume" and state == "PAUSED":
                self.state["state"] = "RUNNING"
            elif action == "stop" and state in ("RUNNING", "PAUSED"):
                self._finish_cycle("stopped")
                self.state.update(state="IDLE", remaining_seconds=0)
            elif action == "set_settings" and state == "IDLE":
                try:
                    incoming = command.get("arguments") or {}
                    is_create = incoming.get("create", False)
                    if type(is_create) is not bool:
                        raise ValueError("Invalid program operation")
                    settings = validate_settings(self.category, {key: value for key, value in incoming.items() if key != "create"})
                    if is_create and settings["program_id"] in self.state["programs"]:
                        raise ValueError("Program already exists")
                    if not is_create and settings["program_id"] not in self.state["programs"]:
                        raise ValueError("Program not found")
                    if settings["program_id"] not in self.state["programs"] and len(self.state["programs"]) >= 6:
                        raise ValueError("Program limit reached")
                    self.state["programs"][settings["program_id"]] = settings
                    self.state["settings"] = settings
                except ValueError as exc:
                    reason = str(exc)
            elif action == "inject_fault" and state in ("IDLE", "RUNNING", "PAUSED"):
                args = command.get("arguments")
                fault = args.get("fault_code") if isinstance(args, dict) else None
                allowed = {"SIM_DOOR", "SIM_HEAT"}
                if self.category != "dryer":
                    allowed.add("SIM_WATER")
                if fault in allowed:
                    self._finish_cycle("faulted")
                    self.state.update(state="ERROR", fault_code=fault)
                else:
                    reason = "unsupported_fault"
            elif action == "clear_fault" and state == "ERROR":
                self.state.update(state="IDLE", fault_code=None, remaining_seconds=0)
            else:
                reason = "invalid_transition"
        result = {"command_id": cid, "source_id": self.source_id,
                  "status": "rejected" if reason else "applied", "reason": reason,
                  "state": self.state["state"], "applied_at": utc_now().isoformat()}
        with self.db:
            self.db.execute("INSERT OR REPLACE INTO machine_state VALUES (1, ?)", (json.dumps(self.state),))
            self.db.execute("INSERT INTO command_results VALUES (?, ?)", (cid, json.dumps(result)))
        return result

    def sample(self, boot_id):
        self.state["sequence"] += 1
        self.save()
        return {"device_id": self.source_id, "boot_id": boot_id,
                "recorded_at": utc_now().isoformat(), "source_kind": "simulated",
                "quality": {"simulation": True, "state_valid": True},
                "data": {"sequence": self.state["sequence"], "category": self.category,
                         "state": self.state["state"].lower(), "fault_code": self.state["fault_code"],
                         "phase": "simulated_cycle" if self.state["state"] in ("RUNNING", "PAUSED") else None,
                         "remaining_seconds": self.state["remaining_seconds"],
                         "settings": self.state["settings"], "programs": self.state["programs"],
                         "simulation": True}}
