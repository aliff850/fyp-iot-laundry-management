"""Evict ghosted brcmfmac AP stations after abrupt client power-off.

Works alongside hostapd (or NetworkManager AP mode) on Pi 5 wlan0 by
correlating `iw station dump`, kernel IPv4 neighbor state (including
`FAILED` rows that omit `lladdr`), `dnsmasq.leases`, and active ICMP
probes before calling `iw dev <iface> station del`.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field
import logging
from pathlib import Path
import re
import signal
import subprocess
import sys
import time
from typing import Callable


LOGGER = logging.getLogger("spinsense-ap-watchdog")

DEFAULT_LEASE_PATHS = (
    Path("/var/lib/misc/dnsmasq.leases"),
    Path("/var/lib/NetworkManager/dnsmasq-wlan0.leases"),
)

_STATION_HEADER_RE = re.compile(r"^Station\s+([0-9a-fA-F:]{17})\s+\(on\s+\S+\)")
_INT_FIELD_RE = re.compile(r"^\s*(inactive time|rx bytes|tx bytes|tx failed):\s+(\d+)")
_AUTH_FIELD_RE = re.compile(r"^\s*authorized:\s+(yes|no)")
_NEIGH_RE = re.compile(
    r"^(\d+\.\d+\.\d+\.\d+)\s+(?:lladdr\s+([0-9a-fA-F:]{17})\s+)?(REACHABLE|STALE|DELAY|PROBE|FAILED|INCOMPLETE|PERMANENT|NOARP)\s*$"
)


@dataclass(frozen=True)
class StationStats:
    mac: str
    inactive_ms: int = 0
    rx_bytes: int = 0
    tx_bytes: int = 0
    tx_failed: int = 0
    authorized: bool = True


@dataclass(frozen=True)
class NeighborEntry:
    ip: str
    mac: str | None
    state: str


@dataclass
class WatchdogTracker:
    prev_stations: dict[str, StationStats] = field(default_factory=dict)
    stalled_rx_polls: dict[str, int] = field(default_factory=dict)
    strikes: dict[str, int] = field(default_factory=dict)
    last_evicted_at: dict[str, float] = field(default_factory=dict)
    known_ips_by_mac: dict[str, set[str]] = field(default_factory=dict)


def parse_station_dump(output: str) -> dict[str, StationStats]:
    """Parse `/usr/sbin/iw dev <iface> station dump` output keyed by lowercase MAC."""
    stations: dict[str, StationStats] = {}
    current_mac: str | None = None
    fields: dict[str, int | bool] = {}

    def flush() -> None:
        if current_mac is None:
            return
        stations[current_mac] = StationStats(
            mac=current_mac,
            inactive_ms=int(fields.get("inactive time", 0)),
            rx_bytes=int(fields.get("rx bytes", 0)),
            tx_bytes=int(fields.get("tx bytes", 0)),
            tx_failed=int(fields.get("tx failed", 0)),
            authorized=bool(fields.get("authorized", True)),
        )

    for raw_line in output.splitlines():
        header = _STATION_HEADER_RE.match(raw_line)
        if header:
            flush()
            current_mac = header.group(1).lower()
            fields = {}
            continue
        if current_mac is None:
            continue
        int_match = _INT_FIELD_RE.match(raw_line)
        if int_match:
            fields[int_match.group(1)] = int(int_match.group(2))
            continue
        auth_match = _AUTH_FIELD_RE.match(raw_line)
        if auth_match:
            fields["authorized"] = auth_match.group(1) == "yes"

    flush()
    return stations


def parse_ip_neighbors(output: str) -> tuple[dict[str, list[NeighborEntry]], dict[str, NeighborEntry]]:
    """Parse `ip -4 neigh show dev <iface>` into MAC-indexed and IP-indexed dicts.

    Linux omits `lladdr <mac>` when a neighbor enters `FAILED` state (e.g.
    `10.42.0.57 FAILED`), so callers need `by_ip` to correlate via DHCP leases
    or previously observed MAC->IP mappings.
    """
    by_mac: dict[str, list[NeighborEntry]] = {}
    by_ip: dict[str, NeighborEntry] = {}
    for line in output.splitlines():
        match = _NEIGH_RE.match(line.strip())
        if not match:
            continue
        ip, raw_mac, state = match.group(1), match.group(2), match.group(3)
        mac = raw_mac.lower() if raw_mac else None
        entry = NeighborEntry(ip=ip, mac=mac, state=state)
        by_ip[ip] = entry
        if mac:
            by_mac.setdefault(mac, []).append(entry)
    return by_mac, by_ip


def parse_dnsmasq_leases(text: str) -> dict[str, set[str]]:
    """Parse dnsmasq lease lines (`<ts> <mac> <ip> ...`) into `{mac: {ips}}`."""
    mapping: dict[str, set[str]] = {}
    for raw_line in text.splitlines():
        parts = raw_line.strip().split()
        if len(parts) < 3:
            continue
        mac = parts[1].lower()
        ip = parts[2]
        if re.fullmatch(r"[0-9a-f]{2}(?::[0-9a-f]{2}){5}", mac) and re.fullmatch(
            r"\d+\.\d+\.\d+\.\d+", ip
        ):
            mapping.setdefault(mac, set()).add(ip)
    return mapping


def load_lease_ips(lease_paths: tuple[Path, ...] = DEFAULT_LEASE_PATHS) -> dict[str, set[str]]:
    """Load current DHCP lease MAC->IP mappings from readable dnsmasq lease files."""
    combined: dict[str, set[str]] = {}
    for path in lease_paths:
        try:
            if path.is_file():
                for mac, ips in parse_dnsmasq_leases(path.read_text(encoding="utf-8", errors="ignore")).items():
                    combined.setdefault(mac, set()).update(ips)
        except OSError:
            continue
    return combined


def _run_command(args: list[str], timeout: float = 3.0) -> tuple[int, str]:
    completed = subprocess.run(
        args,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )
    return completed.returncode, completed.stdout


def probe_ipv4(iface: str, ip: str, runner: Callable[[list[str]], tuple[int, str]] | None = None) -> bool:
    """Return True when a targeted 1s ping on `iface` gets a reply."""
    exec_fn = runner or (lambda cmd: _run_command(cmd, timeout=2.5))
    code, _ = exec_fn(["ping", "-I", iface, "-c", "1", "-W", "1", ip])
    return code == 0


def evaluate_once(
    iface: str,
    tracker: WatchdogTracker,
    *,
    now: float | None = None,
    inactive_threshold_ms: int = 15000,
    cooldown_seconds: float = 15.0,
    dry_run: bool = False,
    iw_bin: str = "/usr/sbin/iw",
    ip_bin: str = "/usr/sbin/ip",
    lease_ips: dict[str, set[str]] | None = None,
    runner: Callable[[list[str]], tuple[int, str]] | None = None,
    probe_fn: Callable[[str, str], bool] | None = None,
) -> list[str]:
    """Inspect current AP stations and return MAC addresses evicted this cycle."""
    current_time = time.monotonic() if now is None else now
    exec_fn = runner or _run_command
    probe = probe_fn or (lambda dev, addr: probe_ipv4(dev, addr, exec_fn))

    code_iw, iw_out = exec_fn([iw_bin, "dev", iface, "station", "dump"])
    if code_iw != 0:
        LOGGER.warning("station dump failed on %s (exit=%s)", iface, code_iw)
        return []

    code_ip, neigh_out = exec_fn([ip_bin, "-4", "neigh", "show", "dev", iface])
    by_mac_neigh, by_ip_neigh = parse_ip_neighbors(neigh_out) if code_ip == 0 else ({}, {})
    leases = load_lease_ips() if lease_ips is None else lease_ips
    stations = parse_station_dump(iw_out)

    # Clear per-session tracking state for stations that have cleanly departed.
    for departed_mac in list(tracker.prev_stations.keys()):
        if departed_mac not in stations:
            tracker.prev_stations.pop(departed_mac, None)
            tracker.stalled_rx_polls.pop(departed_mac, None)
            tracker.strikes.pop(departed_mac, None)

    evicted: list[str] = []
    for mac, sta in stations.items():
        prev = tracker.prev_stations.get(mac)
        mac_neigh = by_mac_neigh.get(mac, [])

        # Remember observed MAC->IP pairs even after Linux clears lladdr on FAILED.
        known_ips = tracker.known_ips_by_mac.setdefault(mac, set())
        for entry in mac_neigh:
            known_ips.add(entry.ip)
        for ip in leases.get(mac, ()):
            known_ips.add(ip)

        rx_grew = prev is not None and sta.rx_bytes > prev.rx_bytes
        tx_fail_grew = prev is not None and sta.tx_failed > prev.tx_failed

        if rx_grew:
            tracker.stalled_rx_polls[mac] = 0
            tracker.strikes[mac] = 0
            tracker.prev_stations[mac] = sta
            continue

        stalled_polls = tracker.stalled_rx_polls.get(mac, 0) + (1 if prev is not None else 0)
        tracker.stalled_rx_polls[mac] = stalled_polls

        ip_targets = sorted(known_ips)
        has_failed_neigh = any(entry.state == "FAILED" for entry in mac_neigh) or any(
            by_ip_neigh.get(ip) is not None and by_ip_neigh[ip].state == "FAILED"
            for ip in ip_targets
        )

        suspect_reason: str | None = None
        if has_failed_neigh:
            suspect_reason = "neighbor_failed"
        elif tx_fail_grew and stalled_polls >= 1:
            suspect_reason = "tx_failed_without_rx"
        elif sta.inactive_ms >= inactive_threshold_ms:
            suspect_reason = f"inactive_{sta.inactive_ms}ms"
        elif ip_targets and stalled_polls >= 2:
            suspect_reason = "stalled_rx_unreachable"
        elif not sta.authorized and prev is not None and sta.inactive_ms >= 10000:
            suspect_reason = "stuck_unauthorized"

        if suspect_reason is None:
            tracker.strikes[mac] = 0
            tracker.prev_stations[mac] = sta
            continue

        last_evict = tracker.last_evicted_at.get(mac)
        if last_evict is not None and (current_time - last_evict) < cooldown_seconds:
            tracker.strikes[mac] = 0
            tracker.prev_stations[mac] = sta
            continue

        # Confirm with an active L3 probe if any known IPv4 target exists.
        if ip_targets and any(probe(iface, ip) for ip in ip_targets):
            tracker.strikes[mac] = 0
            tracker.stalled_rx_polls[mac] = 0
            tracker.prev_stations[mac] = sta
            continue

        strikes = tracker.strikes.get(mac, 0) + 1
        tracker.strikes[mac] = strikes
        required_strikes = 1 if has_failed_neigh else 2
        if strikes < required_strikes:
            tracker.prev_stations[mac] = sta
            continue

        if not dry_run:
            del_code, _ = exec_fn([iw_bin, "dev", iface, "station", "del", mac])
            if del_code != 0:
                LOGGER.warning("failed deleting stale station %s on %s (exit=%s)", mac, iface, del_code)
                tracker.prev_stations[mac] = sta
                continue

        LOGGER.info("evicted stale %s station %s (reason=%s, dry_run=%s)", iface, mac, suspect_reason, dry_run)
        tracker.last_evicted_at[mac] = current_time
        tracker.strikes.pop(mac, None)
        tracker.stalled_rx_polls.pop(mac, None)
        tracker.prev_stations.pop(mac, None)
        evicted.append(mac)

    return evicted


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Purge ghosted stations from a Raspberry Pi Wi-Fi AP.")
    parser.add_argument("--iface", default="wlan0", help="AP network interface (default: wlan0)")
    parser.add_argument("--interval", type=float, default=5.0, help="Poll interval seconds (default: 5)")
    parser.add_argument("--inactive-ms", type=int, default=15000, help="Inactive threshold ms before probe (default: 15000)")
    parser.add_argument("--cooldown", type=float, default=15.0, help="Per-MAC eviction cooldown seconds (default: 15)")
    parser.add_argument("--once", action="store_true", help="Run a single inspection pass and exit")
    parser.add_argument("--dry-run", action="store_true", help="Log stale stations without calling iw station del")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", force=True)

    running = True

    def stop_handler(_signum: int, _frame: object) -> None:
        nonlocal running
        running = False

    signal.signal(signal.SIGINT, stop_handler)
    signal.signal(signal.SIGTERM, stop_handler)

    tracker = WatchdogTracker()
    while running:
        evaluate_once(
            args.iface,
            tracker,
            inactive_threshold_ms=args.inactive_ms,
            cooldown_seconds=args.cooldown,
            dry_run=args.dry_run,
        )
        if args.once:
            break
        time.sleep(max(1.0, args.interval))
    return 0


if __name__ == "__main__":
    sys.exit(main())
