"""Persistent PostgreSQL queries and PII-safe projections for branch customer reports."""

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException

SPECIALIST_ROLES = ("machine_maintenance", "lpg_maintenance")


def _utc_iso(value: Any) -> str:
    if isinstance(value, str):
        return value
    if not isinstance(value, datetime):
        return ""
    aware = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
    return aware.isoformat()


def _project_report_row(
    row: dict[str, Any],
    history_rows: list[dict[str, Any]],
    *,
    role: str,
) -> dict[str, Any]:
    redact_contact = role in SPECIALIST_ROLES
    return {
        "id": str(row["id"]),
        "reference_code": row.get("reference_code"),
        "branch_id": str(row["branch_id"]),
        "asset_id": row["source_id"],
        "asset_name": row["asset_name"],
        "asset_type": row["asset_type"],
        "category": row["category"],
        "description": row["description"],
        "status": row["status"],
        "source_kind": "customer_portal" if row.get("source_kind") == "customer" else row.get("source_kind", "customer_portal"),
        "reporter_name": "" if redact_contact else (row.get("reporter_name") or ""),
        "reporter_contact": "" if redact_contact else (row.get("contact_value") or ""),
        "created_at": _utc_iso(row.get("created_at")),
        "updated_at": _utc_iso(row.get("updated_at")),
        "investigation_notes": row.get("investigation_notes"),
        "assigned_specialist_role": row.get("assigned_specialist_role"),
        "resolution_reason": row.get("resolution_reason"),
        "history": [
            {
                "id": str(h["id"]),
                "action": h["action"],
                "actor_role": h["actor_role"],
                "timestamp": _utc_iso(h.get("created_at")),
                "note": h["note"],
            }
            for h in history_rows
        ],
    }


def compute_reports_summary(reports: list[dict[str, Any]]) -> dict[str, int]:
    return {
        "total": len(reports),
        "received": sum(1 for r in reports if r["status"] == "received"),
        "investigating": sum(1 for r in reports if r["status"] == "investigating"),
        "resolved": sum(1 for r in reports if r["status"] == "resolved"),
        "dismissed": sum(1 for r in reports if r["status"] == "dismissed"),
    }


def load_branch_report_counts(conn: Any, organization_id: UUID, branch_id: UUID) -> dict[str, int]:
    rows = conn.execute(
        """select status, count(*) as cnt
           from public.customer_reports
           where organization_id = %s and branch_id = %s
             and status in ('received', 'investigating')
           group by status""",
        (organization_id, branch_id),
    ).fetchall()
    counts = {"pending_count": 0, "investigating_count": 0}
    for row in rows:
        if row["status"] == "received":
            counts["pending_count"] = int(row["cnt"] or 0)
        elif row["status"] == "investigating":
            counts["investigating_count"] = int(row["cnt"] or 0)
    return counts


def list_branch_customer_reports(
    conn: Any,
    organization_id: UUID,
    branch_id: UUID,
    *,
    role: str,
) -> list[dict[str, Any]]:
    report_rows = conn.execute(
        """select id, reference_code, branch_id, source_id, asset_name, asset_type,
                  category, description, status, source_kind, reporter_name,
                  contact_value, investigation_notes, assigned_specialist_role,
                  resolution_reason, created_at, updated_at
           from public.customer_reports
           where organization_id = %s and branch_id = %s
           order by created_at desc, id desc""",
        (organization_id, branch_id),
    ).fetchall()
    if not report_rows:
        return []

    report_ids = [r["id"] for r in report_rows]
    hist_rows = conn.execute(
        """select id, report_id, action, actor_role, note, created_at
           from public.customer_report_history
           where report_id = any(%s)
           order by created_at asc, id asc""",
        (report_ids,),
    ).fetchall()
    hist_by_report: dict[Any, list[dict[str, Any]]] = {}
    for h in hist_rows:
        hist_by_report.setdefault(h["report_id"], []).append(dict(h))

    return [
        _project_report_row(dict(r), hist_by_report.get(r["id"], []), role=role)
        for r in report_rows
    ]


def _resolve_target_report(conn: Any, organization_id: UUID, branch_id: UUID, report_id: str) -> dict[str, Any]:
    parsed_uuid: UUID | None = None
    try:
        parsed_uuid = UUID(report_id)
    except ValueError:
        parsed_uuid = None

    if parsed_uuid is not None:
        row = conn.execute(
            """select id from public.customer_reports
               where organization_id = %s and branch_id = %s and id = %s
               for update""",
            (organization_id, branch_id, parsed_uuid),
        ).fetchone()
    else:
        row = conn.execute(
            """select id from public.customer_reports
               where organization_id = %s and branch_id = %s and reference_code = %s
               for update""",
            (organization_id, branch_id, report_id),
        ).fetchone()
    if not row:
        raise HTTPException(404, f"Customer report '{report_id}' not found")
    return dict(row)


def investigate_branch_report(
    conn: Any,
    organization_id: UUID,
    branch_id: UUID,
    report_id: str,
    *,
    notes: str,
    assigned_specialist_role: str | None,
    actor_user_id: str,
    actor_role: str,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    target = _resolve_target_report(conn, organization_id, branch_id, report_id)
    target_id = target["id"]
    conn.execute(
        """update public.customer_reports
              set status = 'investigating',
                  investigation_notes = %s,
                  assigned_specialist_role = %s,
                  updated_at = now()
            where id = %s""",
        (notes, assigned_specialist_role, target_id),
    )
    specialist_suffix = (
        f" (Flagged for {assigned_specialist_role.replace('_', ' ')})"
        if assigned_specialist_role
        else ""
    )
    conn.execute(
        """insert into public.customer_report_history (
               report_id, action, actor_role, actor_user_id, note
           ) values (%s, 'investigating', %s, %s, %s)""",
        (target_id, actor_role, actor_user_id, f"{notes}{specialist_suffix}"),
    )
    all_reports = list_branch_customer_reports(conn, organization_id, branch_id, role=actor_role)
    updated = next(r for r in all_reports if r["id"] == str(target_id))
    return updated, all_reports


def resolve_branch_report(
    conn: Any,
    organization_id: UUID,
    branch_id: UUID,
    report_id: str,
    *,
    action: str,
    reason: str,
    actor_user_id: str,
    actor_role: str,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    target = _resolve_target_report(conn, organization_id, branch_id, report_id)
    target_id = target["id"]
    new_status = "resolved" if action == "resolve" else "dismissed"
    conn.execute(
        """update public.customer_reports
              set status = %s,
                  resolution_reason = %s,
                  updated_at = now()
            where id = %s""",
        (new_status, reason, target_id),
    )
    conn.execute(
        """insert into public.customer_report_history (
               report_id, action, actor_role, actor_user_id, note
           ) values (%s, %s, %s, %s, %s)""",
        (target_id, new_status, actor_role, actor_user_id, reason),
    )
    all_reports = list_branch_customer_reports(conn, organization_id, branch_id, role=actor_role)
    updated = next(r for r in all_reports if r["id"] == str(target_id))
    return updated, all_reports
