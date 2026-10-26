import urllib.request
import json

BASE = "http://127.0.0.1:8000"

def test_endpoint(path, method="GET", data=None):
    url = f"{BASE}{path}"
    headers = {"Content-Type": "application/json"}
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode("utf-8")
            return response.status, json.loads(res_body)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")
    except Exception as e:
        return 0, str(e)

if __name__ == "__main__":
    print("Testing backend endpoints directly against in-memory models...")
    import sys
    sys.path.append(r"c:\Users\admin\Desktop\Code\FYP-smart-laundry\backend")
    import main
    from fastapi.testclient import TestClient

    client = TestClient(main.app)

    # 1. Test /branches
    r1 = client.get("/branches")
    assert r1.status_code == 200, f"Failed /branches: {r1.status_code}"
    branches = r1.json()
    assert len(branches) >= 2, "Expected at least 2 branches"
    print(f"PASS: /branches returns {len(branches)} branches")

    # 2. Test /branches/{id}/dashboard
    r2 = client.get("/branches/msu-shah-alam/dashboard")
    assert r2.status_code == 200, f"Failed /branches/msu-shah-alam/dashboard: {r2.status_code}"
    dash = r2.json()
    assert "washers" in dash and "dryers" in dash and "lpg_manifold" in dash
    assert len(dash["washers"]) == 4 and len(dash["dryers"]) == 4
    assert len(dash["lpg_manifold"]) == 4
    print("PASS: /branches/msu-shah-alam/dashboard has segregated washers, dryers, and LPG manifold")

    # 3. Test /branches/{id}/lpg
    r3 = client.get("/branches/msu-shah-alam/lpg")
    assert r3.status_code == 200
    lpg = r3.json()
    assert len(lpg) == 4
    print(f"PASS: /branches/msu-shah-alam/lpg returns {len(lpg)} cylinders")

    # 4. Test LPG Maintenance mode toggle & tare
    r4 = client.post("/branches/msu-shah-alam/lpg/CYL-01/maintenance", json={"enabled": True, "action": "tare_full"})
    assert r4.status_code == 200
    assert r4.json()["cylinder"]["weight_kg"] == 50.0
    print("PASS: /branches/msu-shah-alam/lpg/CYL-01/maintenance toggles mode and tare_full (50.0kg)")

    # 5. Test /machines/{id}/commands (start, pause, stop, unlock)
    r5 = client.post("/machines/W-02/commands", json={"command": "start"})
    assert r5.status_code == 200
    assert r5.json()["machine"]["status"] == "RUNNING"
    print("PASS: /machines/W-02/commands start")

    r5_unlock = client.post("/machines/W-02/commands", json={"command": "unlock"})
    assert r5_unlock.status_code == 200
    assert r5_unlock.json()["machine"]["parameters"]["door_locked"] == False
    print("PASS: /machines/W-02/commands unlock")

    # 6. Test /machines/{id}/parameters update
    r6 = client.put("/machines/W-02/parameters", json={
        "price": 7.50,
        "duration_mins": 35,
        "temp_celsius": 60,
        "water_level": "High",
        "spin_speed": 1200,
        "door_locked": True
    })
    assert r6.status_code == 200
    assert r6.json()["parameters"]["price"] == 7.50
    print("PASS: /machines/W-02/parameters updated price to RM 7.50")

    # 7. Test /branches/{id}/analytics
    r7 = client.get("/branches/msu-shah-alam/analytics?timeframe=daily")
    assert r7.status_code == 200
    analytics = r7.json()
    assert "revenue_myr" in analytics and "gas_efficiency_kg_per_cycle" in analytics
    print(f"PASS: /branches/msu-shah-alam/analytics gas efficiency: {analytics['gas_efficiency_kg_per_cycle']} kg/cycle")

    # 8. Test /machines/{id}/maintenance-log
    r8 = client.post("/machines/W-04/maintenance-log", json={
        "id": "LOG-TEST",
        "machine_id": "W-04",
        "technician_name": "Test Technician",
        "action_taken": "Cleaned filter screen and cleared error",
        "fault_code": "E01",
        "timestamp": "2026-10-09T00:00:00Z"
    })
    assert r8.status_code == 200
    print("PASS: /machines/W-04/maintenance-log successfully recorded")

    # 9. Test /api/v1/telemetry/batch with Bearer auth & X-Branch-ID (PRD §5.3 & TI-03)
    batch_payload = {
        "branch_id": "msu-shah-alam",
        "batch": [
            {
                "edge_record_id": 501,
                "device_id": "ESP32-ENV",
                "recorded_at": "2026-10-23T00:10:00Z",
                "data": {"voltage": 0.95, "temperature": 27.2, "humidity": 68.0}
            },
            {
                "edge_record_id": 502,
                "device_id": "ESP32-LPG",
                "recorded_at": "2026-10-23T00:10:00Z",
                "data": {
                    "cylinders": [
                        {"cylinder_id": "CYL-01", "weight_kg": 42.0}
                    ]
                }
            }
        ]
    }
    r9 = client.post(
        "/api/v1/telemetry/batch",
        headers={"Authorization": "Bearer spinsense-edge-gw-default", "X-Branch-ID": "msu-shah-alam"},
        json=batch_payload
    )
    assert r9.status_code == 200, f"Batch sync failed: {r9.status_code} {r9.text}"
    b_res = r9.json()
    assert b_res["status"] == "success"
    assert b_res["processed_records"] == 2
    assert 501 in b_res["accepted_ids"] and 502 in b_res["accepted_ids"]
    assert b_res["rejected_ids"] == []
    print("PASS: /api/v1/telemetry/batch accepted and acknowledged 2 records")

    # 10. Test Idempotency: re-sending the same batch returns accepted_ids without duplicate errors
    r10 = client.post(
        "/api/v1/telemetry/batch",
        headers={"Authorization": "Bearer spinsense-edge-gw-default", "X-Branch-ID": "msu-shah-alam"},
        json=batch_payload
    )
    assert r10.status_code == 200
    assert 501 in r10.json()["accepted_ids"] and 502 in r10.json()["accepted_ids"]
    print("PASS: /api/v1/telemetry/batch idempotency verified (re-sent IDs acknowledged)")

    # 11. Test Quarantine & Partial Rejection: malformed data payload
    malformed_payload = {
        "branch_id": "msu-shah-alam",
        "batch": [
            {
                "edge_record_id": 503,
                "device_id": "ESP32-ENV",
                "recorded_at": "2026-10-23T00:11:00Z",
                "data": {"voltage": 1.0}
            },
            {
                "edge_record_id": 504,
                "device_id": "",  # Missing device_id -> should be rejected/quarantined
                "recorded_at": "2026-10-23T00:11:00Z",
                "data": {"voltage": 1.0}
            }
        ]
    }
    r11 = client.post(
        "/api/v1/telemetry/batch",
        headers={"Authorization": "Bearer spinsense-edge-gw-default", "X-Branch-ID": "msu-shah-alam"},
        json=malformed_payload
    )
    assert r11.status_code == 200
    r11_json = r11.json()
    assert 503 in r11_json["accepted_ids"]
    assert 504 in r11_json["rejected_ids"]
    assert "504" in r11_json["quarantine_reasons"]
    print("PASS: /api/v1/telemetry/batch partial rejection & quarantine verified")

    # 12. Test Gateway Authentication Failure: invalid Bearer token
    r12 = client.post(
        "/api/v1/telemetry/batch",
        headers={"Authorization": "Bearer invalid-token", "X-Branch-ID": "msu-shah-alam"},
        json=batch_payload
    )
    assert r12.status_code == 401, f"Expected 401, got {r12.status_code}"
    print("PASS: /api/v1/telemetry/batch rejected invalid gateway credentials (401)")

    print("\nALL BACKEND API TESTS PASSED SUCCESSFULLY!")
