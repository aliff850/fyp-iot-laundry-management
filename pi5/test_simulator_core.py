import tempfile
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from pi5.simulator_core import Machine, allocate_running_seconds, defaults, validate_settings


class SimulatorCoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "machine.sqlite"
        self.machine = Machine(self.path, "washer-sim-01", "washer")

    def tearDown(self):
        self.machine.db.close()
        self.temp.cleanup()

    def command(self, action, arguments=None, command_id=None, seconds=30):
        return {"command_id": command_id or str(uuid.uuid4()), "source_id": "washer-sim-01",
                "action": action, "arguments": arguments or {},
                "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat()}

    def test_cycle_and_duplicate(self):
        start = self.command("start")
        self.assertEqual(self.machine.execute(start)["status"], "applied")
        self.assertEqual(self.machine.execute(start)["status"], "applied")
        self.assertEqual(self.machine.execute(self.command("pause"))["status"], "applied")
        self.machine.tick(10)
        self.assertEqual(self.machine.state["remaining_seconds"], 60)
        self.assertEqual(self.machine.execute(self.command("resume"))["status"], "applied")
        self.machine.tick(60)
        self.assertEqual(self.machine.state["state"], "IDLE")
        events = self.machine.pending_events()
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["outcome"], "completed")
        self.assertEqual(events[0]["running_seconds"], 60)
        self.assertEqual(events[0]["price_myr"], "6.00")
        self.machine.mark_delivered(events[0]["cycle_id"])
        self.assertEqual(self.machine.pending_events(), [])

    def test_program_snapshot_and_noncompleted_attempt(self):
        quick = {**defaults("washer"), "program_id": "quick", "duration_seconds": 8, "price_myr": "3.25"}
        self.machine.execute(self.command("set_settings", quick))
        self.machine.execute(self.command("start"))
        self.machine.tick(3)
        self.machine.execute(self.command("pause"))
        self.machine.tick(5)
        self.machine.execute(self.command("stop"))
        event = self.machine.pending_events()[0]
        self.assertEqual((event["outcome"], event["running_seconds"], event["price_myr"]), ("stopped", 3, "3.25"))
        self.assertEqual(sum(event["running_by_day"].values()), 3)
        self.assertEqual(self.machine.state["programs"]["standard"]["price_myr"], "6.00")

    def test_settings_fault_and_restart(self):
        settings = {**defaults("washer"), "duration_seconds": 7, "price_myr": "8.50"}
        self.assertEqual(self.machine.execute(self.command("set_settings", settings))["status"], "applied")
        self.assertEqual(self.machine.execute(self.command("inject_fault", {"fault_code": "SIM_WATER"}))["state"], "ERROR")
        self.assertEqual(self.machine.execute(self.command("start"))["status"], "rejected")
        self.assertEqual(self.machine.execute(self.command("clear_fault"))["status"], "applied")
        self.machine.execute(self.command("start"))
        recovered = Machine(self.path, "washer-sim-01", "washer")
        self.assertEqual(recovered.state["fault_code"], "SIM_INTERRUPTED")
        self.assertEqual(recovered.state["settings"]["price_myr"], "8.50")
        self.assertEqual(recovered.pending_events()[0]["outcome"], "interrupted")
        recovered.db.close()

    def test_faulted_cycle_keeps_partial_running_time(self):
        self.machine.execute(self.command("start"))
        self.machine.tick(7)
        self.machine.execute(self.command("inject_fault", {"fault_code": "SIM_WATER"}))
        event = self.machine.pending_events()[0]
        self.assertEqual((event["outcome"], event["running_seconds"]), ("faulted", 7))
        self.assertEqual(sum(event["running_by_day"].values()), 7)

    def test_running_time_splits_at_malaysia_midnight(self):
        end = datetime(2026, 11, 12, 16, 0, 3, tzinfo=timezone.utc)
        self.assertEqual(allocate_running_seconds(end, 5), {"2026-11-12": 2, "2026-11-13": 3})

    def test_stopped_event_keeps_daily_runtime_without_completion(self):
        self.machine.execute(self.command("start"))
        self.machine.tick(5, now=datetime(2026, 11, 12, 16, 0, 3, tzinfo=timezone.utc))
        self.machine.execute(self.command("stop"))
        event = self.machine.pending_events()[0]
        self.assertEqual(event["outcome"], "stopped")
        self.assertEqual(event["running_seconds"], 5)
        self.assertEqual(event["running_by_day"], {"2026-11-12": 2, "2026-11-13": 3})
        self.machine.execute(self.command("clear_fault"))
        self.assertEqual(self.machine.state["state"], "IDLE")

    def test_expiry_and_type_rules(self):
        self.assertEqual(self.machine.execute(self.command("start", seconds=-1))["reason"], "expired")
        self.assertEqual(self.machine.state["state"], "IDLE")
        with self.assertRaises(ValueError):
            validate_settings("dryer", defaults("washer"))
        dryer = Machine(Path(self.temp.name) / "dryer.sqlite", "dryer-1", "dryer")
        self.assertEqual(dryer.state["state"], "IDLE")
        dryer.db.close()

    def test_custom_program_limit_and_saved_rate(self):
        for index in range(4):
            program = {**defaults("washer"), "program_id": f"p_{index:012x}",
                       "name": f"Custom {index}", "price_myr": "7.50"}
            self.assertEqual(self.machine.execute(self.command("set_settings", {**program, "create": True}))["status"], "applied")
        overflow = {**defaults("washer"), "program_id": "p_000000000004", "name": "Extra"}
        self.assertEqual(self.machine.execute(self.command("set_settings", {**overflow, "create": True}))["status"], "rejected")
        self.assertEqual(len(self.machine.state["programs"]), 6)
        selected = self.machine.state["programs"]["p_000000000000"]
        from pi5.simulator_core import program_hash
        self.assertEqual(self.machine.execute(self.command("start", {
            "program_id": selected["program_id"], "settings_hash": program_hash(selected)}))["status"], "applied")
        self.machine.tick(60)
        self.assertEqual(self.machine.pending_events()[0]["price_myr"], "7.50")


if __name__ == "__main__":
    unittest.main()
