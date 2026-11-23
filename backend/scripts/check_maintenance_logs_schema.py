"""Read-only Supabase migration 012 status check without printing connection details."""

from pathlib import Path
import sys

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from onboarding import _configuration


def main() -> None:
    _, _, dsn = _configuration()
    with psycopg.connect(dsn, connect_timeout=5) as conn:
        present = bool(
            conn.execute("select to_regclass('public.machine_maintenance_logs') is not null").fetchone()[0]
        )
        rls = False
        grants = None
        row_count = None
        if present:
            rls_row = conn.execute(
                """select c.relrowsecurity
                   from pg_class c
                   join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relname = 'machine_maintenance_logs'"""
            ).fetchone()
            rls = bool(rls_row and rls_row[0])
            grants = conn.execute(
                """select count(*)
                   from information_schema.role_table_grants
                   where table_schema = 'public'
                     and table_name = 'machine_maintenance_logs'
                     and grantee in ('anon', 'authenticated')"""
            ).fetchone()[0]
            row_count = conn.execute("select count(*) from public.machine_maintenance_logs").fetchone()[0]

        check_row = conn.execute(
            """select pg_get_constraintdef(oid)
               from pg_constraint
               where conrelid = 'public.machine_commands'::regclass
                 and contype = 'c'
                 and pg_get_constraintdef(oid) ilike '%action%'"""
        ).fetchone()
        start_maint_allowed = bool(check_row and "start_maintenance" in check_row[0])

    print(
        f"machine_maintenance_logs_present={present} rls_enabled={rls} "
        f"browser_grants_count={grants} start_maintenance_allowed={start_maint_allowed} "
        f"log_rows_count={row_count}"
    )


if __name__ == "__main__":
    main()
