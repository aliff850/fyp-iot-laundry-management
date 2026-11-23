"""Apply reviewed additive migration 012_machine_maintenance_logs.sql after rehearsal."""

from pathlib import Path
import sys

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from onboarding import _configuration


def main() -> None:
    migration = (
        Path(__file__).resolve().parents[1]
        / "migrations"
        / "012_machine_maintenance_logs.sql"
    )
    sql = migration.read_text(encoding="utf-8").replace("begin;", "", 1).rsplit("commit;", 1)[0]
    _, _, dsn = _configuration()

    with psycopg.connect(dsn, connect_timeout=5) as conn:
        before = conn.execute(
            """select
                to_regclass('public.branches') is not null,
                to_regclass('public.devices') is not null,
                to_regclass('public.incidents') is not null,
                to_regclass('public.machine_commands') is not null,
                to_regclass('public.machine_maintenance_logs') is not null"""
        ).fetchone()
        if not before or not all(before[:4]):
            raise RuntimeError("Required prerequisite tables are absent; no migration applied")
        if before[4]:
            raise RuntimeError("public.machine_maintenance_logs already exists; inspect before applying")

        try:
            conn.execute(sql)
            rls_row = conn.execute(
                """select c.relrowsecurity
                   from pg_class c
                   join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relname = 'machine_maintenance_logs'"""
            ).fetchone()
            if not rls_row or not rls_row[0]:
                raise RuntimeError("machine_maintenance_logs table or RLS verification failed")

            grants = conn.execute(
                """select count(*)
                   from information_schema.role_table_grants
                   where table_schema = 'public'
                     and table_name = 'machine_maintenance_logs'
                     and grantee in ('anon', 'authenticated')"""
            ).fetchone()[0]
            if grants:
                raise RuntimeError("Browser roles have unexpected table grants")

            check_row = conn.execute(
                """select pg_get_constraintdef(oid)
                   from pg_constraint
                   where conrelid = 'public.machine_commands'::regclass
                     and conname = 'machine_commands_action_check'"""
            ).fetchone()
            if not check_row or "start_maintenance" not in check_row[0]:
                raise RuntimeError("machine_commands_action_check update verification failed")

            conn.commit()
        except BaseException:
            conn.rollback()
            raise

    print("Migration 012 committed: machine_maintenance_logs created, RLS enabled, browser grants absent, start_maintenance allowed")


if __name__ == "__main__":
    main()
