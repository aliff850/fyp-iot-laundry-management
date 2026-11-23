"""Read-only, redacted live Pi checkout counters for deployment diagnosis."""
from pathlib import Path
import pymysql


def main():
    root = Path(__file__).resolve().parents[1]
    gateway_root = root.parent if root.name.startswith("staging-") else root
    values = {}
    for line in (gateway_root / ".env").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"')
    conn = pymysql.connect(host=values.get("SPINSENSE_DB_HOST", "localhost"),
        user=values["SPINSENSE_DB_USER"], password=values["SPINSENSE_DB_PASSWORD"],
        database="edge_iot", init_command="SET time_zone = '+00:00'")
    try:
        with conn.cursor() as cur:
            cur.execute("""SELECT COUNT(*), SUM(confirmed_at IS NOT NULL), SUM(command_id IS NOT NULL),
                SUM(expires_at>UTC_TIMESTAMP(6) AND confirmed_at IS NULL)
                FROM demo_checkouts""")
            total, confirmed, commands, active = cur.fetchone()
            print(f"Live demo checkouts: total={total}, confirmed={confirmed or 0}, commands={commands or 0}, active={active or 0}")
            cur.execute("""SELECT program_id,request_id IS NOT NULL,
                TIMESTAMPDIFF(SECOND,UTC_TIMESTAMP(6),expires_at)
                FROM demo_checkouts WHERE confirmed_at IS NULL
                AND expires_at>UTC_TIMESTAMP(6) ORDER BY created_at DESC LIMIT 1""")
            pending = cur.fetchone()
            if pending:
                print(f"Active checkout: program={pending[0]}, terminal_request={bool(pending[1])}, seconds_left={pending[2]}")
            cur.execute("""SELECT m.status, COUNT(*) FROM demo_checkouts c
                JOIN machine_commands m ON m.command_id=c.command_id GROUP BY m.status""")
            print("Demo START command states:", ", ".join(f"{status}={count}" for status, count in cur.fetchall()) or "none")
            cur.execute("""SELECT outcome, COUNT(*) FROM machine_cycles WHERE source_id='washer-sim-01'
                GROUP BY outcome""")
            print("Recorded washer outcomes:", ", ".join(f"{outcome}={count}" for outcome, count in cur.fetchall()) or "none")
            cur.execute("""SELECT c.checkout_id,c.program_id,c.price_myr,m.command_id,m.status,
                m.issued_at,m.result_at FROM demo_checkouts c JOIN machine_commands m
                ON m.command_id=c.command_id ORDER BY c.confirmed_at DESC LIMIT 1""")
            latest = cur.fetchone()
            if latest:
                print("Latest confirmed checkout:", latest[0], latest[1], f"RM {latest[2]}",
                      "command", latest[3], latest[4], "issued", latest[5], "result", latest[6])
                cur.execute("""SELECT cycle_id,program_id,price_myr,running_seconds,outcome,
                    started_at,finished_at FROM machine_cycles WHERE source_id='washer-sim-01'
                    AND started_at BETWEEN %s - INTERVAL 2 SECOND AND %s + INTERVAL 10 SECOND
                    ORDER BY started_at DESC LIMIT 3""", (latest[5], latest[6] or latest[5]))
                for cycle in cur.fetchall():
                    print("Nearby recorded cycle:", cycle)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
