"""Check unpaid checkout cancellation against the isolated Pi rehearsal database."""
import os
import uuid

import pymysql
from pymysql.cursors import DictCursor

import demo_checkout


def main():
    with open(".env", encoding="utf-8") as config:
        for line in config:
            if line.startswith("SPINSENSE_DB_") and "=" in line:
                key, value = line.strip().split("=", 1)
                os.environ.setdefault(key, value.strip("\"'"))
    checkout_id = str(uuid.uuid4())
    request_id = str(uuid.uuid4())
    token = "cancel-rehearsal-" + str(uuid.uuid4())
    conn = pymysql.connect(
        host=os.getenv("SPINSENSE_DB_HOST", "localhost"),
        user=os.getenv("SPINSENSE_DB_USER", "edge_user"),
        password=os.environ["SPINSENSE_DB_PASSWORD"],
        database="edge_iot_demo_test_20261113",
        cursorclass=DictCursor,
        init_command="SET time_zone = '+00:00'",
    )
    try:
        with conn.cursor() as cursor:
            cursor.execute("""INSERT INTO demo_checkouts
                (checkout_id,token_hash,request_id,gateway_id,source_id,program_id,
                 price_myr,settings_hash,created_at,expires_at)
                VALUES (%s,%s,%s,%s,%s,'quick',4.00,%s,
                        UTC_TIMESTAMP(6),UTC_TIMESTAMP(6)+INTERVAL 5 MINUTE)""",
                (checkout_id, demo_checkout.token_hash(token), request_id,
                 "rehearsal-gateway", "washer-sim-01", "0" * 64))
        conn.commit()
        assert demo_checkout.cancel_request(conn, "foreign-gateway", "washer-sim-01", request_id) == "missing"
        assert demo_checkout.cancel_request(conn, "rehearsal-gateway", "washer-sim-01", request_id) == "cancelled"
        assert demo_checkout.cancel_request(conn, "rehearsal-gateway", "washer-sim-01", request_id) == "expired"
        try:
            demo_checkout.confirm(conn, token, "rehearsal-gateway")
        except ValueError as error:
            assert str(error) == "Checkout expired"
        else:
            raise AssertionError("Cancelled checkout unexpectedly confirmed")
        print("Isolated cancellation, retry and foreign-gateway checks passed")
    finally:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM demo_checkouts WHERE checkout_id=%s", (checkout_id,))
        conn.commit()
        conn.close()


if __name__ == "__main__":
    main()
