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

    print("\nALL BACKEND API TESTS PASSED SUCCESSFULLY!")
