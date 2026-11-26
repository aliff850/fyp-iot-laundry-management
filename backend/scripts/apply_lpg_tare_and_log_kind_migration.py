"""Apply additive migration 016_lpg_tare_and_log_kind_constraints.sql to Supabase PostgreSQL."""

from pathlib import Path
import sys

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from onboarding import _configuration


def main() -> None:
    migration = (
        Path(__file__).resolve().parents[1]
        / "migrations"
        / "016_lpg_tare_and_log_kind_constraints.sql"
    )
    sql = migration.read_text(encoding="utf-8").replace("begin;", "", 1).rsplit("commit;", 1)[0]
    _, _, dsn = _configuration()

    with psycopg.connect(dsn, connect_timeout=5) as conn:
        for table in ("public.lpg_commands", "public.machine_maintenance_logs"):
            exists = conn.execute("select to_regclass(%s) is not null", (table,)).fetchone()
            if not exists or not exists[0]:
                raise RuntimeError(f"{table} is absent; no migration applied")

        try:
            conn.execute(sql)
            cmd_check = conn.execute(
                """select pg_get_constraintdef(oid)
                   from pg_constraint
                   where conrelid = 'public.lpg_commands'::regclass
                     and conname = 'lpg_commands_action_check'"""
            ).fetchone()
            if not cmd_check or "set_tare_weight" not in cmd_check[0]:
                raise RuntimeError("lpg_commands_action_check update verification failed")

            log_check = conn.execute(
                """select pg_get_constraintdef(oid)
                   from pg_constraint
                   where conrelid = 'public.machine_maintenance_logs'::regclass
                     and conname = 'machine_maintenance_logs_log_kind_check'"""
            ).fetchone()
            if (
                not log_check
                or "gas_calibration" not in log_check[0]
                or "set_tare_weight" not in log_check[0]
            ):
                raise RuntimeError("machine_maintenance_logs_log_kind_check update verification failed")

            conn.commit()
        except BaseException:
            conn.rollback()
            raise

    print(
        "Migration 016 committed: lpg_commands_action_check and "
        "machine_maintenance_logs_log_kind_check updated"
    )


if __name__ == "__main__":
    main()
