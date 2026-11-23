"""Protected Web Push subscription management and edge transition dispatch."""

from datetime import datetime, timezone
import json
import logging
import math
import os
from typing import Any
from urllib.parse import urlsplit
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from pywebpush import WebPushException, webpush

from branches import _membership
from lpg_operations import _utc_dt, _utc_iso
from notifications import PERMITTED_ROLES
from onboarding import _database, _user

router = APIRouter()
logger = logging.getLogger(__name__)


class PushSubscriptionKeys(BaseModel):
    p256dh: str = Field(min_length=8, max_length=512)
    auth: str = Field(min_length=8, max_length=256)

    @field_validator("p256dh", "auth")
    @classmethod
    def non_empty_key(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned or any(ch.isspace() for ch in cleaned):
            raise ValueError("Invalid Web Push key format")
        return cleaned


def _validate_push_endpoint(value: str) -> str:
    cleaned = value.strip()
    parsed = urlsplit(cleaned)
    if parsed.scheme != "https" or not parsed.netloc or not parsed.hostname:
        raise ValueError("Push subscription endpoint must use HTTPS")
    if parsed.username or parsed.password:
        raise ValueError("Push subscription endpoint cannot include credentials")
    return cleaned


class PushSubscriptionUpsertRequest(BaseModel):
    endpoint: str = Field(min_length=12, max_length=2048)
    keys: PushSubscriptionKeys
    user_agent: str | None = Field(default=None, max_length=255)

    @field_validator("endpoint")
    @classmethod
    def check_endpoint(cls, value: str) -> str:
        return _validate_push_endpoint(value)


class PushSubscriptionDeleteRequest(BaseModel):
    endpoint: str = Field(min_length=12, max_length=2048)

    @field_validator("endpoint")
    @classmethod
    def check_endpoint(cls, value: str) -> str:
        return _validate_push_endpoint(value)


def _vapid_config() -> dict[str, str] | None:
    public_key = (os.getenv("VAPID_PUBLIC_KEY") or "").strip()
    private_key = (os.getenv("VAPID_PRIVATE_KEY") or "").strip()
    subject = (os.getenv("VAPID_SUBJECT") or "mailto:ops@spinsense.local").strip()
    if not public_key or not private_key:
        return None
    return {
        "public_key": public_key,
        "private_key": private_key,
        "subject": subject or "mailto:ops@spinsense.local",
    }


def _lpg_fill_band(pct: Any) -> str | None:
    if isinstance(pct, bool) or not isinstance(pct, (int, float)) or not math.isfinite(pct):
        return None
    if pct < 5:
        return "critical"
    if pct < 15:
        return "low"
    return "normal"


def _send_web_push(
    subscription_info: dict[str, Any],
    payload_json: str,
    vapid_private_key: str,
    vapid_claims: dict[str, str],
) -> None:
    webpush(
        subscription_info=subscription_info,
        data=payload_json,
        vapid_private_key=vapid_private_key,
        vapid_claims=vapid_claims,
        ttl=300,
    )


def revoke_user_push_subscriptions(conn, user_id: UUID, organization_id: UUID) -> None:
    """Revoke active Web Push subscriptions when access/assignments are removed."""
    conn.execute(
        """update public.push_subscriptions
           set revoked_at = now()
           where user_id = %s
             and organization_id = %s
             and revoked_at is null""",
        (user_id, organization_id),
    )


def _branch_label(conn, branch_id: UUID, organization_id: UUID) -> str:
    row = conn.execute(
        "select name from public.branches where id = %s and organization_id = %s",
        (branch_id, organization_id),
    ).fetchone()
    if row and isinstance(row.get("name"), str) and row["name"].strip():
        return row["name"].strip()
    return "Branch"


def _dispatch_alerts_for_device(
    conn,
    *,
    organization_id: UUID,
    branch_id: UUID,
    category: str,
    alerts: list[dict[str, Any]],
) -> int:
    """Deliver deduplicated Web Push alerts to authorized active recipients."""
    if not alerts:
        return 0

    vapid = _vapid_config()
    if not vapid:
        return 0

    recipients = conn.execute(
        """select ps.id, ps.user_id, ps.endpoint, ps.p256dh, ps.auth
           from public.push_subscriptions ps
           join public.memberships m
             on m.user_id = ps.user_id
            and m.organization_id = ps.organization_id
           left join public.branch_assignments ba
             on ba.organization_id = ps.organization_id
            and ba.branch_id = %s
            and ba.user_id = ps.user_id
           left join public.branches b
             on b.id = %s
            and b.organization_id = ps.organization_id
           where ps.organization_id = %s
             and ps.revoked_at is null
             and m.active = true
             and m.state = 'active'
             and (
               m.role = 'owner'
               or (
                 m.role = 'branch_manager'
                 and (ba.user_id is not null or b.primary_manager_user_id = ps.user_id)
               )
               or (%s = 'machine' and m.role = 'machine_maintenance' and ba.user_id is not null)
               or (%s = 'lpg' and m.role = 'lpg_maintenance' and ba.user_id is not null)
             )""",
        (branch_id, branch_id, organization_id, category, category),
    ).fetchall()

    if not recipients:
        return 0

    branch_name = _branch_label(conn, branch_id, organization_id)
    target_path = f"/branches/{branch_id}/{'lpg' if category == 'lpg' else 'machines'}"
    vapid_claims = {"sub": vapid["subject"]}
    sent_count = 0

    for alert in alerts:
        incident_id = alert.get("incident_id")
        alert_url = (
            f"/branches/{branch_id}/incidents/{incident_id}"
            if incident_id
            else target_path
        )
        payload_json = json.dumps(
            {
                "title": f"{alert['title']} · {branch_name}",
                "body": alert["detail"],
                "branch_id": str(branch_id),
                "branch_name": branch_name,
                "category": category,
                "kind": alert["kind"],
                "severity": alert["severity"],
                "incident_id": str(incident_id) if incident_id else None,
                "tag": f"spinsense:{category}:{branch_id}:{alert['source_id']}:{alert['kind']}",
                "url": alert_url,
                "occurred_at": alert["occurred_at"],
            },
            separators=(",", ":"),
        )
        dedup_key = f"{alert['kind']}:{alert['device_id']}:{alert['occurred_at']}"[:255]

        for sub in recipients:
            inserted = conn.execute(
                """insert into public.push_delivery_attempts
                   (subscription_id, dedup_key, status)
                   values (%s, %s, 'sent')
                   on conflict (subscription_id, dedup_key) do nothing
                   returning id""",
                (sub["id"], dedup_key),
            ).fetchone()
            if not inserted:
                continue

            attempt_id = inserted["id"]
            sub_info = {
                "endpoint": sub["endpoint"],
                "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
            }
            try:
                _send_web_push(
                    sub_info,
                    payload_json,
                    vapid["private_key"],
                    vapid_claims,
                )
                conn.execute(
                    "update public.push_subscriptions set last_used_at = now() where id = %s",
                    (sub["id"],),
                )
                sent_count += 1
            except WebPushException as exc:
                status_code = getattr(getattr(exc, "response", None), "status_code", None)
                detail = f"HTTP {status_code}" if status_code else type(exc).__name__
                if status_code in (404, 410):
                    conn.execute(
                        "update public.push_subscriptions set revoked_at = now() where id = %s",
                        (sub["id"],),
                    )
                    attempt_status = "pruned"
                else:
                    attempt_status = "failed"
                conn.execute(
                    """update public.push_delivery_attempts
                       set status = %s, http_status = %s, error_detail = %s
                       where id = %s""",
                    (attempt_status, status_code, detail[:255], attempt_id),
                )
                logger.warning("Web Push delivery failed (%s)", detail)
            except Exception as exc:
                conn.execute(
                    """update public.push_delivery_attempts
                       set status = 'failed', error_detail = %s
                       where id = %s""",
                    (type(exc).__name__[:255], attempt_id),
                )
                logger.warning("Web Push dispatch error (%s)", type(exc).__name__)

    return sent_count


def evaluate_and_dispatch_machine_state(
    conn,
    *,
    device: dict[str, Any],
    state_payload: dict[str, Any],
    sample_at: datetime,
) -> int:
    """Update machine transition baseline and dispatch critical fault Web Push alerts."""
    sample_utc = _utc_dt(sample_at) or datetime.now(timezone.utc)
    sample_iso = _utc_iso(sample_utc) or sample_utc.isoformat().replace("+00:00", "Z")
    curr_state = str(state_payload.get("state") or "UNKNOWN").strip().upper()
    raw_fault = state_payload.get("fault_code")
    curr_fault = str(raw_fault).strip()[:64] if raw_fault else None

    prev = conn.execute(
        """select last_machine_state, last_fault_code, last_sample_at
           from public.device_notification_states
           where device_id = %s
           for update""",
        (device["id"],),
    ).fetchone()

    prev_sample = _utc_dt(prev.get("last_sample_at")) if isinstance(prev, dict) else None
    if prev_sample is not None and sample_utc <= prev_sample:
        return 0

    conn.execute(
        """insert into public.device_notification_states
           (device_id, organization_id, branch_id, last_machine_state, last_fault_code, last_sample_at, updated_at)
           values (%s, %s, %s, %s, %s, %s, now())
           on conflict (device_id) do update set
               last_machine_state = excluded.last_machine_state,
               last_fault_code = excluded.last_fault_code,
               last_sample_at = excluded.last_sample_at,
               updated_at = now()""",
        (
            device["id"],
            device["organization_id"],
            device["branch_id"],
            curr_state,
            curr_fault,
            sample_utc,
        ),
    )

    prev_state = prev.get("last_machine_state") if isinstance(prev, dict) else None
    prev_fault = prev.get("last_fault_code") if isinstance(prev, dict) else None
    source_id = str(device.get("source_id") or "")
    alerts: list[dict[str, Any]] = []
    if curr_state == "ERROR" and (
        prev_state != "ERROR" or (curr_fault and curr_fault != prev_fault)
    ):
        label = device.get("label") or source_id or "Machine"
        detail = (
            f"{label} reported fault {curr_fault}"
            if curr_fault
            else f"{label} entered fault state"
        )
        alerts.append(
            {
                "device_id": str(device["id"]),
                "source_id": source_id,
                "kind": "machine_fault",
                "severity": "negative",
                "title": "Machine fault",
                "detail": detail,
                "occurred_at": sample_iso,
            }
        )

    return _dispatch_alerts_for_device(
        conn,
        organization_id=device["organization_id"],
        branch_id=device["branch_id"],
        category="machine",
        alerts=alerts,
    )


def evaluate_and_dispatch_lpg_observation(
    conn,
    *,
    device: dict[str, Any],
    observation: dict[str, Any] | None,
    gas_info: dict[str, Any],
) -> int:
    """Update LPG transition baseline and dispatch critical/warning Web Push alerts."""
    if not observation:
        return 0

    sample_utc = _utc_dt(
        datetime.fromisoformat(observation["sample_at"].replace("Z", "+00:00"))
        if observation.get("sample_at")
        else None
    )
    if sample_utc is None:
        return 0
    sample_iso = observation["sample_at"]

    quality = observation.get("quality") if isinstance(observation.get("quality"), dict) else {}
    values = observation.get("values") if isinstance(observation.get("values"), dict) else {}
    fresh = observation.get("freshness") == "fresh"
    device_status = str(device.get("status") or "active").strip().lower()
    is_maint = device_status == "maintenance" or bool(
        observation.get("freshness") in ("fresh", "stale")
        and quality.get("maintenance_mode") is True
    )
    curr_band = _lpg_fill_band(values.get("lpg_percent")) if (fresh and not is_maint) else None
    ppm_calibrated = bool(gas_info.get("ppm_calibrated"))
    raw_gas_cond = gas_info.get("gas_condition") if (fresh and ppm_calibrated) else None
    curr_gas = str(raw_gas_cond) if raw_gas_cond in ("normal", "warning", "critical") else None

    prev = conn.execute(
        """select last_lpg_band, last_gas_condition, last_maintenance_mode, last_sample_at
           from public.device_notification_states
           where device_id = %s
           for update""",
        (device["id"],),
    ).fetchone()

    prev_sample = _utc_dt(prev["last_sample_at"]) if prev else None
    if prev_sample is not None and sample_utc <= prev_sample:
        return 0

    prev_band = prev["last_lpg_band"] if prev else None
    prev_gas = prev["last_gas_condition"] if prev else None
    prev_maint = bool(prev["last_maintenance_mode"]) if prev else False

    conn.execute(
        """insert into public.device_notification_states
           (device_id, organization_id, branch_id, last_lpg_band, last_gas_condition, last_maintenance_mode, last_sample_at, updated_at)
           values (%s, %s, %s, %s, %s, %s, %s, now())
           on conflict (device_id) do update set
               last_lpg_band = excluded.last_lpg_band,
               last_gas_condition = excluded.last_gas_condition,
               last_maintenance_mode = excluded.last_maintenance_mode,
               last_sample_at = excluded.last_sample_at,
               updated_at = now()""",
        (
            device["id"],
            device["organization_id"],
            device["branch_id"],
            curr_band if curr_band is not None else prev_band,
            curr_gas if curr_gas is not None else prev_gas,
            is_maint,
            sample_utc,
        ),
    )

    label = device.get("label") or device["source_id"]
    alerts: list[dict[str, Any]] = []

    if is_maint and not prev_maint:
        alerts.append(
            {
                "device_id": str(device["id"]),
                "source_id": device["source_id"],
                "kind": "lpg_maintenance",
                "severity": "warning",
                "title": "LPG undergoing maintenance",
                "detail": f"{label} is undergoing maintenance",
                "occurred_at": sample_iso,
            }
        )

    pct = values.get("lpg_percent")
    if fresh and not is_maint and isinstance(pct, (int, float)) and math.isfinite(pct):
        if curr_band == "critical" and prev_band != "critical":
            alerts.append(
                {
                    "device_id": str(device["id"]),
                    "source_id": device["source_id"],
                    "kind": "lpg_critical",
                    "severity": "negative",
                    "title": "LPG gas critically low",
                    "detail": f"{label} at {pct:.1f}% remaining",
                    "occurred_at": sample_iso,
                }
            )
        elif curr_band == "low" and prev_band not in ("low", "critical"):
            alerts.append(
                {
                    "device_id": str(device["id"]),
                    "source_id": device["source_id"],
                    "kind": "lpg_low",
                    "severity": "warning",
                    "title": "LPG gas level low",
                    "detail": f"{label} at {pct:.1f}% remaining",
                    "occurred_at": sample_iso,
                }
            )

    est_ppm = gas_info.get("estimated_ppm")
    if curr_gas == "critical" and prev_gas != "critical":
        detail = (
            f"{label} estimated {est_ppm:.0f} ppm (MQ-6)"
            if isinstance(est_ppm, (int, float))
            else f"{label} detected dangerous LPG gas levels"
        )
        alerts.append(
            {
                "device_id": str(device["id"]),
                "source_id": device["source_id"],
                "kind": "lpg_gas_critical",
                "severity": "negative",
                "title": "LPG gas leak critical",
                "detail": detail,
                "occurred_at": sample_iso,
            }
        )
    elif curr_gas == "warning" and prev_gas not in ("warning", "critical"):
        detail = (
            f"{label} estimated {est_ppm:.0f} ppm (MQ-6)"
            if isinstance(est_ppm, (int, float))
            else f"{label} detected elevated LPG gas levels"
        )
        alerts.append(
            {
                "device_id": str(device["id"]),
                "source_id": device["source_id"],
                "kind": "lpg_gas_warning",
                "severity": "warning",
                "title": "LPG gas elevated",
                "detail": detail,
                "occurred_at": sample_iso,
            }
        )

    return _dispatch_alerts_for_device(
        conn,
        organization_id=device["organization_id"],
        branch_id=device["branch_id"],
        category="lpg",
        alerts=alerts,
    )


@router.get("/push/public-key")
def get_push_public_key(user=Depends(_user)):
    with _database(read_only=True) as conn:
        member = _membership(conn, user["id"])
        if member["state"] != "active" or member["role"] not in PERMITTED_ROLES:
            raise HTTPException(403, "An active operator membership is required")

    vapid = _vapid_config()
    if not vapid:
        return {"configured": False, "public_key": None}
    return {"configured": True, "public_key": vapid["public_key"]}


@router.post("/push/subscriptions")
def upsert_push_subscription(body: PushSubscriptionUpsertRequest, user=Depends(_user)):
    with _database() as conn:
        member = _membership(conn, user["id"])
        if member["state"] != "active" or member["role"] not in PERMITTED_ROLES:
            raise HTTPException(403, "An active operator membership is required")

        row = conn.execute(
            """insert into public.push_subscriptions
               (user_id, organization_id, endpoint, p256dh, auth, user_agent, revoked_at)
               values (%s, %s, %s, %s, %s, %s, null)
               on conflict (user_id, endpoint) do update set
                   organization_id = excluded.organization_id,
                   p256dh = excluded.p256dh,
                   auth = excluded.auth,
                   user_agent = coalesce(excluded.user_agent, public.push_subscriptions.user_agent),
                   revoked_at = null
               returning id""",
            (
                user["id"],
                member["organization_id"],
                body.endpoint,
                body.keys.p256dh,
                body.keys.auth,
                body.user_agent,
            ),
        ).fetchone()

    return {"saved": True, "subscription_id": str(row["id"])}


@router.delete("/push/subscriptions")
def delete_push_subscription(body: PushSubscriptionDeleteRequest, user=Depends(_user)):
    with _database() as conn:
        conn.execute(
            """update public.push_subscriptions
               set revoked_at = now()
               where user_id = %s
                 and endpoint = %s
                 and revoked_at is null""",
            (user["id"], body.endpoint),
        )
    return {"revoked": True}
