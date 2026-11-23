"""Persistent PostgreSQL queries and PII-safe projections for branch customer reports."""

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from psycopg.types.json import Jsonb

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
        "linked_incident_id": str(row["linked_incident_id"]) if row.get("linked_incident_id") else None,
        "linked_incident": (
            {
                "id": str(row["linked_incident_id"]),
                "reference_code": row.get("inc_reference_code"),
                "asset_name": row.get("inc_asset_name"),
                "fault_code": row.get("inc_fault_code"),
                "severity": row.get("inc_severity"),
                "edge_condition_state": row.get("inc_edge_condition_state"),
                "workflow_state": row.get("inc_workflow_state"),
            }
            if row.get("linked_incident_id") and row.get("inc_reference_code")
            else None
        ),
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
        """select cr.id, cr.reference_code, cr.branch_id, cr.source_id, cr.asset_name, cr.asset_type,
                  cr.category, cr.description, cr.status, cr.source_kind, cr.reporter_name,
                  cr.contact_value, cr.investigation_notes, cr.assigned_specialist_role,
                  cr.resolution_reason, cr.linked_incident_id, cr.created_at, cr.updated_at,
                  inc.reference_code as inc_reference_code,
                  inc.asset_name as inc_asset_name,
                  inc.fault_code as inc_fault_code,
                  inc.severity as inc_severity,
                  inc.edge_condition_state as inc_edge_condition_state,
                  inc.workflow_state as inc_workflow_state
           from public.customer_reports cr
           left join public.incidents inc
             on inc.id = cr.linked_incident_id
            and inc.organization_id = cr.organization_id
           where cr.organization_id = %s and cr.branch_id = %s
           order by cr.created_at desc, cr.id desc""",
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


def load_open_branch_incidents_for_reports(
    conn: Any,
    organization_id: UUID,
    branch_id: UUID,
    *,
    role: str,
) -> list[dict[str, Any]]:
    """Return active/unresolved branch incidents linkable during report triage."""
    domains = (
        ["machine"]
        if role == "machine_maintenance"
        else ["lpg"]
        if role == "lpg_maintenance"
        else ["machine", "lpg"]
    )
    rows = conn.execute(
        """select id, reference_code, source_id, asset_name, domain, severity,
                  fault_code, fault_name, edge_condition_state, workflow_state,
                  summary, opened_at
           from public.incidents
           where organization_id = %s
             and branch_id = %s
             and domain = any(%s)
             and (edge_condition_state = 'active' or workflow_state <> 'resolved')
           order by opened_at desc
           limit 30""",
        (organization_id, branch_id, domains),
    ).fetchall()
    return [
        {
            "id": str(row["id"]),
            "reference_code": row["reference_code"],
            "source_id": row["source_id"],
            "asset_name": row["asset_name"],
            "domain": row["domain"],
            "severity": row["severity"],
            "fault_code": row.get("fault_code"),
            "fault_name": row.get("fault_name"),
            "edge_condition_state": row["edge_condition_state"],
            "workflow_state": row["workflow_state"],
            "summary": row["summary"],
            "opened_at": _utc_iso(row.get("opened_at")),
        }
        for row in rows
    ]


