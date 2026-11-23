"""Read-only Supabase migration 005 status without printing connection details."""

from pathlib import Path
import sys

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from onboarding import _configuration


def main():
    _, _, dsn = _configuration()
    with psycopg.connect(dsn, connect_timeout=5) as conn:
        rows = conn.execute("""select
            to_regclass('public.machine_latest') is not null,
            to_regclass('public.machine_commands') is not null""").fetchone()
    print(f"machine_latest_present={rows[0]} machine_commands_present={rows[1]}")


if __name__ == "__main__":
    main()
