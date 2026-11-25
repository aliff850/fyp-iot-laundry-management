"""Safely compact redundant flat LPG telemetry rows in Pi 5 MariaDB edge_iot.

Keeps all:
- Unsynced or quarantined rows (`is_synced != 1 OR quarantine_reason IS NOT NULL`)
- Recent rows within `--keep-hours` (default 24h)
- Non-LPG rows
- Rows with meaningful weight/gas/ambient deltas, mode/quality shifts, or non-normal gas states
- One keep-alive checkpoint row every `--bucket-seconds` (default 900s = 15 minutes)

Dry-run by default; pass `--apply` to execute batched deletes.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import pymysql
    from pymysql.cursors import DictCursor
except ImportError:  # pragma: no cover - runtime dependency on Pi
    pymysql = None
    DictCursor = None

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import lpg_interpreter  # noqa: E402


def _parse_json_obj(raw: Any) -> Dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except ValueError:
            return {}
    return {}


def _to_utc(value: Any) -> Optional[datetime]:
    if not isinstance(value, datetime):
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def load_env_values(env_path: Optional[Path]) -> Dict[str, str]:
    values: Dict[str, str] = {}
    if not env_path or not env_path.is_file():
        return values
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def plan_compaction_deletes(
    rows: List[Dict[str, Any]],
    *,
    bucket_seconds: int = lpg_interpreter.DEFAULT_LPG_HISTORY_CHECKPOINT_SECONDS,
) -> Tuple[List[int], int]:
    """Identify redundant middle LPG rows to delete while keeping checkpoints and state transitions."""
    last_kept_by_key: Dict[Tuple[str, str], Tuple[datetime, Optional[str], Dict[str, Any], Dict[str, Any]]] = {}
    delete_ids: List[int] = []
    kept_count = 0

    for row in rows:
        payload = _parse_json_obj(row.get("data_payload"))
        quality = _parse_json_obj(row.get("quality_metadata"))
        if not lpg_interpreter.is_lpg_sensor_payload(payload):
            kept_count += 1
            continue

        sample_dt = _to_utc(row.get("gateway_receipt_at")) or _to_utc(row.get("recorded_at"))
        if sample_dt is None:
            kept_count += 1
            continue

        stream_key = (str(row.get("gateway_id") or ""), str(row.get("source_id") or ""))
        prev = last_kept_by_key.get(stream_key)
        keep, _reason = lpg_interpreter.should_persist_lpg_history(
            payload,
            quality,
            sample_dt,
            boot_id=str(row.get("boot_id") or "") or None,
            last_saved_at=prev[0] if prev else None,
            last_saved_boot_id=prev[1] if prev else None,
            last_saved_payload=prev[2] if prev else None,
            last_saved_quality=prev[3] if prev else None,
            checkpoint_seconds=bucket_seconds,
        )
        if keep:
            kept_count += 1
            last_kept_by_key[stream_key] = (
                sample_dt,
                str(row.get("boot_id") or "") or None,
                payload,
                quality,
            )
        else:
            delete_ids.append(int(row["id"]))

    return delete_ids, kept_count


def run_compaction(
    conn: Any,
    *,
    keep_hours: int = 24,
    bucket_seconds: int = lpg_interpreter.DEFAULT_LPG_HISTORY_CHECKPOINT_SECONDS,
    batch_size: int = 2000,
    apply: bool = False,
) -> Dict[str, Any]:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max(1, int(keep_hours)))
    cutoff_sql = cutoff.strftime("%Y-%m-%d %H:%M:%S.%f")

    delete_candidates: List[int] = []
    scanned = 0
    kept = 0
    last_id = 0
    last_kept_state: Dict[Tuple[str, str], Tuple[datetime, Optional[str], Dict[str, Any], Dict[str, Any]]] = {}

    with conn.cursor() as cursor:
        while True:
            cursor.execute(
                """SELECT s.id, s.gateway_id, s.source_id, s.boot_id,
                          s.recorded_at, s.gateway_receipt_at,
                          s.data_payload, s.quality_metadata
                   FROM sensor_telemetry s
                   LEFT JOIN device_registry d
                     ON d.gateway_id = s.gateway_id AND d.source_id = s.source_id
                   WHERE s.id > %s
                     AND s.is_synced = 1
                     AND s.quarantine_reason IS NULL
                     AND s.gateway_receipt_at < %s
                     AND (d.device_type = 'lpg_edge_node' OR d.device_type IS NULL)
                   ORDER BY s.id ASC
                   LIMIT 10000""",
                (last_id, cutoff_sql),
            )
            chunk = cursor.fetchall()
            if not chunk:
                break
            last_id = int(chunk[-1]["id"])
            scanned += len(chunk)

            for row in chunk:
                payload = _parse_json_obj(row.get("data_payload"))
                quality = _parse_json_obj(row.get("quality_metadata"))
                if not lpg_interpreter.is_lpg_sensor_payload(payload):
                    kept += 1
                    continue
                sample_dt = _to_utc(row.get("gateway_receipt_at")) or _to_utc(row.get("recorded_at"))
                if sample_dt is None:
                    kept += 1
                    continue
                stream_key = (str(row.get("gateway_id") or ""), str(row.get("source_id") or ""))
                prev = last_kept_state.get(stream_key)
                keep, _reason = lpg_interpreter.should_persist_lpg_history(
                    payload,
                    quality,
                    sample_dt,
                    boot_id=str(row.get("boot_id") or "") or None,
                    last_saved_at=prev[0] if prev else None,
                    last_saved_boot_id=prev[1] if prev else None,
                    last_saved_payload=prev[2] if prev else None,
                    last_saved_quality=prev[3] if prev else None,
                    checkpoint_seconds=bucket_seconds,
                )
                if keep:
                    kept += 1
                    last_kept_state[stream_key] = (
                        sample_dt,
                        str(row.get("boot_id") or "") or None,
                        payload,
                        quality,
                    )
                else:
                    delete_candidates.append(int(row["id"]))

    deleted = 0
    if apply and delete_candidates:
        chunk_size = max(100, min(5000, int(batch_size)))
        with conn.cursor() as cursor:
            for idx in range(0, len(delete_candidates), chunk_size):
                batch_ids = delete_candidates[idx : idx + chunk_size]
                placeholders = ", ".join(["%s"] * len(batch_ids))
                cursor.execute(
                    f"DELETE FROM sensor_telemetry WHERE is_synced = 1 AND quarantine_reason IS NULL AND id IN ({placeholders})",
                    batch_ids,
                )
                deleted += cursor.rowcount
                conn.commit()
    else:
        conn.rollback()

    return {
        "cutoff_utc": cutoff.isoformat(),
        "scanned": scanned,
        "kept": kept,
        "prunable": len(delete_candidates),
        "deleted": deleted,
        "applied": bool(apply),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Compact redundant flat synced LPG rows in Pi 5 MariaDB.")
    parser.add_argument("--keep-hours", type=int, default=24, help="Keep all raw rows newer than N hours (default: 24)")
    parser.add_argument("--bucket-seconds", type=int, default=900, help="Checkpoint interval in seconds (default: 900)")
    parser.add_argument("--batch-size", type=int, default=2000, help="Rows deleted per committed batch (default: 2000)")
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env", help="Path to Pi gateway .env file")
    parser.add_argument("--apply", action="store_true", help="Actually delete redundant rows (default is dry-run)")
    args = parser.parse_args()

    if pymysql is None:
        raise RuntimeError("PyMySQL is required to run compaction")

    env_vals = load_env_values(args.env_file)
    host = os.getenv("SPINSENSE_DB_HOST") or env_vals.get("SPINSENSE_DB_HOST", "localhost")
    user = os.getenv("SPINSENSE_DB_USER") or env_vals.get("SPINSENSE_DB_USER", "edge_user")
    password = os.getenv("SPINSENSE_DB_PASSWORD") or env_vals.get("SPINSENSE_DB_PASSWORD", "")
    db_name = os.getenv("SPINSENSE_DB_NAME") or env_vals.get("SPINSENSE_DB_NAME", "edge_iot")
    if not password:
        raise RuntimeError("SPINSENSE_DB_PASSWORD must be set in environment or --env-file")

    conn = pymysql.connect(host=host, user=user, password=password, database=db_name, cursorclass=DictCursor)
    try:
        summary = run_compaction(
            conn,
            keep_hours=args.keep_hours,
            bucket_seconds=args.bucket_seconds,
            batch_size=args.batch_size,
            apply=args.apply,
        )
        print(json.dumps(summary, indent=2))
    finally:
        conn.close()
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
