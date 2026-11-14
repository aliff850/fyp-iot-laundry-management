"""Open only the explicitly selected branch for one authorized command test."""

from onboarding import _database


BRANCH_ID = "dbf2290f-9cc3-4c9b-85fc-b9496f0840f6"


def main():
    with _database() as conn:
        row = conn.execute("""update public.branches set service_status='open'
            where id=%s and service_status='closed' returning id""", (BRANCH_ID,)).fetchone()
    print("test_branch_3_opened=" + str(bool(row)))


if __name__ == "__main__":
    main()
