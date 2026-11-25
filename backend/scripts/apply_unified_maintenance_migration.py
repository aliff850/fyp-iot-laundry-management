"""Apply additive migration 015_unified_maintenance_and_lpg_modes.sql."""

from pathlib import Path
import sys

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from onboarding import _configuration


def main() -> None:
    migration = (
        Path(__file__).resolve().parents[1]
        / "migrations"
        / "015_unified_maintenance_and_lpg_modes.sql"
    )
    sql = migration.read_text(encoding="utf-8").replace("begin;", "", 1).rsplit("commit;", 1)[0]
    _, _, dsn = _configuration()

    with psycopg.connect(dsn, connect_timeout=5) as conn:
        before = conn.execute(
            """select
                to_regclass('public.machine_maintenance_logs') is not null,
                to_regclass('public.lpg_maintenance_sessions') is not null,
                to_regclass('public.lpg_commands') is not null"""
        ).fetchone()
        if not before or not all(before):
            raise RuntimeError("Required prerequisite tables are absent; no migration applied")

        conn.execute(sql)

        check_row = conn.execute(
            """select pg_get_constraintdef(oid)
               from pg_constraint
               where conrelid = 'public.lpg_commands'::regclass
                 and conname = 'lpg_commands_action_check'"""
        ).fetchone()
        if not check_row or "start_maintenance" not in check_row[0] or "complete_maintenance" not in check_row[0]:
            raise RuntimeError("lpg_commands_action_check verification failed")

        cols = conn.execute(
            """select column_name
               from information_schema.columns
               where table_schema = 'public'
                 and table_name = 'machine_maintenance_logs'
                 and column_name in ('domain', 'log_kind', 'lpg_session_id')"""
        ).fetchall()
        if len(cols) != 3:
            raise RuntimeError("machine_maintenance_logs new columns verification failed")

        conn.commit()
    print("Applied 015_unified_maintenance_and_lpg_modes.sql and verified constraints/columns.")


if __name__ == "__main__":
    main()
