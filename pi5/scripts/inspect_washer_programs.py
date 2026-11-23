"""Print only saved non-secret washer program settings for ESP32 transfer."""
import json
import sqlite3


def main():
    path = "/var/lib/spinsense/machines/washer-sim-01.sqlite"
    with sqlite3.connect(f"file:{path}?mode=ro", uri=True) as conn:
        row = conn.execute("SELECT payload FROM machine_state WHERE id=1").fetchone()
    state = json.loads(row[0])
    if state.get("source_id") != "washer-sim-01":
        raise RuntimeError("Unexpected machine identity")
    print(json.dumps(state["programs"], sort_keys=True))


if __name__ == "__main__":
    main()
