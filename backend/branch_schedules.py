"""Weekly opening schedule validation and timezone-aware open-now evaluation."""

from datetime import datetime, timezone
import re
from typing import Any
from zoneinfo import ZoneInfo

WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
TIME_HHMM = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")
DAILY_RANGE_HHMM = re.compile(
    r"^\s*(?:daily\s+)?([01]\d|2[0-3]):([0-5]\d)\s*[-–—]\s*((?:[01]\d|2[0-3]):[0-5]\d|24:00)\s*$",
    re.IGNORECASE,
)
ALWAYS_OPEN_LABELS = frozenset({
    "24 hours",
    "24 hour",
    "24 hrs",
    "24 hr",
    "24h",
    "24/7",
    "24 hours / always open",
    "always open",
    "open 24 hours",
})


def parse_hhmm_minutes(value: str, *, allow_2400: bool = False) -> int | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if allow_2400 and text == "24:00":
        return 24 * 60
    match = TIME_HHMM.fullmatch(text)
    if not match:
        return None
    return int(match.group(1)) * 60 + int(match.group(2))


def validate_weekly_hours(raw: Any) -> dict[str, list[dict[str, str]]] | None:
    """Validate and normalize structured weekly opening intervals keyed by mon..sun."""
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise ValueError("Weekly hours must be a weekday schedule object")

    normalized: dict[str, list[dict[str, str]]] = {}
    for day in WEEKDAYS:
        intervals = raw.get(day, [])
        if intervals is None:
            intervals = []
        if not isinstance(intervals, list) or len(intervals) > 4:
            raise ValueError(f"Invalid schedule intervals for {day}")
        day_out: list[dict[str, str]] = []
        for entry in intervals:
            if not isinstance(entry, dict):
                raise ValueError(f"Invalid interval entry for {day}")
            open_str = str(entry.get("open", "")).strip()
            close_str = str(entry.get("close", "")).strip()
            open_min = parse_hhmm_minutes(open_str, allow_2400=False)
            close_min = parse_hhmm_minutes(close_str, allow_2400=True)
            if open_min is None or close_min is None:
                raise ValueError(f"Times for {day} must use HH:MM format")
            if open_min == close_min:
                raise ValueError(f"Opening and closing time for {day} cannot be identical")
            day_out.append({"open": open_str, "close": close_str})
        normalized[day] = day_out
    return normalized


def infer_weekly_hours_from_opening_hours(
    opening_hours: str | None,
) -> dict[str, list[dict[str, str]]] | None:
    """Derive a regular daily schedule from unambiguous 24h or HH:MM-HH:MM opening_hours text."""
    if not isinstance(opening_hours, str):
        return None
    normalized_text = " ".join(opening_hours.strip().lower().split())
    if not normalized_text:
        return None

    if normalized_text in ALWAYS_OPEN_LABELS:
        interval = {"open": "00:00", "close": "24:00"}
        return {day: [dict(interval)] for day in WEEKDAYS}

    match = DAILY_RANGE_HHMM.fullmatch(opening_hours.strip())
    if not match:
        return None

    open_str = f"{match.group(1)}:{match.group(2)}"
    close_str = match.group(3)
    if open_str == "00:00" and close_str in ("00:00", "24:00"):
        interval = {"open": "00:00", "close": "24:00"}
    elif open_str == close_str:
        return None
    else:
        interval = {"open": open_str, "close": close_str}
    return {day: [dict(interval)] for day in WEEKDAYS}


def compute_open_now(
    weekly_hours: dict[str, Any] | None,
    timezone_name: str | None,
    service_status: str,
    now_utc: datetime | None = None,
    opening_hours: str | None = None,
) -> tuple[bool | None, bool | None, str]:
    """Return (effective_open_now, regular_hours_open_now, status_reason) in branch timezone."""
    current = now_utc or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)

    effective_weekly = (
        weekly_hours
        if isinstance(weekly_hours, dict)
        else infer_weekly_hours_from_opening_hours(opening_hours)
    )

    regular_open: bool | None = None
    if isinstance(effective_weekly, dict):
        try:
            validated = validate_weekly_hours(effective_weekly)
        except ValueError:
            validated = None
        if validated is not None:
            try:
                zone = ZoneInfo((timezone_name or "Asia/Kuala_Lumpur").strip() or "Asia/Kuala_Lumpur")
            except Exception:
                zone = ZoneInfo("Asia/Kuala_Lumpur")
            local_dt = current.astimezone(zone)
            weekday_idx = local_dt.weekday()
            today_key = WEEKDAYS[weekday_idx]
            yesterday_key = WEEKDAYS[(weekday_idx - 1) % 7]
            now_min = local_dt.hour * 60 + local_dt.minute

            is_open = False
            for interval in validated.get(today_key, []):
                open_min = parse_hhmm_minutes(interval["open"], allow_2400=False)
                close_min = parse_hhmm_minutes(interval["close"], allow_2400=True)
                if open_min is None or close_min is None:
                    continue
                if close_min > open_min:
                    if open_min <= now_min < close_min:
                        is_open = True
                        break
                elif now_min >= open_min:
                    is_open = True
                    break

            if not is_open:
                for interval in validated.get(yesterday_key, []):
                    open_min = parse_hhmm_minutes(interval["open"], allow_2400=False)
                    close_min = parse_hhmm_minutes(interval["close"], allow_2400=True)
                    if open_min is not None and close_min is not None and close_min < open_min:
                        if now_min < close_min:
                            is_open = True
                            break
            regular_open = is_open

    if service_status == "closed":
        return False, regular_open, "closed_by_operator"
    if regular_open is None:
        return None, None, "hours_unknown"
    return regular_open, regular_open, "open_regular_hours" if regular_open else "closed_regular_hours"
