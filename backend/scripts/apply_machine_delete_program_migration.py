"""Apply additive migration 013_machine_delete_program.sql to Supabase PostgreSQL."""

from pathlib import Path
import sys

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from onboarding import _configuration


def main() -> None:
    migration = (
        Path(__file__).resolve().parents[1]
        / "migrations"
        / "013_machine_delete_program.sql"
    )
    sql = migration.read_text(encoding="utf-8").replace("begin;", "", 1).rsplit("commit;", 1)[0]
    _, _, dsn = _configuration()

    with psycopg.connect(dsn, connect_timeout=5) as conn:
        exists = conn.execute(
            "select to_regclass('public.machine_commands') is not null"
        ).fetchone()
        if not exists or not exists[0]:
            raise RuntimeError("public.machine_commands is absent; no migration applied")

        try:
            conn.execute(sql)
            check_row = conn.execute(
                """select pg_get_constraintdef(oid)
                   from pg_constraint
                   where conrelid = 'public.machine_commands'::regclass
                     and conname = 'machine_commands_action_check'"""
            ).fetchone()
            if not check_row or "delete_program" not in check_row[0]:
                raise RuntimeError("machine_commands_action_check update verification failed")
            conn.commit()
        except BaseException:
            conn.rollback()
            raise

    print("Migration 013 committed: machine_commands_action_check now allows delete_program")


if __name__ == "__main__":
    main()
