"""Close the explicitly selected test branch after a remote command check."""

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from onboarding import _database


BRANCH_ID = "dbf2290f-9cc3-4c9b-85fc-b9496f0840f6"


def main():
    with _database() as conn:
        row = conn.execute("""update public.branches
            set service_status='closed'
            where id=%s and service_status='open'
            returning id""", (BRANCH_ID,)).fetchone()
    print("test_branch_3_closed=" + str(bool(row)))


if __name__ == "__main__":
    main()