def _resolve_target_report(conn: Any, organization_id: UUID, branch_id: UUID, report_id: str) -> dict[str, Any]:
    parsed_uuid: UUID | None = None
    try:
        parsed_uuid = UUID(report_id)
    except ValueError:
        parsed_uuid = None

    if parsed_uuid is not None:
        row = conn.execute(
            """select id, reference_code, asset_name, asset_type, linked_incident_id
               from public.customer_reports
               where organization_id = %s and branch_id = %s and id = %s
               for update""",
            (organization_id, branch_id, parsed_uuid),
        ).fetchone()
    else:
        row = conn.execute(
            """select id, reference_code, asset_name, asset_type, linked_incident_id
               from public.customer_reports
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
    linked_incident_id: UUID | None = None,
    create_maintenance_task: bool = False,
    assigned_to_user_id: UUID | None = None,
    task_title: str | None = None,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    target = _resolve_target_report(conn, organization_id, branch_id, report_id)
    target_id = target["id"]
    effective_incident_id = target.get("linked_incident_id")
    linked_ref: str | None = None
    incident_domain: str | None = None

    if linked_incident_id is not None:
        inc_row = conn.execute(
            """select id, reference_code, domain, asset_name
               from public.incidents
               where id = %s and organization_id = %s and branch_id = %s""",
            (linked_incident_id, organization_id, branch_id),
        ).fetchone()
        if not inc_row:
            raise HTTPException(404, "Linked incident not found for this branch")
        if actor_role == "machine_maintenance" and inc_row["domain"] != "machine":
            raise HTTPException(403, "Machine maintenance specialists cannot link LPG incidents")
        if actor_role == "lpg_maintenance" and inc_row["domain"] != "lpg":
            raise HTTPException(403, "LPG maintenance specialists cannot link machine incidents")
        effective_incident_id = inc_row["id"]
        linked_ref = inc_row["reference_code"]
        incident_domain = inc_row["domain"]

    conn.execute(
        """update public.customer_reports
              set status = 'investigating',
                  investigation_notes = %s,
                  assigned_specialist_role = %s,
                  linked_incident_id = %s,
                  updated_at = now()
            where id = %s""",
        (notes, assigned_specialist_role, effective_incident_id, target_id),
    )

    if linked_incident_id is not None:
        conn.execute(
            """insert into public.incident_events
               (incident_id, organization_id, branch_id, event_type, actor_type,
                actor_user_id, actor_role, summary, metadata, idempotency_key, occurred_at)
               values (%s, %s, %s, 'linked_report', 'operator', %s, %s, %s, %s, %s, now())
               on conflict (incident_id, idempotency_key) where idempotency_key is not null do nothing""",
            (
                effective_incident_id,
                organization_id,
                branch_id,
                actor_user_id,
                actor_role,
                f"Linked customer report {target.get('reference_code') or target_id}",
                Jsonb({"report_id": str(target_id), "reference_code": target.get("reference_code")}),
                f"linked_report:{target_id}",
            ),
        )

    if create_maintenance_task:
        if actor_role not in ("owner", "branch_manager"):
            raise HTTPException(403, "Only owners and assigned branch managers can assign maintenance tasks")
        if assigned_to_user_id is None:
            raise HTTPException(422, "Select a specialist before creating a maintenance task")
        task_domain = incident_domain or (
            "lpg" if assigned_specialist_role == "lpg_maintenance" else "machine"
        )
        required_role = "lpg_maintenance" if task_domain == "lpg" else "machine_maintenance"
        assignee = conn.execute(
            """select m.user_id, m.role, m.state, m.active
               from public.memberships m
               join public.branch_assignments ba
                 on ba.organization_id = m.organization_id and ba.user_id = m.user_id
               where m.organization_id = %s
                 and ba.branch_id = %s
                 and m.user_id = %s""",
            (organization_id, branch_id, assigned_to_user_id),
        ).fetchone()
        if not assignee or assignee["state"] != "active" or not assignee["active"]:
            raise HTTPException(422, "Assignee must be an active specialist assigned to this branch")
        if assignee["role"] != required_role:
            raise HTTPException(422, f"Assignee must hold the {required_role} specialty")

        resolved_title = (
            task_title.strip()
            if isinstance(task_title, str) and len(task_title.strip()) >= 3
            else f"Follow up on {target.get('asset_name') or 'reported issue'}"
        )[:160]
        conn.execute(
            """insert into public.maintenance_tasks
               (organization_id, branch_id, incident_id, report_id, domain, title,
                assigned_to_user_id, assigned_by_user_id, status, service_notes)
               values (%s, %s, %s, %s, %s, %s, %s, %s, 'assigned', %s)""",
            (
                organization_id,
                branch_id,
                effective_incident_id,
                target_id,
                task_domain,
                resolved_title,
                assigned_to_user_id,
                actor_user_id,
                notes,
            ),
        )
        if effective_incident_id:
            conn.execute(
                """insert into public.incident_events
                   (incident_id, organization_id, branch_id, event_type, actor_type,
                    actor_user_id, actor_role, summary, metadata, occurred_at)
                   values (%s, %s, %s, 'assigned', 'operator', %s, %s, %s, %s, now())""",
                (
                    effective_incident_id,
                    organization_id,
                    branch_id,
                    actor_user_id,
                    actor_role,
                    f"Assigned task '{resolved_title}' from customer report triage",
                    Jsonb({"report_id": str(target_id), "assigned_to_user_id": str(assigned_to_user_id)}),
                ),
            )

    specialist_suffix = (
        f" (Flagged for {assigned_specialist_role.replace('_', ' ')})"
        if assigned_specialist_role
        else ""
    )
    linked_suffix = f" [Linked incident {linked_ref}]" if linked_ref else ""
    conn.execute(
        """insert into public.customer_report_history (
               report_id, action, actor_role, actor_user_id, note
           ) values (%s, 'investigating', %s, %s, %s)""",
        (target_id, actor_role, actor_user_id, f"{notes}{specialist_suffix}{linked_suffix}"),
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
