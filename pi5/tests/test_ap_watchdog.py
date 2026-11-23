"""Unit tests for the Pi 5 stale AP station watchdog."""

from pathlib import Path
import sys

PI5_SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
if str(PI5_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(PI5_SCRIPTS))

import spinsense_ap_watchdog as watchdog  # noqa: E402


SAMPLE_STATION_DUMP = """Station 70:4b:ca:5d:d7:30 (on wlan0)
\tinactive time:\t4000 ms
\trx bytes:\t9075
\trx packets:\t41
\ttx bytes:\t70102
\ttx packets:\t868
\ttx failed:\t68
\tauthorized:\tyes
\tauthenticated:\tyes
\tassociated:\tyes
Station aa:bb:cc:dd:ee:ff (on wlan0)
\tinactive time:\t18000 ms
\trx bytes:\t12000
\ttx bytes:\t15000
\ttx failed:\t0
\tauthorized:\tyes
"""

# Real Linux kernel `ip -4 neigh show` omits `lladdr` once state hits FAILED.
SAMPLE_NEIGH = """10.42.0.57 FAILED
10.42.0.99 lladdr aa:bb:cc:dd:ee:ff STALE
"""

SAMPLE_LEASES = "1795415331 70:4b:ca:5d:d7:30 10.42.0.57 washer-sim-01 *\n"


def _fake_runner(iw_output: str, neigh_output: str, calls: list[list[str]]):
    def run(cmd: list[str]) -> tuple[int, str]:
        calls.append(cmd)
        if cmd[:4] == ["/usr/sbin/iw", "dev", "wlan0", "station"]:
            if cmd[4] == "dump":
                return 0, iw_output
            if cmd[4] == "del":
                return 0, ""
        if cmd[:4] == ["/usr/sbin/ip", "-4", "neigh", "show"]:
            return 0, neigh_output
        raise AssertionError(f"Unexpected command: {cmd}")

    return run


def test_parsers_extract_stations_neighbors_without_lladdr_and_leases():
    stations = watchdog.parse_station_dump(SAMPLE_STATION_DUMP)
    assert set(stations.keys()) == {"70:4b:ca:5d:d7:30", "aa:bb:cc:dd:ee:ff"}
    assert stations["70:4b:ca:5d:d7:30"].tx_failed == 68
    assert stations["70:4b:ca:5d:d7:30"].authorized is True

    by_mac, by_ip = watchdog.parse_ip_neighbors(SAMPLE_NEIGH)
    assert by_ip["10.42.0.57"].state == "FAILED"
    assert by_ip["10.42.0.57"].mac is None
    assert by_mac["aa:bb:cc:dd:ee:ff"][0].ip == "10.42.0.99"

    leases = watchdog.parse_dnsmasq_leases(SAMPLE_LEASES)
    assert leases == {"70:4b:ca:5d:d7:30": {"10.42.0.57"}}


def test_evicts_failed_neighbor_without_lladdr_via_lease_and_protects_live_idle_client():
    tracker = watchdog.WatchdogTracker()
    calls: list[list[str]] = []
    leases = watchdog.parse_dnsmasq_leases(SAMPLE_LEASES)
    # 10.42.0.57 is dead (ping False); 10.42.0.99 is idle phone/node that answers ping (True)
    probe = lambda _iface, ip: ip == "10.42.0.99"

    evicted = watchdog.evaluate_once(
        "wlan0",
        tracker,
        now=100.0,
        lease_ips=leases,
        runner=_fake_runner(SAMPLE_STATION_DUMP, SAMPLE_NEIGH, calls),
        probe_fn=probe,
    )

    assert evicted == ["70:4b:ca:5d:d7:30"]
    assert ["/usr/sbin/iw", "dev", "wlan0", "station", "del", "70:4b:ca:5d:d7:30"] in calls
    assert ["/usr/sbin/iw", "dev", "wlan0", "station", "del", "aa:bb:cc:dd:ee:ff"] not in calls
    assert tracker.strikes.get("aa:bb:cc:dd:ee:ff", 0) == 0


def test_inactive_without_failed_neigh_requires_two_strikes_and_respects_cooldown():
    dump = """Station 70:4b:ca:5d:d7:30 (on wlan0)
\tinactive time:\t16000 ms
\trx bytes:\t5541
\ttx bytes:\t56540
\ttx failed:\t88
\tauthorized:\tyes
"""
    neigh = "10.42.0.57 lladdr 70:4b:ca:5d:d7:30 STALE\n"
    tracker = watchdog.WatchdogTracker()
    calls: list[list[str]] = []
    runner = _fake_runner(dump, neigh, calls)
    probe = lambda _iface, _ip: False

    first = watchdog.evaluate_once("wlan0", tracker, now=10.0, lease_ips={}, runner=runner, probe_fn=probe)
    assert first == []

    second = watchdog.evaluate_once("wlan0", tracker, now=15.0, lease_ips={}, runner=runner, probe_fn=probe)
    assert second == ["70:4b:ca:5d:d7:30"]

    # Immediate reappearance inside 15s cooldown is not evicted on polls inside window
    third = watchdog.evaluate_once("wlan0", tracker, now=20.0, lease_ips={}, runner=runner, probe_fn=probe)
    fourth = watchdog.evaluate_once("wlan0", tracker, now=22.0, lease_ips={}, runner=runner, probe_fn=probe)
    assert third == []
    assert fourth == []

    # After cooldown expires (15 + 15 = 30), eviction resumes cleanly once 2 strikes accrue
    fifth = watchdog.evaluate_once("wlan0", tracker, now=31.0, lease_ips={}, runner=runner, probe_fn=probe)
    sixth = watchdog.evaluate_once("wlan0", tracker, now=36.0, lease_ips={}, runner=runner, probe_fn=probe)
    assert fifth == []
    assert sixth == ["70:4b:ca:5d:d7:30"]


def test_stalled_rx_bytes_with_low_inactive_ms_evicts_ghost_station_after_two_failed_probes():
    # Simulates brcmfmac keeping inactive_time < 5s while rx_bytes never advances.
    dump = """Station 70:4b:ca:5d:d7:30 (on wlan0)
\tinactive time:\t2000 ms
\trx bytes:\t9075
\ttx bytes:\t70102
\ttx failed:\t68
\tauthorized:\tyes
"""
    neigh = "10.42.0.57 lladdr 70:4b:ca:5d:d7:30 REACHABLE\n"
    tracker = watchdog.WatchdogTracker()
    calls: list[list[str]] = []
    runner = _fake_runner(dump, neigh, calls)
    probe = lambda _iface, _ip: False

    # Poll 1: baseline observation (prev is None)
    assert watchdog.evaluate_once("wlan0", tracker, now=0.0, lease_ips={}, runner=runner, probe_fn=probe) == []
    # Poll 2: stalled_polls=1 (< 2)
    assert watchdog.evaluate_once("wlan0", tracker, now=5.0, lease_ips={}, runner=runner, probe_fn=probe) == []
    # Poll 3: stalled_polls=2 -> strike 1
    assert watchdog.evaluate_once("wlan0", tracker, now=10.0, lease_ips={}, runner=runner, probe_fn=probe) == []
    # Poll 4: stalled_polls=3 -> strike 2 -> evicted!
    assert watchdog.evaluate_once("wlan0", tracker, now=15.0, lease_ips={}, runner=runner, probe_fn=probe) == ["70:4b:ca:5d:d7:30"]
