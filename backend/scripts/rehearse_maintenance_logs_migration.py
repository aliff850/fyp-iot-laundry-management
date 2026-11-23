"""Run migration 012_machine_maintenance_logs.sql in a rollback-only PostgreSQL transaction."""

from pathlib import Path
import sys
from uuid import uuid4

import psycopg
from psycopg.types.json import Jsonb

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from onboarding import _configuration


def main() -> None:
    sql = (
        Path(__file__).resolve().parents[1]
        / "migrations"
        / "012_machine_maintenance_logs.sql"
    ).read_text(encoding="utf-8")
    sql = sql.replace("begin;", "", 1).rsplit("commit;", 1)[0]
    _, _, dsn = _configuration()

    with psycopg.connect(dsn, connect_timeout=5) as conn:
        try:
            prereq = conn.execute(
                """select
                    to_regclass('public.branches') is not null,
                    to_regclass('public.devices') is not null,
                    to_regclass('public.incidents') is not null,
                    to_regclass('public.machine_commands') is not null"""
            ).fetchone()
            if not prereq or not all(prereq):
                raise RuntimeError("Required prerequisite tables (branches/devices/incidents/machine_commands) are absent")

            conn.execute(sql)

            rls_row = conn.execute(
                """select c.relrowsecurity
                   from pg_class c
                   join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relname = 'machine_maintenance_logs'"""
            ).fetchone()
            if not rls_row or not rls_row[0]:
                raise RuntimeError("machine_maintenance_logs table or RLS verification failed inside rehearsal")

            grants = conn.execute(
                """select count(*)
                   from information_schema.role_table_grants
                   where table_schema = 'public'
                     and table_name = 'machine_maintenance_logs'
                     and grantee in ('anon', 'authenticated')"""
            ).fetchone()[0]
            if grants:
                raise RuntimeError("Browser roles have unexpected table grants on machine_maintenance_logs")

            check_row = conn.execute(
                """select pg_get_constraintdef(oid)
                   from pg_constraint
                   where conrelid = 'public.machine_commands'::regclass
                     and conname = 'machine_commands_action_check'"""
            ).fetchone()
            if not check_row or "start_maintenance" not in check_row[0]:
                raise RuntimeError("machine_commands_action_check does not permit start_maintenance")

            device = conn.execute(
                """select d.id, d.gateway_id, d.branch_id, d.organization_id, d.source_id, d.label, d.approved_by
                   from public.devices d
                   join public.gateways g on g.id = d.gateway_id
                   where d.status = 'active'
                     and d.device_type in ('washer', 'dryer', 'washer_dryer')
                     and g.status = 'active'
                   limit 1"""
            ).fetchone()
            if device:
                cmd_id = uuid4()
                conn.execute(
                    """insert into public.machine_commands
                       (id, device_id, gateway_id, branch_id, organization_id, action, arguments,
                        actor_user_id, expires_at)
                       values (%s, %s, %s, %s, %s, 'start_maintenance', %s, %s, now() + interval '30 seconds')""",
                    (cmd_id, device[0], device[1], device[2], device[3], Jsonb({}), device[6]),
                )
                ref = f"MNT-{uuid4().hex[:6].upper()}"
                conn.execute(
                    """insert into public.machine_maintenance_logs
                       (reference_code, organization_id, branch_id, device_id, gateway_id,
                        source_id, asset_name, error_code, fault_name, technician_name,
                        performed_by_user_id, performed_by_role, work_done, outcome)
                       values (%s, %s, %s, %s, %s, %s, %s, 'E01', 'Water Inlet Failure',
                               'Rehearsal Tech', %s, 'owner', 'Rehearsal inspection note.', 'completed')""",
                    (ref, device[3], device[2], device[0], device[1], device[4], device[5], device[6]),
                )
                print("Approved machine start_maintenance command and maintenance log insert passed in rehearsal")

            print("Migration 012 parsed, created RLS-protected machine_maintenance_logs, and updated action check inside rollback-only transaction")
        finally:
            conn.rollback()
    print("Rehearsal transaction rolled back; live schema unchanged")


if __name__ == "__main__":
    main()
