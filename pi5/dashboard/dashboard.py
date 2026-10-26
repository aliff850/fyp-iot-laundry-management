import json
import os
from flask import Flask, jsonify, render_template
import pymysql
from pymysql.cursors import DictCursor

app = Flask(__name__)

# --- Database Configuration (Aligned with ingestion_worker & sync_worker) ---
DB_HOST = os.getenv("SPINSENSE_DB_HOST", "localhost")
DB_USER = os.getenv("SPINSENSE_DB_USER", "edge_user")
DB_PASSWORD = os.getenv("SPINSENSE_DB_PASSWORD", "volvo850chungus")
DB_NAME = os.getenv("SPINSENSE_DB_NAME", "edge_iot")


def get_db_connection():
    return pymysql.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        cursorclass=DictCursor,
        connect_timeout=5,
    )


def safe_parse_payload(payload_str):
    if isinstance(payload_str, dict):
        return payload_str
    if isinstance(payload_str, str):
        try:
            return json.loads(payload_str)
        except json.JSONDecodeError:
            return {"error": "corrupted_payload"}
    return {}


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/telemetry/latest")
def get_latest():
    try:
        conn = get_db_connection()
    except Exception as e:
        return jsonify({"error": f"Database connection failed: {str(e)}"}), 500

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id, device_id, recorded_at, is_synced, data_payload "
                "FROM sensor_telemetry ORDER BY id DESC LIMIT 1"
            )
            row = cursor.fetchone()
            if row:
                row["data"] = safe_parse_payload(row["data_payload"])
                row["recorded_at"] = str(row["recorded_at"])
                del row["data_payload"]
                return jsonify(row)
            return jsonify({"error": "No records found"}), 404
    finally:
        conn.close()


@app.route("/api/telemetry/history")
def get_history():
    try:
        conn = get_db_connection()
    except Exception as e:
        return jsonify({"error": f"Database connection failed: {str(e)}"}), 500

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id, device_id, recorded_at, is_synced, data_payload "
                "FROM sensor_telemetry ORDER BY id DESC LIMIT 20"
            )
            rows = cursor.fetchall()
            for r in rows:
                r["data"] = safe_parse_payload(r["data_payload"])
                r["recorded_at"] = str(r["recorded_at"])
                del r["data_payload"]
            return jsonify(rows)
    finally:
        conn.close()


@app.route("/api/health")
def health():
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("SELECT 1;")
        conn.close()
        return jsonify({"status": "healthy", "database": "connected"}), 200
    except Exception as e:
        return jsonify({"status": "degraded", "database": str(e)}), 503


if __name__ == "__main__":
    # Binding to 0.0.0.0 makes the dashboard accessible across the entire local network
    app.run(host="0.0.0.0", port=5000)